import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import {
  saveEventToStorage,
  loadEventFromStorage,
  processCheckIn,
  revertCheckIn,
  toggleEventStatus,
  exportAttendeesToCsv,
} from "../src/core/storage";
import { Attendee, WorkspaceEventConfig } from "../src/core/types";

describe("FormSync End-to-End Attendance Workflow", () => {
  const eventCode = "FS88-WORK";

  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => storageMap.get(key) || null,
    setItem: (key: string, value: string) => storageMap.set(key, value),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };

  beforeAll(() => {
    (global as any).window = { localStorage: mockLocalStorage };
    (global as any).localStorage = mockLocalStorage;
  });

  const initialAttendees: Attendee[] = [
    {
      id: "att_1",
      name: "Alice Johnson",
      email: "alice@example.com",
      ticketCode: "FS88-WORK:TKT-001",
      organization: "Acme Corp",
      status: "pending",
    },
    {
      id: "att_2",
      name: "Bob Smith",
      email: "bob@example.com",
      ticketCode: "FS88-WORK:TKT-002",
      organization: "Globex Ltd",
      status: "pending",
    },
    {
      id: "att_3",
      name: "Charlie Brown",
      email: "charlie@example.com",
      ticketCode: "FS88-WORK:TKT-003",
      organization: "Acme Corp",
      status: "present",
      checkInTime: "08:30:00",
    },
  ];

  const dummyConfig: WorkspaceEventConfig = {
    eventCode,
    eventName: "Tech Conference 2026",
    eventDate: "2026-11-20",
    isActive: true,
    isLocked: true,
    securitySecret: "demo-workflow-secret-key",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attendees: initialAttendees,
  };

  beforeEach(() => {
    storageMap.clear();
    saveEventToStorage(dummyConfig);
  });

  it("should retrieve initial attendee records accurately", () => {
    const event = loadEventFromStorage(eventCode);
    expect(event).not.toBeNull();
    expect(event!.attendees.length).toBe(3);

    const pending = event!.attendees.filter((a) => a.status === "pending");
    const present = event!.attendees.filter((a) => a.status === "present");

    expect(pending.length).toBe(2);
    expect(present.length).toBe(1);
    expect(present[0].name).toBe("Charlie Brown");
  });

  it("should successfully check in a pending attendee", () => {
    const event = loadEventFromStorage(eventCode)!;
    const { result, updatedEvent } = processCheckIn(event, "FS88-WORK:TKT-001");

    expect(result.success).toBe(true);
    expect(result.status).toBe("checked_in");
    expect(result.attendee?.status).toBe("present");
    expect(result.attendee?.checkInTime).toBeDefined();

    const updatedAlice = updatedEvent.attendees.find((a) => a.id === "att_1");
    expect(updatedAlice?.status).toBe("present");
    expect(updatedAlice?.checkInTime).toBeDefined();
  });

  it("should reject double check-in for an already checked in attendee", () => {
    const event = loadEventFromStorage(eventCode)!;
    const { result } = processCheckIn(event, "FS88-WORK:TKT-003");

    expect(result.success).toBe(false);
    expect(result.status).toBe("already_checked_in");
    expect(result.message).toMatch(/already checked in/i);
  });

  it("should reject check-in when event is inactive", () => {
    let event = loadEventFromStorage(eventCode)!;
    event = toggleEventStatus(event, false);

    const { result } = processCheckIn(event, "FS88-WORK:TKT-002");
    expect(result.success).toBe(false);
    expect(result.status).toBe("event_inactive");
    expect(result.message).toContain("inactive");
  });

  it("should revert checked-in status back to pending", () => {
    let event = loadEventFromStorage(eventCode)!;
    event = revertCheckIn(event, "att_3");

    const charlie = event.attendees.find((a) => a.id === "att_3");
    expect(charlie?.status).toBe("pending");
    expect(charlie?.checkInTime).toBeUndefined();
  });

  it("should export valid CSV containing headers and attendee rows", () => {
    const event = loadEventFromStorage(eventCode)!;
    const csv = exportAttendeesToCsv(event.attendees);

    expect(csv).toContain("Ticket Code,Name,Organization,Email,Phone,Status,Check-in Time,Table Number");
    expect(csv).toContain("Alice Johnson");
    expect(csv).toContain("Bob Smith");
    expect(csv).toContain("Charlie Brown");
  });
});
