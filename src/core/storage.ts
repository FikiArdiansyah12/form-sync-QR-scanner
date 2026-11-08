/**
 * FormSync Attendance System - Storage & Persistence Silo
 * Menangani penyimpanan acara terisolasi (per-event namespace), perhitungan metrik kehadiran,
 * manajemen sesi bertingkat kustom (custom checkpoints), matriks cross-check,
 * dan ekspor data ke format CSV.
 */

import {
  type Attendee,
  type AttendanceSession,
  type AttendanceStats,
  type CheckInValidationResult,
  type CrossCheckFilterType,
  type SessionType,
  type WorkspaceEventConfig,
} from "./types";
import { normalizeEventCode } from "./eventCodeGenerator";
import { validateTicketForEvent, validateTicketForSession } from "./securityLock";

const STORAGE_PREFIX = "formsync_event_";
const ACTIVE_EVENT_KEY = "formsync_current_active_event_code";

/**
 * Konfigurasi awal acara murni bersih tanpa data dummy dan tanpa checkpoint default.
 * Seluruh checkpoint dan peserta dikonfigurasi secara kustom dan fleksibel oleh pengguna.
 */
export const DEFAULT_DEMO_EVENT: WorkspaceEventConfig = {
  eventCode: "FS9K-7M2P",
  eventName: "Attendance Workspace",
  eventDate: new Date().toISOString().split("T")[0],
  location: "Main Gate",
  isActive: true,
  isLocked: false,
  securitySecret: "workspace-auth-secret",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  sessions: [], // Murni kosong: Tidak ada checkpoint default bawaan
  activeSessionId: "",
  attendees: [], // Murni kosong: Tidak ada peserta dummy
};

/**
 * Mengambil key namespace localStorage untuk acara tertentu.
 */
function getStorageKey(eventCode: string): string {
  return `${STORAGE_PREFIX}${normalizeEventCode(eventCode)}`;
}

/**
 * Memuat konfigurasi acara dari localStorage berdasarkan kode 8-digit.
 * Otomatis mendeteksi dan membersihkan residu data dummy lama agar state selalu murni.
 *
 * @param eventCode - Kode acara 8-digit
 * @returns Konfigurasi acara jika ditemukan, atau null jika belum ada
 */
export function loadEventFromStorage(
  eventCode: string
): WorkspaceEventConfig | null {
  if (!eventCode || typeof window === "undefined") return null;
  const key = getStorageKey(eventCode);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      if (normalizeEventCode(eventCode) === normalizeEventCode(DEFAULT_DEMO_EVENT.eventCode)) {
        saveEventToStorage(DEFAULT_DEMO_EVENT);
        return DEFAULT_DEMO_EVENT;
      }
      return null;
    }
    const parsed = JSON.parse(raw) as WorkspaceEventConfig;

    // DETEKSI DATA RESIDU LAMA: Bersihkan data dummy lama (Budi Santoso dkk atau 3 sesi default lama)
    const hasOldDummies =
      parsed.attendees?.some((a: any) =>
        ["att-001", "Budi Santoso", "Siti Rahmawati", "Ahmad Fauzi", "Dewi Lestari", "Rian Pratama"].includes(a.name) ||
        ["att-001", "att-002", "att-003", "att-004", "att-005"].includes(a.id)
      ) ||
      (parsed.sessions?.length === 3 &&
        parsed.sessions.some((s: any) => ["morning", "lunch", "souvenir"].includes(s.id)));

    if (hasOldDummies) {
      const cleanEvent: WorkspaceEventConfig = {
        ...DEFAULT_DEMO_EVENT,
        eventCode: parsed.eventCode || eventCode,
        eventName: parsed.eventName || "Attendance Workspace",
        sessions: [],
        attendees: [],
        activeSessionId: "",
      };
      saveEventToStorage(cleanEvent);
      return cleanEvent;
    }

    parsed.sessions = parsed.sessions || [];
    parsed.attendees = parsed.attendees || [];
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Menyimpan konfigurasi acara ke localStorage secara atomik.
 *
 * @param event - Konfigurasi acara yang akan disimpan
 */
