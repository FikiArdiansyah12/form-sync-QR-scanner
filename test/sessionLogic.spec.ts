import { describe, it, expect } from "vitest";
import {
  validateTicketForSession,
} from "../src/core/securityLock";
import {
  processSessionCheckIn,
  addSessionToEvent,
  toggleSessionStatus,
  filterCrossCheckMatrix,
  exportMatrixToCsv,
} from "../src/core/storage";
import { WorkspaceEventConfig, Attendee } from "../src/core/types";

describe("Multi-Session Attendance Logic & Anti Double-Claim", () => {
  const mockAttendees: Attendee[] = [
    {
      id: "att-001",
      ticketCode: "FS9K-7M2P:TKT-101",
      name: "Budi Santoso",
      organization: "PT Teknologi Nusantara",
      status: "present",
      checkInTime: "08:45:12",
      sessions: {
        morning: { status: "present", checkInTime: "08:45:12" },
        lunch: { status: "claimed", checkInTime: "12:15:30" },
      },
    },
    {
      id: "att-002",
      ticketCode: "FS9K-7M2P:TKT-102",
      name: "Siti Rahmawati",
      organization: "Institut Teknologi Digital",
      status: "present",
      sessions: {
        morning: { status: "present", checkInTime: "08:50:00" },
        lunch: { status: "pending" },
      },
    },
    {
      id: "att-003",
      ticketCode: "FS9K-7M2P:TKT-103",
      name: "Ahmad Fauzi",
      organization: "FinTech Solusindo",
      status: "pending",
      sessions: {
        morning: { status: "pending" },
        lunch: { status: "pending" },
      },
    },
  ];

  const getFreshEvent = (): WorkspaceEventConfig => ({
    eventCode: "FS9K-7M2P",
    eventName: "Test Multi-Session Event",
    eventDate: "2026-11-20",
    location: "Hall A",
    isActive: true,
    isLocked: false,
    securitySecret: "test-secret",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sessions: [
      { id: "morning", name: "Morning Check-In", type: "checkin", isActive: true },
      { id: "lunch", name: "Lunch Box Claim", type: "redemption", isActive: true },
      { id: "souvenir", name: "Kit & Souvenir", type: "redemption", isActive: true },
    ],
    activeSessionId: "morning",
    attendees: JSON.parse(JSON.stringify(mockAttendees)),
  });

  it("should allow check-in for morning session and record status as present", () => {
    const event = getFreshEvent();
    // att-003 belum hadir di sesi apapun
    const res = validateTicketForSession("FS9K-7M2P:TKT-103", event, "morning");
    expect(res.success).toBe(true);
    expect(res.status).toBe("checked_in");

    const { updatedEvent } = processSessionCheckIn(event, "FS9K-7M2P:TKT-103", "morning");
    const att3 = updatedEvent.attendees.find((a) => a.id === "att-003");
    expect(att3?.sessions?.morning?.status).toBe("present");
    expect(att3?.sessions?.morning?.checkInTime).toBeDefined();
  });

  it("should reject double check-in on the same session (anti double-claim)", () => {
    const event = getFreshEvent();
    // att-001 sudah present di morning dan claimed di lunch
    const morningCheck = validateTicketForSession("FS9K-7M2P:TKT-101", event, "morning");
    expect(morningCheck.success).toBe(false);
    expect(morningCheck.status).toBe("already_checked_in");
    expect(morningCheck.message).toContain("Already checked in");

    const lunchCheck = validateTicketForSession("FS9K-7M2P:TKT-101", event, "lunch");
    expect(lunchCheck.success).toBe(false);
    expect(lunchCheck.status).toBe("already_checked_in");
    expect(lunchCheck.message).toContain("Already claimed");
  });

  it("should allow claiming a different session even if already checked in to another", () => {
    const event = getFreshEvent();
    // att-002 sudah present di morning, tapi lunch masih pending
    const lunchCheck = validateTicketForSession("FS9K-7M2P:TKT-102", event, "lunch");
    expect(lunchCheck.success).toBe(true);
    expect(lunchCheck.status).toBe("checked_in");

    const { updatedEvent } = processSessionCheckIn(event, "FS9K-7M2P:TKT-102", "lunch");
    const att2 = updatedEvent.attendees.find((a) => a.id === "att-002");
    expect(att2?.sessions?.lunch?.status).toBe("claimed");
  });

  it("should reject check-in if session is deactivated by coordinator", () => {
    let event = getFreshEvent();
    event = toggleSessionStatus(event, "morning", false);

    const check = validateTicketForSession("FS9K-7M2P:TKT-103", event, "morning");
    expect(check.success).toBe(false);
    expect(check.status).toBe("session_inactive");
    expect(check.message).toContain("Check-in is closed");
  });

  it("should dynamically add a new session and allow check-in", () => {
    let event = getFreshEvent();
    event = addSessionToEvent(event, "Gala Dinner", "redemption", "Evening dinner table access");

    const dinnerSession = event.sessions.find((s) => s.name === "Gala Dinner");
    expect(dinnerSession).toBeDefined();
    expect(dinnerSession?.type).toBe("redemption");

    const check = validateTicketForSession("FS9K-7M2P:TKT-103", event, dinnerSession?.id);
    expect(check.success).toBe(true);
  });

  it("should filter cross-check matrix by morning-only attendees", () => {
    const event = getFreshEvent();
    // att-002 hadir di morning tapi lunch pending
    const morningOnly = filterCrossCheckMatrix(event.attendees, "morning_only", event.sessions);
    expect(morningOnly.length).toBe(1);
    expect(morningOnly[0].id).toBe("att-002");
  });

  it("should export matrix data to CSV properly with session column headers", () => {
    const event = getFreshEvent();
    const csv = exportMatrixToCsv(event.attendees, event.sessions);
    expect(csv).toContain("Morning Check-In");
    expect(csv).toContain("Lunch Box Claim");
    expect(csv).toContain("Kit & Souvenir");
    expect(csv).toContain("Budi Santoso");
    expect(csv).toContain("Present");
    expect(csv).toContain("Claimed");
  });
});
