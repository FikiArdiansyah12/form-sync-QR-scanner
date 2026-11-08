import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isEventWorkspaceExists,
  registerWorkspaceEvent,
  loadEventFromStorage,
  saveEventToStorage,
  DEFAULT_DEMO_EVENT,
} from "../src/core/storage";
import {
  testSpreadsheetConnectivity,
  fetchEventFromSpreadsheet,
  syncCheckInToSpreadsheet,
  mergeRemoteAttendees,
} from "../src/bridge/spreadsheetSync";

function createMemoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

describe("Strict Event ID Rejection & Spreadsheet Connectivity Suite", () => {
  beforeEach(() => {
    const memLocal = createMemoryStorage();
    (globalThis as any).window = { localStorage: memLocal };
    (globalThis as any).localStorage = memLocal;
  });

  describe("1. Strict Event ID Validation & Rejection", () => {
    it("harus menolak kode event yang belum pernah terdaftar di localStorage", () => {
      const code = "UNKN-9999";
      expect(isEventWorkspaceExists(code)).toBe(false);
      expect(loadEventFromStorage(code)).toBeNull();
    });

    it("harus menolak string kosong atau whitespace", () => {
      expect(isEventWorkspaceExists("")).toBe(false);
      expect(isEventWorkspaceExists("   ")).toBe(false);
      expect(loadEventFromStorage("")).toBeNull();
    });

    it("hanya mendaftarkan event jika dipanggil via registrasi resmi Sheets", () => {
      const officialCode = "EPNF-V7ZF";
      expect(isEventWorkspaceExists(officialCode)).toBe(false);

      // Pendaftaran resmi
      const registered = registerWorkspaceEvent(officialCode, { origin: "sheets" });
      expect(registered.eventCode).toBe("EPNF-V7ZF");
      expect(isEventWorkspaceExists(officialCode)).toBe(true);

      const loaded = loadEventFromStorage(officialCode);
      expect(loaded).not.toBeNull();
      expect(loaded?.eventCode).toBe("EPNF-V7ZF");
      // Checkpoints dan attendees wajib murni kosong
      expect(loaded?.sessions).toEqual([]);
      expect(loaded?.attendees).toEqual([]);
    });
  });

  describe("2. Test Connectivity & Latency Measurement", () => {
    it("harus mengembalikan error jika URL webhook kosong", async () => {
      const result = await testSpreadsheetConnectivity("", "EPNF-V7ZF");
      expect(result.success).toBe(false);
      expect(result.error).toBe("URL_EMPTY");
      expect(result.eventMatched).toBe(false);
    });

    it("harus sukses mengukur latensi dan mencocokkan event code yang valid", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          eventCode: "EPNF-V7ZF",
          securitySecret: "sec_12345",
          attendees: [
            {
              id: "att_1",
              ticketCode: "EPNF-V7ZF:TKT-101",
              name: "John Doe",
              status: "pending",
            },
          ],
        }),
      });

      const result = await testSpreadsheetConnectivity(
        "https://script.google.com/macros/s/AKfycbw_test/exec",
        "EPNF-V7ZF",
        mockFetch as any
      );

      expect(result.success).toBe(true);
      expect(result.eventMatched).toBe(true);
      expect(result.eventCode).toBe("EPNF-V7ZF");
      expect(result.attendeesCount).toBe(1);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.message).toContain("Successfully connected to Google Sheets");
    });

    it("harus MENOLAK seketika jika Google Sheets membalas dengan Event ID berbeda (EVENT_MISMATCH)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          eventCode: "OTHER-9999", // Berbeda dengan yang diminta (EPNF-V7ZF)
          attendees: [],
        }),
      });

      const result = await testSpreadsheetConnectivity(
        "https://script.google.com/macros/s/AKfycbw_test/exec",
        "EPNF-V7ZF",
        mockFetch as any
      );

      expect(result.success).toBe(false);
      expect(result.eventMatched).toBe(false);
      expect(result.error).toBe("EVENT_MISMATCH");
      expect(result.message).toContain("Event Code mismatch");
    });

    it("harus menangani penolakan eksplisit EVENT_NOT_FOUND dari Google Apps Script", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          error: "EVENT_NOT_FOUND",
          message: "Event code 'WRNG-1234' was not found in this spreadsheet.",
        }),
      });

      const result = await testSpreadsheetConnectivity(
        "https://script.google.com/macros/s/AKfycbw_test/exec",
        "WRNG-1234",
        mockFetch as any
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("EVENT_NOT_FOUND");
      expect(result.message).toContain("Event code 'WRNG-1234' was not found");
    });
  });

  describe("3. Attendees Synchronization & Merge", () => {
    it("harus menggabungkan data peserta riil dari spreadsheet ke konfigurasi lokal", () => {
      const event = registerWorkspaceEvent("EPNF-V7ZF", { origin: "sheets" });
      expect(event.attendees).toHaveLength(0);

      const remoteData = {
        success: true,
        eventCode: "EPNF-V7ZF",
        attendees: [
          {
            id: "att_1",
            ticketCode: "EPNF-V7ZF:TKT-101",
            name: "Budi Real",
            status: "pending" as const,
          },
          {
            id: "att_2",
            ticketCode: "EPNF-V7ZF:TKT-102",
            name: "Siti Real",
            status: "present" as const,
          },
        ],
      };

      const merged = mergeRemoteAttendees(event, remoteData);
      expect(merged.attendees).toHaveLength(2);
      expect(merged.attendees[0].name).toBe("Budi Real");
      expect(merged.attendees[1].name).toBe("Siti Real");
    });
  });
});