export function saveEventToStorage(event: WorkspaceEventConfig): void {
  if (!event || !event.eventCode || typeof window === "undefined") return;
  const key = getStorageKey(event.eventCode);
  try {
    const payload = {
      ...event,
      sessions: event.sessions || [],
      attendees: event.attendees || [],
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(payload));
    localStorage.setItem(ACTIVE_EVENT_KEY, normalizeEventCode(event.eventCode));
  } catch (err) {
    console.error("Failed to persist event to localStorage:", err);
  }
}

/**
 * Mengambil kode event terakhir yang aktif.
 */
export function getLastActiveEventCode(): string {
  if (typeof window === "undefined") return DEFAULT_DEMO_EVENT.eventCode;
  try {
    const saved = localStorage.getItem(ACTIVE_EVENT_KEY);
    if (saved) return saved;
  } catch {}
  return DEFAULT_DEMO_EVENT.eventCode;
}

/**
 * Menghitung ringkasan statistik kehadiran acara.
 *
 * @param attendees - Daftar peserta acara
 * @returns Metrik ringkasan kehadiran (total, hadir, pending, persentase)
 */
export function calculateAttendanceStats(attendees: Attendee[]): AttendanceStats {
  if (!attendees || attendees.length === 0) {
    return { total: 0, present: 0, pending: 0, percentage: 0 };
  }

  const total = attendees.length;
  const present = attendees.filter((a) => a.status === "present").length;
  const pending = total - present;
  const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

  return { total, present, pending, percentage };
}

/**
 * Helper internal untuk memperbarui rekaman attendee dan menyimpan perubahan event.
 */
function commitCheckInUpdate(
  event: WorkspaceEventConfig,
  validation: CheckInValidationResult,
  targetSession?: AttendanceSession
): { result: CheckInValidationResult; updatedEvent: WorkspaceEventConfig } {
  if (!validation.success || !validation.attendee) {
    return { result: validation, updatedEvent: event };
  }

  const now = new Date();
  const timeFormatted = now.toTimeString().split(" ")[0]; // "HH:MM:SS"
  const resolvedSessionStatus = targetSession?.type === "redemption" ? ("claimed" as const) : ("present" as const);

  const updatedAttendees = event.attendees.map((a) => {
    if (a.id === validation.attendee!.id) {
      const existingSessions = a.sessions || {};
      const updatedSessions = targetSession
        ? {
            ...existingSessions,
            [targetSession.id]: {
              status: resolvedSessionStatus,
              checkInTime: timeFormatted,
            },
          }
        : existingSessions;

      return {
        ...a,
        status: "present" as const,
        checkInTime: a.checkInTime || timeFormatted,
        sessions: updatedSessions,
      };
    }
    return a;
  });

  const updatedEvent: WorkspaceEventConfig = {
    ...event,
    attendees: updatedAttendees,
    updatedAt: now.toISOString(),
  };

  saveEventToStorage(updatedEvent);

  return {
    result: {
      ...validation,
      attendee: {
        ...validation.attendee,
        status: "present",
        checkInTime: timeFormatted,
      },
    },
    updatedEvent,
  };
}

/**
 * Memproses validasi dan check-in tiket peserta acara.
 *
 * @param event - Konfigurasi acara saat ini
 * @param ticketCode - Kode tiket yang di-scan
 * @returns Hasil validasi dan konfigurasi acara yang telah terupdate
 */
export function processCheckIn(
  event: WorkspaceEventConfig,
  ticketCode: string
): { result: CheckInValidationResult; updatedEvent: WorkspaceEventConfig } {
  const validation = validateTicketForEvent(ticketCode, event);
  return commitCheckInUpdate(event, validation);
}

/**
 * Memproses check-in untuk sesi presensi tertentu (Multi-Session Checkpoint).
 *
 * @param event - Konfigurasi acara
 * @param ticketCode - Kode tiket yang di-scan
 * @param sessionId - ID sesi target
 * @returns Hasil validasi dan konfigurasi acara yang telah terupdate
 */
