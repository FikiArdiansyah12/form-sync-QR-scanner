/**
 * FormSync Attendance System - Google Sheets Sync Client
 * Menyediakan utilitas komunikasi HTTP dua arah antara aplikasi FormSync dan
 * Webhook Google Apps Script yang terpasang pada spreadsheet workspace.
 */

import { type Attendee, type WorkspaceEventConfig } from "../core/types";
import { normalizeEventCode } from "../core/eventCodeGenerator";

export interface SpreadsheetFetchResponse {
  success: boolean;
  eventCode?: string;
  securitySecret?: string;
  pin?: string;
  hasPin?: boolean;
  sessions?: any[];
  attendees?: Attendee[];
  updatedAt?: string;
  message?: string;
  error?: string;
}

export interface SpreadsheetSyncPayload {
  eventCode: string;
  ticketCode: string;
  securitySecret: string;
  sessionId?: string;
  sessionName?: string;
  action?: string;
  checkInTime?: string;
}

export interface SpreadsheetSyncResponse {
  success: boolean;
  message?: string;
  name?: string;
  checkInTime?: string;
  sessions?: any[];
  clearedCells?: number;
  error?: string;
}

export interface SpreadsheetCreateSessionPayload {
  eventCode: string;
  securitySecret: string;
  sessionName: string;
  sessionType?: string;
}

export interface SpreadsheetCreateSessionResponse {
  success: boolean;
  message?: string;
  sessions?: any[];
  error?: string;
}

/**
 * Helper untuk memvalidasi dan mengekstrak Webhook URL.
 * Jika pengguna menempelkan tautan scanner yang mengandung parameter wh,
 * sistem akan secara otomatis mengekstrak Webhook Google Apps Script di dalamnya.
 */
export function extractValidWebhookUrl(url: string): { valid: boolean; resolvedUrl: string; error?: string } {
  if (!url || !url.trim()) {
    return { valid: false, resolvedUrl: "", error: "Spreadsheet webhook URL is required." };
  }
  let cleanUrl = url.trim();

  // Ekstrak parameter 'wh' jika pengguna menempelkan tautan portal lengkap
  if (cleanUrl.includes("wh=")) {
    try {
      const parsed = new URL(cleanUrl);
      const extractedWh = parsed.searchParams.get("wh");
      if (extractedWh && extractedWh.includes("script.google.com")) {
        return { valid: true, resolvedUrl: decodeURIComponent(extractedWh) };
      }
    } catch {}
  }

  // Deteksi tautan deployment lama yang sudah tidak aktif di Google Apps Script (404)
  if (cleanUrl.includes("AKfycby_4eb")) {
    return {
      valid: false,
      resolvedUrl: "",
      error:
        "This Webhook URL is an outdated deployment (404 Not Found). Please open your Google Sheet add-on to copy the active FormSync Webhook URL.",
    };
  }

  // Deteksi tautan scanner portal tanpa webhook terlampir
  if (
    cleanUrl.includes("formsync.my.id") ||
    (cleanUrl.includes("origin=sheets") && !cleanUrl.includes("script.google.com"))
  ) {
    return {
      valid: false,
      resolvedUrl: cleanUrl,
      error:
        "The provided URL is a Scanner Portal link, not a Google Apps Script Webhook. Webhook URL starts with https://script.google.com/macros/s/",
    };
  }

  return { valid: true, resolvedUrl: cleanUrl };
}

/**
 * Mengambil data peserta dan status terkini dari Google Sheets via Webhook GET.
 *
 * @param webhookUrl - URL Deployment Web App Google Apps Script
 * @param eventCode - Kode unik acara 8-digit
 * @param fetchFn - Optional custom fetch instance (berguna untuk testing atau SSR)
 * @returns Promise berisi hasil fetch dan daftar peserta
 */
