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
});
