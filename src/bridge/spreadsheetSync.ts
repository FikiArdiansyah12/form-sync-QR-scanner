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
  attendees?: Attendee[];
  updatedAt?: string;
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
  if (!remote.success || !remote.attendees) {
    return current;
  }

  // Petakan peserta dari remote sambil mempertahankan data lokal jika diperlukan
  return {
    ...current,
    attendees: remote.attendees,
    updatedAt: remote.updatedAt || new Date().toISOString(),
  };
}
