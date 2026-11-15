/**
 * Test Suite: FormSync Disconnect & Heartbeat Health-Check
 * Memvalidasi penanganan otomatis saat ekosistem diputus oleh administrator di Google Sheets.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  testSpreadsheetConnectivity,
  fetchEventFromSpreadsheet,
  syncCheckInToSpreadsheet,
} from "../src/bridge/spreadsheetSync";
import {
  registerWorkspaceEvent,
  loadEventFromStorage,
  removeEventFromStorage,
  isEventWorkspaceExists,
} from "../src/core/storage";
import {
  setEventUnlockedInSession,
  isEventUnlockedInSession,
  clearEventUnlockedInSession,
} from "../src/core/securityLock";

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

describe("FormSync Auto-Disconnect & Health-Check Workflow Spec", () => {
  const dummyWebhookUrl = "https://script.google.com/macros/s/AKfycbxAu0QtKScozu4S9YyKbPaWXE7G4eZftizHydS_zKhu9SlAzrghsJCx40JUwBm5bd8FiQ/exec";
  const dummyEventCode = "Q7VL-KT7Y";

  beforeEach(() => {
    const memLocal = createMemoryStorage();
    const memSession = createMemoryStorage();
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: memLocal, sessionStorage: memSession },
      writable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: memLocal,
      writable: true,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: memSession,
      writable: true,
    });
  });

  describe("1. Bridge Protocol Response to Disconnected Ecosystem", () => {
    it("fetchEventFromSpreadsheet harus mengidentifikasi status WORKSPACE_DISCONNECTED", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          error: "WORKSPACE_DISCONNECTED",
          message: "This event workspace has been disconnected by the administrator.",
        }),
      });

      const res = await fetchEventFromSpreadsheet(dummyWebhookUrl, dummyEventCode, mockFetch as any);
      expect(res.success).toBe(false);
      expect(res.error).toBe("WORKSPACE_DISCONNECTED");
      expect(res.message).toBe("This event workspace has been disconnected by the administrator.");
    });

    it("testSpreadsheetConnectivity harus mengembalikan eventMatched: false dan error: WORKSPACE_DISCONNECTED", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          error: "WORKSPACE_DISCONNECTED",
          message: "This event workspace has been disconnected by the administrator.",
        }),
      });

      const res = await testSpreadsheetConnectivity(dummyWebhookUrl, dummyEventCode, mockFetch as any);
      expect(res.success).toBe(false);
      expect(res.eventMatched).toBe(false);
      expect(res.error).toBe("WORKSPACE_DISCONNECTED");
      expect(res.message).toContain("disconnected by the administrator");
    });

    it("syncCheckInToSpreadsheet harus mengidentifikasi status WORKSPACE_DISCONNECTED saat scan tiket", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          error: "WORKSPACE_DISCONNECTED",
          message: "This event workspace has been disconnected by the administrator.",
        }),
      });

      const res = await syncCheckInToSpreadsheet(
        dummyWebhookUrl,
        {
          eventCode: dummyEventCode,
          ticketCode: "TKT-001",
          securitySecret: "SECRET_XYZ",
        },
        mockFetch as any
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe("WORKSPACE_DISCONNECTED");
      expect(res.message).toBe("This event workspace has been disconnected by the administrator.");
    });
  });

  describe("2. Clean Teardown & Local Session Purge", () => {
    it("saat disconnect dipicu, local storage dan session lock harus dibersihkan secara tuntas", () => {
      // Setup event dan session PIN
      registerWorkspaceEvent(dummyEventCode, { origin: "sheets" });
      setEventUnlockedInSession(dummyEventCode);

      expect(isEventWorkspaceExists(dummyEventCode)).toBe(true);
      expect(isEventUnlockedInSession(dummyEventCode)).toBe(true);

      // Simulasi eksekusi handleDisconnectEvent
      removeEventFromStorage(dummyEventCode);
      clearEventUnlockedInSession(dummyEventCode);

      expect(loadEventFromStorage(dummyEventCode)).toBeNull();
      expect(isEventWorkspaceExists(dummyEventCode)).toBe(false);
      expect(isEventUnlockedInSession(dummyEventCode)).toBe(false);
    });
  });

  describe("3. Code Quality & UX Constraints Validation", () => {
    it("WorkspaceControlPanel.tsx harus menangani WORKSPACE_DISCONNECTED dan memanggil onDisconnect serta onClose", () => {
      const panelPath = path.resolve(__dirname, "../src/coordinator/WorkspaceControlPanel.tsx");
      const content = fs.readFileSync(panelPath, "utf-8");

      expect(content).toContain("onDisconnect?: (reasonMsg?: string) => void;");
      expect(content).toContain("onClose?: () => void;");
      expect(content).toContain('res.error === "WORKSPACE_DISCONNECTED"');
      expect(content).toContain("onClose?.()");
      expect(content).toContain("onDisconnect?.(");
    });

    it("App.tsx harus memasang heartbeat periodic check dan visibility change listener", () => {
      const appPath = path.resolve(__dirname, "../src/App.tsx");
      const content = fs.readFileSync(appPath, "utf-8");

      expect(content).toContain("verifyWorkspaceHealth");
      expect(content).toContain("visibilitychange");
      expect(content).toContain("handleDisconnectEvent");
      expect(content).toContain("clearEventUnlockedInSession");
    });

    it("Dilarang ada icon circular reload / rotate panah berputar di WorkspaceControlPanel dan App", () => {
      const files = [
        path.resolve(__dirname, "../src/coordinator/WorkspaceControlPanel.tsx"),
        path.resolve(__dirname, "../src/App.tsx"),
      ];

      for (const f of files) {
        const content = fs.readFileSync(f, "utf-8");
        expect(content).not.toMatch(/RefreshCw|RefreshCcw|RotateCw|RotateCcw/);
      }
    });

    it("Dilarang ada emoticon / emoji di WorkspaceControlPanel dan App", () => {
      const files = [
        path.resolve(__dirname, "../src/coordinator/WorkspaceControlPanel.tsx"),
        path.resolve(__dirname, "../src/App.tsx"),
      ];

      const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      for (const f of files) {
        const content = fs.readFileSync(f, "utf-8");
        expect(emojiRegex.test(content)).toBe(false);
      }
    });
  });
});