export function processSessionCheckIn(
  event: WorkspaceEventConfig,
  ticketCode: string,
  sessionId?: string
): { result: CheckInValidationResult; updatedEvent: WorkspaceEventConfig } {
  const targetSession = sessionId && event.sessions && event.sessions.length > 0
    ? event.sessions.find((s) => s.id === sessionId)
    : undefined;

  const validation = validateTicketForSession(ticketCode, event, targetSession?.id);
  return commitCheckInUpdate(event, validation, targetSession);
}

/**
 * Membatalkan status check-in peserta (revert).
 *
 * @param event - Konfigurasi acara
 * @param attendeeId - ID unik peserta
 * @param sessionId - Opsi spesifik sesi yang ingin di-revert
 * @returns Konfigurasi acara terupdate
 */
export function revertCheckIn(
  event: WorkspaceEventConfig,
  attendeeId: string,
  sessionId?: string
): WorkspaceEventConfig {
  const updatedAttendees = event.attendees.map((a) => {
    if (a.id === attendeeId) {
      if (sessionId && a.sessions && a.sessions[sessionId]) {
        const newSessions = { ...a.sessions };
        delete newSessions[sessionId];
        const hasOtherActiveSession = Object.values(newSessions).some(
          (s) => s.status === "present" || s.status === "claimed"
        );
        return {
          ...a,
          status: hasOtherActiveSession ? ("present" as const) : ("pending" as const),
          checkInTime: hasOtherActiveSession ? a.checkInTime : undefined,
          sessions: newSessions,
        };
      }

      return {
        ...a,
        status: "pending" as const,
        checkInTime: undefined,
        sessions: sessionId ? a.sessions : {},
      };
    }
    return a;
  });

  const updatedEvent: WorkspaceEventConfig = {
    ...event,
    attendees: updatedAttendees,
    updatedAt: new Date().toISOString(),
  };

  saveEventToStorage(updatedEvent);
  return updatedEvent;
}

/**
 * Menambahkan sesi presensi baru ke dalam acara.
 */
export function addSessionToEvent(
  event: WorkspaceEventConfig,
  name: string,
  type: SessionType = "checkin",
  description?: string
): WorkspaceEventConfig {
  const newId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newSession: AttendanceSession = {
    id: newId,
    name: name.trim(),
    type,
    isActive: true,
    description: description?.trim(),
  };

  const updatedSessions = [...(event.sessions || []), newSession];
  const updatedEvent: WorkspaceEventConfig = {
    ...event,
    sessions: updatedSessions,
    activeSessionId: event.activeSessionId || newId,
    updatedAt: new Date().toISOString(),
  };

  saveEventToStorage(updatedEvent);
  return updatedEvent;
}

/**
 * Mengubah status aktif/nonaktif sesi presensi.
 */
export function toggleSessionStatus(
  event: WorkspaceEventConfig,
  sessionId: string,
  isActive: boolean
): WorkspaceEventConfig {
  const updatedSessions = (event.sessions || []).map((s) => {
    if (s.id === sessionId) {
      return { ...s, isActive };
    }
    return s;
  });

  const updatedEvent: WorkspaceEventConfig = {
    ...event,
    sessions: updatedSessions,
    updatedAt: new Date().toISOString(),
  };

  saveEventToStorage(updatedEvent);
  return updatedEvent;
}

/**
 * Menghapus sesi presensi dari acara.
 */
export function deleteSessionFromEvent(
  event: WorkspaceEventConfig,
  sessionId: string
): WorkspaceEventConfig {
  const updatedSessions = (event.sessions || []).filter((s) => s.id !== sessionId);
  const remainingActiveId =
    event.activeSessionId === sessionId
      ? updatedSessions[0]?.id || ""
      : event.activeSessionId;

  const updatedEvent: WorkspaceEventConfig = {
    ...event,
    sessions: updatedSessions,
    activeSessionId: remainingActiveId,
    updatedAt: new Date().toISOString(),
  };

  saveEventToStorage(updatedEvent);
  return updatedEvent;
}

/**
 * Mengubah status aktif/nonaktif acara secara global.
 */
export function toggleEventStatus(
  event: WorkspaceEventConfig,
  isActive: boolean
): WorkspaceEventConfig {
  const updatedEvent: WorkspaceEventConfig = {
    ...event,
    isActive,
    updatedAt: new Date().toISOString(),
  };

  saveEventToStorage(updatedEvent);
  return updatedEvent;
}

