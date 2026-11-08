/**
 * FormSync Attendance System - Core Types
 * Kontrak tipe data untuk peserta, konfigurasi workspace, sesi presensi multi-checkpoint,
 * hasil validasi tiket, dan penyekatan multi-tenant antar-acara.
 */

export type AttendanceStatus = "present" | "pending";
export type SessionCheckInStatus = "present" | "claimed" | "pending";
export type SessionType = "checkin" | "redemption";

export interface AttendanceSession {
  /**
   * Pengidentifikasi unik sesi (misal: "morning", "lunch", "souvenir")
   */
  id: string;

  /**
   * Nama tampilan sesi (misal: "Morning Check-In", "Lunch Box Claim")
   */
  name: string;

  /**
   * Tipe validasi sesi: checkin registrasi atau redemption penukaran kupon/souvenir
   */
  type: SessionType;

  /**
   * Sakelar aktif/nonaktif sesi ini secara individual
   */
  isActive: boolean;

  /**
   * Deskripsi singkat atau jam operasional sesi (opsional)
   */
  description?: string;
}

export interface AttendeeSessionRecord {
  status: SessionCheckInStatus;
  checkInTime?: string;
}

export interface Attendee {
  /**
   * Pengidentifikasi unik peserta (misal: "att-001")
   */
  id: string;

  /**
   * Kode tiket yang dicetak pada QR barcode (misal: "FS9K-7M2P:TKT-001" atau "TKT-001")
   */
  ticketCode: string;

  /**
   * Nama lengkap peserta
   */
  name: string;

  /**
   * Organisasi / Perusahaan / Instansi asal peserta
   */
  organization?: string;

  /**
   * Email peserta
   */
  email?: string;

  /**
   * Nomor telepon / WhatsApp peserta
   */
  phone?: string;

  /**
   * Status kehadiran utama (backward-compatible)
   */
  status: AttendanceStatus;

  /**
   * Stempel waktu ISO saat check-in utama berhasil
   */
  checkInTime?: string;

  /**
   * Nomor meja / kursi (opsional)
   */
  tableNumber?: string;

  /**
   * Catatan tambahan (opsional)
   */
  notes?: string;

  /**
   * Status dan waktu presensi per sesi (misal: { morning: { status: 'present', checkInTime: '08:30:15' } })
   */
  sessions?: Record<string, AttendeeSessionRecord>;
}

export interface WorkspaceEventConfig {
  /**
   * Kode acara 8-digit unik (format: "XXXX-YYYY")
   */
  eventCode: string;

  /**
   * Nama acara
   */
  eventName: string;

  /**
   * Tanggal pelaksanaan acara
   */
  eventDate: string;

  /**
   * Lokasi acara
   */
  location?: string;

  /**
   * Sakelar aktif/nonaktif global dari dashboard spreadsheet
   * Jika false, seluruh scanner lapangan ditolak
   */
  isActive: boolean;

  /**
   * Status proteksi 1 ID acara terkunci
   */
  isLocked: boolean;

  /**
   * Token otorisasi rahasia workspace untuk webhook
   */
  securitySecret: string;

  /**
   * PIN keamanan operator opsional (4-8 digit).
   * Jika diset, panitia lapangan wajib memasukkan PIN ini sebelum membuka scanner.
   * Jika kosong/tidak diset, akses pemindai bersifat terbuka (open access).
   */
  pin?: string;

  /**
   * URL Webhook Google Apps Script terhubung (opsional)
   */
  spreadsheetWebhookUrl?: string;

  /**
   * Daftar sesi presensi multi-checkpoint dalam acara ini
   */
  sessions: AttendanceSession[];

  /**
   * ID sesi yang sedang aktif dipilih saat ini di kontrol panel
   */
  activeSessionId?: string;

  /**
   * Tanggal dibuat
   */
  createdAt: string;

  /**
   * Tanggal pembaruan terakhir
   */
  updatedAt: string;

  /**
   * Daftar peserta acara
   */
  attendees: Attendee[];
}

export interface AttendanceStats {
  total: number;
  present: number;
  pending: number;
  percentage: number;
}

export type CheckInStatus =
  | "checked_in"
  | "already_checked_in"
  | "event_mismatch"
  | "event_inactive"
  | "session_inactive"
  | "not_found";

export interface CheckInValidationResult {
  success: boolean;
  status: CheckInStatus;
  message: string;
  sessionId?: string;
  sessionName?: string;
  attendee?: Attendee;
}

export type CrossCheckFilterType =
  | "all"
  | "present_morning_no_lunch"
  | "completed_all"
  | "absent";
