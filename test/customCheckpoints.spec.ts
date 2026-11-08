import { describe, it, expect } from "vitest";
import {
  DEFAULT_DEMO_EVENT,
  addSessionToEvent,
  deleteSessionFromEvent,
  processSessionCheckIn,
} from "../src/core/storage";
import { validateTicketForSession } from "../src/core/securityLock";
import { WorkspaceEventConfig, Attendee } from "../src/core/types";

describe("Custom Checkpoints Created by User (Zero Default Sessions)", () => {
  it("DEFAULT_DEMO_EVENT harus murni kosong tanpa sesi dan tanpa peserta default", () => {
    expect(DEFAULT_DEMO_EVENT.sessions.length).toBe(0);
    expect(DEFAULT_DEMO_EVENT.attendees.length).toBe(0);
    expect(DEFAULT_DEMO_EVENT.activeSessionId).toBe("");
  });

  it("harus memungkinkan user membuat checkpoint kustom secara dinamis", () => {
    let event: WorkspaceEventConfig = {
      ...DEFAULT_DEMO_EVENT,
      sessions: [],
      attendees: [],
    };

    // User menambahkan checkpoint kustom "Main Gate"
    event = addSessionToEvent(event, "Main Gate", "checkin", "Pintu masuk utama");
    expect(event.sessions.length).toBe(1);
    expect(event.sessions[0].name).toBe("Main Gate");
    expect(event.sessions[0].type).toBe("checkin");
    expect(event.activeSessionId).toBe(event.sessions[0].id);

    // User menambahkan checkpoint kedua "Lunch Voucher"
    event = addSessionToEvent(event, "Lunch Voucher", "redemption", "Kupon makan siang");
    expect(event.sessions.length).toBe(2);
    expect(event.sessions[1].name).toBe("Lunch Voucher");
    expect(event.sessions[1].type).toBe("redemption");
  });

  it("harus memungkinkan user menghapus checkpoint yang tidak diinginkan", () => {
    let event: WorkspaceEventConfig = {
      ...DEFAULT_DEMO_EVENT,
      sessions: [],
      attendees: [],
    };

    event = addSessionToEvent(event, "Workshop Gate", "checkin");
    const sessionId = event.sessions[0].id;

    event = deleteSessionFromEvent(event, sessionId);
    expect(event.sessions.length).toBe(0);
    expect(event.activeSessionId).toBe("");
  });

  it("harus dapat melakukan validasi check-in pada checkpoint kustom buatan user", () => {
    const mockAttendee: Attendee = {
      id: "att-user-1",
      ticketCode: "FS9K-7M2P:TKT-999",
      name: "Custom User",
      status: "pending",
    };

    let event: WorkspaceEventConfig = {
      ...DEFAULT_DEMO_EVENT,
      eventCode: "FS9K-7M2P",
      sessions: [],
      attendees: [mockAttendee],
    };

    // Buat checkpoint kustom
    event = addSessionToEvent(event, "Pintu Masuk VIP", "checkin");
    const vipSession = event.sessions[0];

    // Validasi tiket
    const val = validateTicketForSession("FS9K-7M2P:TKT-999", event, vipSession.id);
    expect(val.success).toBe(true);
    expect(val.status).toBe("checked_in");

    // Eksekusi check-in
    const { result, updatedEvent } = processSessionCheckIn(event, "FS9K-7M2P:TKT-999", vipSession.id);
    expect(result.success).toBe(true);

    const checkedAtt = updatedEvent.attendees.find((a) => a.id === "att-user-1");
    expect(checkedAtt?.sessions?.[vipSession.id]?.status).toBe("present");
  });
});
