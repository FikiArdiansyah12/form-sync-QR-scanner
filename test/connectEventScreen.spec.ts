import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import {
  loadEventFromStorage,
  createEmptyWorkspaceEvent,
  saveEventToStorage,
} from "../src/core/storage";

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

describe("Connect Event & Clean State Architecture Suite", () => {
  beforeAll(() => {
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

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("should return null when eventCode is empty (pure empty ID default)", () => {
    expect(loadEventFromStorage("")).toBeNull();
    expect(loadEventFromStorage("   ")).toBeNull();
  });

  it("should create a clean empty workspace when a new valid event code is provided", () => {
    const event = createEmptyWorkspaceEvent("ABCD-1234", "National Tech Conference");
    expect(event.eventCode).toBe("ABCD-1234");
    expect(event.eventName).toBe("National Tech Conference");
    expect(event.sessions).toEqual([]);
    expect(event.attendees).toEqual([]);
    expect(event.pin).toBe("");
    expect(event.isActive).toBe(true);
  });

  it("should automatically normalize event code without hyphens into formatted 8-digit code", () => {
    const event = createEmptyWorkspaceEvent("WK42KGBK");
    expect(event.eventCode).toBe("WK42-KGBK");
    expect(event.sessions).toHaveLength(0);
    expect(event.attendees).toHaveLength(0);
  });

  it("should persist created event and retrieve it on subsequent loads", () => {
    const created = createEmptyWorkspaceEvent("EVNT-8899");
    const loaded = loadEventFromStorage("EVNT-8899");
    expect(loaded).not.toBeNull();
    expect(loaded?.eventCode).toBe("EVNT-8899");
    expect(loaded?.sessions).toEqual([]);
  });

  it("should store and retrieve persistent webhook mapping for progressive pairing", async () => {
    const { saveWebhookMapping, getWebhookForEvent } = await import("../src/core/storage");
    const testCode = "PAIR-1234";
    const testWebhook = "https://script.google.com/macros/s/AKfycbza5DKqNBP9Bl8l7UbPJaT6v7Ev3-dtY-5y-LwwV5Bx70qWigenIfldx7aGkS0ePQ1X_A/exec";

    expect(getWebhookForEvent(testCode)).toBeNull();

    saveWebhookMapping(testCode, testWebhook);
    expect(getWebhookForEvent(testCode)).toBe(testWebhook);
  });

  it("should validate and extract clean webhook URL from raw inputs or portal query params", async () => {
    const { extractValidWebhookUrl } = await import("../src/bridge/spreadsheetSync");

    const validUrl = "https://script.google.com/macros/s/AKfycb-mock-id/exec";
    const res1 = extractValidWebhookUrl(validUrl);
    expect(res1.valid).toBe(true);
    expect(res1.resolvedUrl).toBe(validUrl);

    // URL scanner portal lengkap dengan param &wh=
    const fullPortalUrl = `https://formsync.my.id/?event=ABCD-1234&wh=${encodeURIComponent(validUrl)}`;
    const res2 = extractValidWebhookUrl(fullPortalUrl);
    expect(res2.valid).toBe(true);
    expect(res2.resolvedUrl).toBe(validUrl);

    // URL scanner portal tanpa param wh= ditolak karena bukan webhook URL
    const portalWithoutWh = "https://formsync.my.id/?event=ABCD-1234&origin=sheets";
    const res3 = extractValidWebhookUrl(portalWithoutWh);
    expect(res3.valid).toBe(false);
  });

  it("should validate whether event code already exists in workspace before deciding next step", async () => {
    const { isEventWorkspaceExists, registerWorkspaceEvent } = await import("../src/core/storage");
    const { isEventPinProtected } = await import("../src/core/securityLock");

    const unenteredCode = "UNRG-9999";
    // 1. Belum pernah masuk ke workspace: harus false (memicu permintaan Webhook URL)
    expect(isEventWorkspaceExists(unenteredCode)).toBe(false);

    // 2. Simulasi setelah webhook dimasukkan & workspace terdaftar dengan PIN
    const registeredEventWithPin = registerWorkspaceEvent(unenteredCode, {
      origin: "sheets",
      pin: "8888",
    });
    expect(isEventWorkspaceExists(unenteredCode)).toBe(true);
    // Periksa apakah workspace punya PIN:
    expect(isEventPinProtected(registeredEventWithPin.pin)).toBe(true);

    // 3. Simulasi event lain tanpa PIN (Open Access)
    const openEventCode = "OPEN-1111";
    const openEvent = registerWorkspaceEvent(openEventCode, {
      origin: "sheets",
      pin: "",
    });
    expect(isEventWorkspaceExists(openEventCode)).toBe(true);
    expect(isEventPinProtected(openEvent.pin)).toBe(false);
  });

  it("should ensure non-string or SyntheticEvent disconnect reasons are safely normalized to null", () => {
    // Simulasi objek SyntheticEvent yang dihasilkan onClick di browser
    const mockSyntheticEvent = {
      _reactName: "onClick",
      type: "click",
      target: {},
      bubbles: true,
      cancelable: true,
    };

    // Fungsi normalisasi alasan disconnect yang digunakan di App.tsx
    const normalizeDisconnectReason = (reasonMsg?: unknown): string | null => {
      return typeof reasonMsg === "string" && reasonMsg.trim() ? reasonMsg.trim() : null;
    };

    expect(normalizeDisconnectReason(mockSyntheticEvent)).toBeNull();
    expect(normalizeDisconnectReason(undefined)).toBeNull();
    expect(normalizeDisconnectReason(null)).toBeNull();
    expect(normalizeDisconnectReason(123)).toBeNull();
    expect(normalizeDisconnectReason("This workspace has been disconnected.")).toBe(
      "This workspace has been disconnected."
    );
  });
});