/**
 * Memfilter baris peserta untuk matriks cross-check berdasarkan filter kustom.
 */
export function filterCrossCheckMatrix(
  attendees: Attendee[],
  filterType: CrossCheckFilterType,
  sessions: AttendanceSession[],
  searchQuery: string = ""
): Attendee[] {
  let list = attendees;

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    list = list.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.ticketCode.toLowerCase().includes(q) ||
        (a.organization && a.organization.toLowerCase().includes(q)) ||
        (a.email && a.email.toLowerCase().includes(q))
    );
  }

  if (filterType === "all") {
    return list;
  }

  // Filter peserta yang baru hadir di sesi pertama tetapi belum menyelesaikan sesi lainnya
  if (
    filterType === "present_morning_no_lunch" ||
    (filterType as string) === "morning_only"
  ) {
    if (sessions.length < 2) return list;
    const firstSessionId = sessions[0].id;
    const otherSessions = sessions.slice(1);

    return list.filter((a) => {
      const firstChecked = a.sessions?.[firstSessionId]?.status === "present" || a.sessions?.[firstSessionId]?.status === "claimed";
      const otherChecked = otherSessions.some(
        (s) => a.sessions?.[s.id]?.status === "present" || a.sessions?.[s.id]?.status === "claimed"
      );
      return firstChecked && !otherChecked;
    });
  }

  if (filterType === "completed_all" || (filterType as string) === "completed") {
    return list.filter((a) => {
      if (!sessions || sessions.length === 0) return a.status === "present";
      return sessions.every((sess) => {
        const s = a.sessions?.[sess.id]?.status;
        return s === "present" || s === "claimed";
      });
    });
  }

  if (filterType === "absent") {
    return list.filter((a) => {
      if (a.status === "present") return false;
      if (!a.sessions || Object.keys(a.sessions).length === 0) return true;
      return !Object.values(a.sessions).some(
        (s) => s.status === "present" || s.status === "claimed"
      );
    });
  }

  return list;
}

/**
 * Mengekspor data matriks multi-sesi ke format CSV.
 */
export function exportMatrixToCsv(
  attendees: Attendee[],
  sessions: AttendanceSession[]
): string {
  const headers = [
    "Ticket Code",
    "Name",
    "Organization",
    "Email",
    "Overall Status",
    ...sessions.map((s) => s.name),
  ];

  const rows = attendees.map((att) => {
    const sessionCols = sessions.map((sess) => {
      const rec = att.sessions?.[sess.id];
      if (!rec || rec.status === "pending") return "Pending";
      return `${rec.status === "claimed" ? "Claimed" : "Present"} (${rec.checkInTime || ""})`;
    });

    return [
      `"${att.ticketCode}"`,
      `"${att.name}"`,
      `"${att.organization || ""}"`,
      `"${att.email || ""}"`,
      `"${att.status}"`,
      ...sessionCols.map((c) => `"${c}"`),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Mengekspor data daftar peserta ke format CSV.
 */
export function exportAttendeesToCsv(attendees: Attendee[]): string {
  const headers = [
    "Ticket Code",
    "Name",
    "Organization",
    "Email",
    "Phone",
    "Status",
    "Check-in Time",
    "Table Number",
  ];

  const rows = attendees.map((a) => {
    return [
      `"${a.ticketCode}"`,
      `"${a.name}"`,
      `"${a.organization || ""}"`,
      `"${a.email || ""}"`,
      `"${a.phone || ""}"`,
      `"${a.status}"`,
      `"${a.checkInTime || ""}"`,
      `"${a.tableNumber || ""}"`,
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Helper pencarian attendee untuk reuse lintas komponen tabel.
 */
export function matchesAttendeeSearch(attendee: Attendee, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    attendee.name.toLowerCase().includes(q) ||
    attendee.ticketCode.toLowerCase().includes(q) ||
    (attendee.organization ? attendee.organization.toLowerCase().includes(q) : false) ||
    (attendee.email ? attendee.email.toLowerCase().includes(q) : false)
  );
}