export async function fetchEventFromSpreadsheet(
  webhookUrl: string,
  eventCode: string,
  fetchFn: typeof fetch = fetch
): Promise<SpreadsheetFetchResponse> {
  const check = extractValidWebhookUrl(webhookUrl);
  if (!check.valid) {
    return { success: false, error: check.error };
  }
  const cleanUrl = check.resolvedUrl;

  if (!eventCode || !eventCode.trim()) {
    return { success: false, error: "Event code is required." };
  }

  try {
    const cleanEventCode = normalizeEventCode(eventCode);
    const separator = cleanUrl.includes("?") ? "&" : "?";
    const targetUrl = `${cleanUrl}${separator}event=${encodeURIComponent(cleanEventCode)}`;

    const response = await fetchFn(targetUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP error from spreadsheet webhook: ${response.status} ${response.statusText}`,
      };
    }

    const data = (await response.json()) as SpreadsheetFetchResponse;
    if (data.error === "WORKSPACE_DISCONNECTED") {
      return {
        success: false,
        error: "WORKSPACE_DISCONNECTED",
        message: data.message || "This event workspace has been disconnected by administrator."
      };
    }
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch event data from spreadsheet.";
    return {
      success: false,
      error: msg,
    };
  }
}

async function postAttendanceMutation(
  webhookUrl: string,
  bodyPayload: Record<string, unknown>,
  errorContext: string,
  fetchFn: typeof fetch = fetch
): Promise<SpreadsheetSyncResponse> {
  try {
    const response = await fetchFn(webhookUrl.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP error ${errorContext}: ${response.status} ${response.statusText}`,
      };
    }

    const data = (await response.json()) as SpreadsheetSyncResponse;
    if (data.error === "WORKSPACE_DISCONNECTED") {
      return {
        success: false,
        error: "WORKSPACE_DISCONNECTED",
        message: data.message || "This event workspace has been disconnected by administrator.",
      };
    }
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : `Network error ${errorContext}.`;
    return {
      success: false,
      error: msg,
    };
  }
}

/**
 * Mengirimkan pembaruan status check-in peserta ke Google Sheets via Webhook POST.
 *
 * @param webhookUrl - URL Deployment Web App Google Apps Script
 * @param payload - Data check-in (eventCode, ticketCode, securitySecret, checkInTime)
 * @param fetchFn - Optional custom fetch instance
 * @returns Promise status sinkronisasi ke spreadsheet
 */
export async function syncCheckInToSpreadsheet(
  webhookUrl: string,
  payload: SpreadsheetSyncPayload,
  fetchFn: typeof fetch = fetch
): Promise<SpreadsheetSyncResponse> {
  if (!webhookUrl || !webhookUrl.trim()) {
    return { success: false, error: "Spreadsheet webhook URL is required." };
  }

  if (!payload.eventCode || !payload.ticketCode || !payload.securitySecret) {
    return {
      success: false,
      error: "Missing required check-in fields (eventCode, ticketCode, or securitySecret).",
    };
  }

  return postAttendanceMutation(
    webhookUrl,
    {
      action: payload.action || "session_checkin",
      eventCode: normalizeEventCode(payload.eventCode),
      ticketCode: payload.ticketCode.trim(),
      securitySecret: payload.securitySecret.trim(),
      sessionId: payload.sessionId ? payload.sessionId.trim() : "",
      ...(payload.sessionName ? { sessionName: payload.sessionName.trim() } : {}),
      checkInTime: payload.checkInTime || new Date().toTimeString().split(" ")[0],
    },
    "syncing check-in",
    fetchFn
  );
}

/**
 * Menyinkronkan pembatalan (Undo / Revert) status check-in peserta ke Google Sheets via Webhook POST.
 * Mengosongkan sel Status dan Time terkait pada tab sheet 'Attendance'.
 *
 * @param webhookUrl - URL Deployment Web App Google Apps Script
 * @param payload - Data pembatalan (eventCode, ticketCode, securitySecret, sessionId, sessionName)
 * @param fetchFn - Optional custom fetch instance
 * @returns Promise status pembatalan presensi di spreadsheet
 */
