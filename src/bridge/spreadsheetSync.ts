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
  checkInTime?: string;
}

export interface SpreadsheetSyncResponse {
  success: boolean;
  message?: string;
  name?: string;
  checkInTime?: string;
  error?: string;
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
  if (!webhookUrl || !webhookUrl.trim()) {
    return { success: false, error: "Spreadsheet webhook URL is required." };
  }

  const cleanUrl = webhookUrl.trim();
  if (
    cleanUrl.includes("formsync.my.id") ||
    (cleanUrl.includes("origin=sheets") && !cleanUrl.includes("script.google.com"))
  ) {
    return {
      success: false,
      error:
        "The provided URL is a Scanner Portal link, not a Google Apps Script Webhook. Webhook URL starts with https://script.google.com/macros/s/",
    };
  }

  if (!eventCode || !eventCode.trim()) {
    return { success: false, error: "Event code is required." };
  }

  try {
    const cleanUrl = webhookUrl.trim();
    const cleanEventCode = normalizeEventCode(eventCode);
    const separator = cleanUrl.includes("?") ? "&" : "?";
    const targetUrl = `${cleanUrl}${separator}event=${encodeURIComponent(cleanEventCode)}`;

    const response = await fetchFn(targetUrl, {
      method: "GET",
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
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch event data from spreadsheet.";
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

  try {
    const response = await fetchFn(webhookUrl.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        eventCode: normalizeEventCode(payload.eventCode),
        ticketCode: payload.ticketCode.trim(),
        securitySecret: payload.securitySecret.trim(),
        checkInTime: payload.checkInTime || new Date().toTimeString().split(" ")[0],
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP error syncing check-in: ${response.status} ${response.statusText}`,
      };
    }

    const data = (await response.json()) as SpreadsheetSyncResponse;
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error syncing check-in to spreadsheet.";
    return {
      success: false,
      error: msg,
    };
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
    attendees: remote.attendees || current.attendees,
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
        "Content-Type": "application/json",
        Accept: "application/json",
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
