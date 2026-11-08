import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import {
  isEventPinProtected,
  verifyOperatorPin,
  isEventUnlockedInSession,
  setEventUnlockedInSession,
  clearEventUnlockedInSession,
} from "../src/core/securityLock";
import {
  DEFAULT_DEMO_EVENT,
  saveEventToStorage,
  loadEventFromStorage,
  updateEventPin,
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

describe("FormSync PIN Security & Gatekeeper Suite", () => {
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

  describe("PIN Protection Logic", () => {
    it("should report open access (not protected) when PIN is empty or undefined", () => {
      expect(isEventPinProtected(undefined)).toBe(false);
      expect(isEventPinProtected("")).toBe(false);
      expect(isEventPinProtected("   ")).toBe(false);
    });

    it("should report protected when a valid PIN is configured", () => {
      expect(isEventPinProtected("1234")).toBe(true);
      expect(isEventPinProtected("987654")).toBe(true);
      expect(isEventPinProtected(" ADMIN ")).toBe(true);
    });

    it("should permit open access when event has no PIN", () => {
      expect(verifyOperatorPin(undefined, "")).toBe(true);
      expect(verifyOperatorPin("any_pin", "")).toBe(true);
      expect(verifyOperatorPin("", undefined)).toBe(true);
    });

    it("should reject invalid PIN when event is PIN protected", () => {
      expect(verifyOperatorPin("9999", "1234")).toBe(false);
      expect(verifyOperatorPin("", "1234")).toBe(false);
      expect(verifyOperatorPin(undefined, "1234")).toBe(false);
    });

    it("should accept matching PIN for protected event", () => {
      expect(verifyOperatorPin("1234", "1234")).toBe(true);
      expect(verifyOperatorPin(" 1234 ", "1234")).toBe(true);
      expect(verifyOperatorPin("PASS2026", "PASS2026")).toBe(true);
    });
  });

  describe("Session Storage Unlock Management", () => {
    const testCode = "FS9K-7M2P";

    it("should return false before event is unlocked", () => {
      expect(isEventUnlockedInSession(testCode)).toBe(false);
    });

    it("should remember unlock status once set", () => {
      setEventUnlockedInSession(testCode);
      expect(isEventUnlockedInSession(testCode)).toBe(true);
      // Normalized matching: with or without hyphen
      expect(isEventUnlockedInSession("FS9K7M2P")).toBe(true);
    });

    it("should relock event when cleared", () => {
      setEventUnlockedInSession(testCode);
      expect(isEventUnlockedInSession(testCode)).toBe(true);

      clearEventUnlockedInSession(testCode);
      expect(isEventUnlockedInSession(testCode)).toBe(false);
    });
  });

  describe("Event Storage PIN Persistence", () => {
    it("should persist and update event PIN in storage", () => {
      const eventCode = "FS9K-TEST";
      saveEventToStorage({
        ...DEFAULT_DEMO_EVENT,
        eventCode,
        pin: "",
      });

      const loadedInitial = loadEventFromStorage(eventCode);
      expect(loadedInitial?.pin).toBe("");

      // Update PIN
      const updated = updateEventPin(eventCode, "5566");
      expect(updated?.pin).toBe("5566");

      const loadedUpdated = loadEventFromStorage(eventCode);
      expect(loadedUpdated?.pin).toBe("5566");
      expect(isEventPinProtected(loadedUpdated?.pin)).toBe(true);
    });
  });
});