export async function syncRevertCheckInToSpreadsheet(
  webhookUrl: string,
  payload: SpreadsheetSyncPayload,
  fetchFn: typeof fetch = fetch
): Promise<SpreadsheetSyncResponse> {
  const check = extractValidWebhookUrl(webhookUrl);
  if (!check.valid) {
    return { success: false, error: check.error || "Spreadsheet webhook URL is required." };
  }

  if (!payload.eventCode || !payload.ticketCode || !payload.securitySecret) {
    return {
      success: false,
      error: "Missing required revert fields (eventCode, ticketCode, or securitySecret).",
    };
  }

  return postAttendanceMutation(
    check.resolvedUrl,
    {
      action: "revert_checkin",
      eventCode: normalizeEventCode(payload.eventCode),
      ticketCode: payload.ticketCode.trim(),
      securitySecret: payload.securitySecret.trim(),
      sessionId: payload.sessionId ? payload.sessionId.trim() : "",
      ...(payload.sessionName ? { sessionName: payload.sessionName.trim() } : {}),
    },
    "reverting check-in",
    fetchFn
  );
}

/**
 * Menyinkronkan penambahan sesi/checkpoint baru secara instan ke Google Sheets.
 * Membuat kolom fisik [Nama Sesi] Status dan [Nama Sesi] Time di tab sheet 'Attendance'.
 *
 * @param webhookUrl - URL Webhook Google Apps Script
 * @param payload - Data sesi (eventCode, securitySecret, sessionName, sessionType)
 * @param fetchFn - Optional custom fetch instance
 * @returns Promise status pembuatan sesi di spreadsheet
 */
export async function syncCreateSessionToSpreadsheet(
  webhookUrl: string,
  payload: SpreadsheetCreateSessionPayload,
  fetchFn: typeof fetch = fetch
): Promise<SpreadsheetCreateSessionResponse> {
  const check = extractValidWebhookUrl(webhookUrl);
  if (!check.valid) {
    return { success: false, error: check.error || "Spreadsheet webhook URL is required." };
  }
  const cleanUrl = check.resolvedUrl;

  if (!payload.eventCode || !payload.securitySecret || !payload.sessionName) {
    return {
      success: false,
      error: "Missing required session fields (eventCode, securitySecret, or sessionName).",
    };
  }

  try {
    const response = await fetchFn(cleanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "create_session",
        eventCode: normalizeEventCode(payload.eventCode),
        securitySecret: payload.securitySecret.trim(),
        sessionName: payload.sessionName.trim(),
        sessionType: payload.sessionType || "checkin",
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP error syncing session: ${response.status} ${response.statusText}`,
      };
    }

    const data = (await response.json()) as SpreadsheetCreateSessionResponse;
    if (data.error === "WORKSPACE_DISCONNECTED") {
      return {
        success: false,
        error: "WORKSPACE_DISCONNECTED",
        message: data.message || "This event workspace has been disconnected by administrator.",
      };
    }
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error creating session in spreadsheet.";
    return {
      success: false,
      error: msg,
    };
  }
}

/**
 * Menyinkronkan penghapusan checkpoint sesi ke backend spreadsheet.
 *
 * @param webhookUrl - URL Webhook Google Apps Script
 * @param eventCode - Kode acara
 * @param securitySecret - Token rahasia acara
 * @param sessionId - ID sesi yang akan dihapus
 * @param fetchFn - Optional fetch instance
 */
export async function syncDeleteSessionToSpreadsheet(
  webhookUrl: string,
  eventCode: string,
  securitySecret: string,
  sessionId: string,
  sessionNameOrFetchFn?: string | typeof fetch,
  customFetchFn?: typeof fetch | string
): Promise<{ success: boolean; message?: string; sessions?: any[]; error?: string }> {
  let sessionName = "";
  let fetchFn = fetch;

  if (typeof sessionNameOrFetchFn === "string") {
    sessionName = sessionNameOrFetchFn;
    if (typeof customFetchFn === "function") {
      fetchFn = customFetchFn;
    }
  } else if (typeof sessionNameOrFetchFn === "function") {
    fetchFn = sessionNameOrFetchFn;
    if (typeof customFetchFn === "string") {
      sessionName = customFetchFn;
    }
  }

  const check = extractValidWebhookUrl(webhookUrl);
  if (!check.valid) {
    return { success: false, error: check.error || "Spreadsheet webhook URL is required." };
  }
  if (!eventCode || !sessionId) {
    return { success: false, error: "Missing required fields (eventCode or sessionId)." };
  }
  try {
    const response = await fetchFn(check.resolvedUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "delete_session",
        eventCode: normalizeEventCode(eventCode),
        securitySecret: securitySecret.trim(),
        sessionId: sessionId.trim(),
        ...(sessionName ? { sessionName: sessionName.trim() } : {}),
      }),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP error deleting session: ${response.status} ${response.statusText}` };
    }
    return await response.json();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error deleting session from spreadsheet.";
    return { success: false, error: msg };
  }
}

