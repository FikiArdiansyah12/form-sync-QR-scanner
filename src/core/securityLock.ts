/**
 * FormSync Attendance System - Security Lock & Multi-Tenant Isolation
 * Mengatur penyekatan ruang kerja, verifikasi token keamanan, proteksi 1 ID permanen,
 * validasi sesi bertingkat (multi-session check-in), dan pencegahan pemindaian tiket lintas acara.
 */

import {
  type Attendee,
  type CheckInValidationResult,
  type WorkspaceEventConfig,
  type AttendanceSession,
} from "./types";
import { normalizeEventCode } from "./eventCodeGenerator";

/**
 * Memvalidasi apakah tiket dapat diproses pada acara tertentu.
 * Menjamin isolasi penuh: Tiket Acara A ditolak seketika pada scanner Acara B.
 *
 * @param scannedCode - Kode yang terbaca dari pemindai QR atau input manual
 * @param event - Konfigurasi acara yang sedang aktif
 * @returns Hasil validasi lengkap beserta pesan status
 */
export function validateTicketForEvent(
  scannedCode: string,
  event: WorkspaceEventConfig
): CheckInValidationResult {
  return validateTicketForSession(scannedCode, event, undefined);
}

/**
 * Memvalidasi apakah tiket dapat diproses pada sesi acara tertentu (misal: Morning, Lunch, Souvenir).
 * Menjamin proteksi anti double-claim pada sesi yang sama tanpa menghalangi sesi lainnya.
 *
 * @param scannedCode - Kode tiket yang dipindai
 * @param event - Konfigurasi acara saat ini
 * @param targetSessionId - ID sesi presensi spesifik (opsional)
 * @returns Hasil validasi presensi untuk sesi yang dituju
 */
export function validateTicketForSession(
  scannedCode: string,
  event: WorkspaceEventConfig,
  targetSessionId?: string
): CheckInValidationResult {
  // 1. Periksa sakelar global acara (Active / Inactive Kill Switch)
  if (!event.isActive) {
    return {
      success: false,
      status: "event_inactive",
      message: "Event is currently inactive. Check-in is paused by administrator.",
    };
  }

  if (!scannedCode || typeof scannedCode !== "string") {
    return {
      success: false,
      status: "not_found",
      message: "Empty ticket code provided.",
    };
  }

  // 2. Jika sesi spesifik ditargetkan, periksa apakah sesi tersebut aktif
  let activeSession: AttendanceSession | undefined;
  if (targetSessionId && event.sessions && event.sessions.length > 0) {
    activeSession = event.sessions.find((s) => s.id === targetSessionId);
    if (activeSession && !activeSession.isActive) {
      return {
        success: false,
        status: "session_inactive",
        message: `Session "${activeSession.name}" is currently inactive. Check-in is closed.`,
        sessionId: targetSessionId,
        sessionName: activeSession.name,
      };
    }
  }

  const cleanScanned = scannedCode.trim();
  const currentEventClean = normalizeEventCode(event.eventCode);

  // 3. Deteksi pemindaian tiket lintas acara (Cross-Event Mismatch)
  // Format tiket bertanda tangan acara: "FS9K-7M2P:TKT-001"
  if (cleanScanned.includes(":")) {
    const parts = cleanScanned.split(":");
    const scannedEventPrefix = normalizeEventCode(parts[0]);
    if (scannedEventPrefix && scannedEventPrefix !== currentEventClean) {
      return {
        success: false,
        status: "event_mismatch",
        message: "Invalid Ticket: This ticket belongs to a different event.",
      };
    }
  }

  // Ekstrak ID tiket bersih jika mengandung prefix
  const pureTicketCode = cleanScanned.includes(":")
    ? cleanScanned.split(":")[1].trim()
    : cleanScanned;

  // 4. Cari peserta dalam direktori acara ini
  const attendee = event.attendees.find((a) => {
    const ticketMatch =
      a.ticketCode.toLowerCase() === pureTicketCode.toLowerCase() ||
      a.ticketCode.toLowerCase() === cleanScanned.toLowerCase();
    const idMatch = a.id.toLowerCase() === pureTicketCode.toLowerCase();
    return ticketMatch || idMatch;
  });

  if (!attendee) {
    return {
      success: false,
      status: "not_found",
      message: "Ticket not found in this event directory.",
    };
  }

  // 5. Validasi status presensi berdasarkan sesi spesifik
  if (targetSessionId && activeSession) {
    const sessionRecord = attendee.sessions?.[targetSessionId];
    if (sessionRecord && (sessionRecord.status === "present" || sessionRecord.status === "claimed")) {
      const timeInfo = sessionRecord.checkInTime ? ` at ${sessionRecord.checkInTime}` : "";
      const actionName = activeSession.type === "redemption" ? "Already claimed" : "Already checked in";
      return {
        success: false,
        status: "already_checked_in",
        message: `${actionName} for "${activeSession.name}"${timeInfo}.`,
        sessionId: targetSessionId,
        sessionName: activeSession.name,
        attendee,
      };
    }

    // Jika peserta sudah berstatus present secara umum dan tidak ada record sesi spesifik (misal sesi checkin default)
    if (attendee.status === "present" && (!attendee.sessions || Object.keys(attendee.sessions).length === 0) && activeSession.type === "checkin") {
      const timeInfo = attendee.checkInTime ? ` at ${attendee.checkInTime}` : "";
      return {
        success: false,
        status: "already_checked_in",
        message: `Already checked in${timeInfo}.`,
        sessionId: targetSessionId,
        sessionName: activeSession.name,
        attendee,
      };
    }

    return {
      success: true,
      status: "checked_in",
      message: `${activeSession.type === "redemption" ? "Claim confirmed" : "Check-in confirmed"} for ${attendee.name}.`,
      sessionId: targetSessionId,
      sessionName: activeSession.name,
      attendee,
    };
  }

  // 6. Validasi status presensi utama (Fallback backward-compatible)
  if (attendee.status === "present") {
    const timeInfo = attendee.checkInTime ? ` at ${attendee.checkInTime}` : "";
    return {
      success: false,
      status: "already_checked_in",
      message: `Already checked in${timeInfo}.`,
      attendee,
    };
  }

  return {
    success: true,
    status: "checked_in",
    message: `Check-in confirmed for ${attendee.name}.`,
    attendee,
  };
}

/**
 * Memvalidasi apakah token keamanan workspace valid saat menerima request webhook.
 *
 * @param providedSecret - Secret yang dikirim dari klien / webhook
 * @param expectedSecret - Secret resmi yang tersimpan di workspace
 * @returns True jika token cocok dan valid
 */
export function verifyWorkspaceSecret(
  providedSecret: string,
  expectedSecret: string
): boolean {
  if (!providedSecret || !expectedSecret) return false;
  return providedSecret.trim() === expectedSecret.trim();
}