/**
 * Menyinkronkan status aktif/non-aktif checkpoint sesi ke backend spreadsheet.
 *
 * @param webhookUrl - URL Webhook Google Apps Script
 * @param eventCode - Kode acara
 * @param securitySecret - Token rahasia acara
 * @param sessionId - ID sesi
 * @param isActive - Status aktif
 * @param fetchFn - Optional fetch instance
 */
export async function syncToggleSessionToSpreadsheet(
  webhookUrl: string,
  eventCode: string,
  securitySecret: string,
  sessionId: string,
  isActive: boolean,
  fetchFn: typeof fetch = fetch
): Promise<{ success: boolean; message?: string; sessions?: any[]; error?: string }> {
  const check = extractValidWebhookUrl(webhookUrl);
  if (!check.valid) {
    return { success: false, error: check.error || "Spreadsheet webhook URL is required." };
  }
  try {
    const response = await fetchFn(check.resolvedUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "toggle_session",
        eventCode: normalizeEventCode(eventCode),
        securitySecret: securitySecret.trim(),
        sessionId: sessionId.trim(),
        isActive: Boolean(isActive),
      }),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP error toggling session: ${response.status} ${response.statusText}` };
    }
    return await response.json();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error toggling session status.";
    return { success: false, error: msg };
  }
}

/**
 * Meminta Google Apps Script menyinkronkan data pendaftar dari sheet sumber ke tab 'Attendance'.
 *
 * @param webhookUrl - URL Webhook Google Apps Script
 * @param eventCode - Kode acara 8-digit
 * @param securitySecret - Token otentikasi
 * @param fetchFn - Optional fetch instance
 */
export async function requestAttendeeSyncFromSpreadsheet(
  webhookUrl: string,
  eventCode: string,
  securitySecret: string,
  fetchFn: typeof fetch = fetch
): Promise<{ success: boolean; message?: string; syncResult?: any; error?: string }> {
  const check = extractValidWebhookUrl(webhookUrl);
  if (!check.valid) {
    return { success: false, error: check.error };
  }
  try {
    const response = await fetchFn(check.resolvedUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "sync_attendees",
        eventCode: normalizeEventCode(eventCode),
        securitySecret: securitySecret.trim(),
      }),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    return await response.json();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error syncing attendees.";
    return { success: false, error: msg };
  }
}

/**
 * Mengintegrasikan data yang diambil dari Google Sheets ke dalam konfigurasi lokal acara.
 *
 * @param current - Konfigurasi acara lokal saat ini
 * @param remote - Respons data peserta dari spreadsheet
 * @returns Konfigurasi acara terpadu
 */
export function mergeRemoteAttendees(
  current: WorkspaceEventConfig,
  remote: SpreadsheetFetchResponse
): WorkspaceEventConfig {
  if (!remote.success) {
    return current;
  }

  return {
    ...current,
    pin: remote.pin !== undefined ? remote.pin : current.pin,
    sessions: Array.isArray(remote.sessions) ? remote.sessions : current.sessions,
    attendees: Array.isArray(remote.attendees) ? remote.attendees : current.attendees,
    updatedAt: remote.updatedAt || new Date().toISOString(),
  };
}

/**
 * Menyinkronkan pembaruan Security PIN dari Web App ke backend Google Sheets.
 *
 * @param webhookUrl - URL Webhook Google Apps Script
 * @param eventCode - Kode acara 8-digit
 * @param securitySecret - Kunci rahasia otentikasi workspace
 * @param pin - PIN baru yang akan disimpan
 * @param fetchFn - Optional custom fetch instance
 * @returns Promise status pembaruan PIN di backend
 */
export async function syncPinToSpreadsheet(
  webhookUrl: string,
  eventCode: string,
  securitySecret: string,
  pin: string,
  fetchFn: typeof fetch = fetch
): Promise<{ success: boolean; pin?: string; message?: string; error?: string }> {
  if (!webhookUrl || !webhookUrl.trim()) {
    return { success: false, error: "Spreadsheet Webhook URL is required." };
  }
  try {
    const res = await fetchFn(webhookUrl.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "update_pin",
        eventCode: normalizeEventCode(eventCode),
        securitySecret: securitySecret.trim(),
        pin: pin.trim(),
      }),
    });
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }
    const data = await res.json();
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error syncing security PIN.";
    return { success: false, error: msg };
  }
}

export interface ConnectivityTestResult {
  success: boolean;
  latencyMs: number;
  eventMatched: boolean;
  eventCode?: string;
  attendeesCount?: number;
  message: string;
  error?: string;
}

/**
 * Menguji konektivitas real-time antara Web App FormSync dan Google Sheets Add-on.
 * Memverifikasi validitas deployment Apps Script, mengukur latensi jaringan,
 * dan memvalidasi apakah Event Code terdaftar di spreadsheet tersebut.
 *
 * @param webhookUrl - URL Deployment Web App Google Apps Script
 * @param eventCode - Kode acara yang sedang aktif
 * @param fetchFn - Optional fetch instance
 * @returns Promise status konektivitas dan latensi
 */
export async function testSpreadsheetConnectivity(
  webhookUrl: string,
  eventCode: string,
  fetchFn: typeof fetch = fetch
): Promise<ConnectivityTestResult> {
  if (!webhookUrl || !webhookUrl.trim()) {
    return {
      success: false,
      latencyMs: 0,
      eventMatched: false,
      message: "Spreadsheet Webhook URL is empty. Please configure your Apps Script URL.",
      error: "URL_EMPTY",
    };
  }

  const startTime = performance.now();
  try {
    const res = await fetchEventFromSpreadsheet(webhookUrl, eventCode, fetchFn);
    const latencyMs = Math.round(performance.now() - startTime);

    if (!res.success) {
      return {
        success: false,
        latencyMs,
        eventMatched: false,
        message: res.message || res.error || "Failed to reach Google Sheets deployment.",
        error: res.error,
      };
    }

    const cleanTarget = normalizeEventCode(eventCode);
    const cleanRemote = res.eventCode ? normalizeEventCode(res.eventCode) : "";
    const isMatched = Boolean(cleanRemote && cleanRemote === cleanTarget);

    if (!isMatched) {
      return {
        success: false,
        latencyMs,
        eventMatched: false,
        eventCode: res.eventCode,
        attendeesCount: res.attendees?.length || 0,
        message: `Deployment reached, but Event Code mismatch: expected ${eventCode}, spreadsheet reports ${res.eventCode || 'unknown'}.`,
        error: "EVENT_MISMATCH",
      };
    }

    return {
      success: true,
      latencyMs,
      eventMatched: true,
      eventCode: res.eventCode,
      attendeesCount: res.attendees?.length || 0,
      message: `Successfully connected to Google Sheets (${latencyMs}ms). Verified event ${res.eventCode} with ${res.attendees?.length || 0} registered attendees.`,
    };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - startTime);
    const errorMsg = err instanceof Error ? err.message : "Unknown connectivity error.";
    return {
      success: false,
      latencyMs,
      eventMatched: false,
      message: errorMsg,
      error: errorMsg,
    };
  }
}
