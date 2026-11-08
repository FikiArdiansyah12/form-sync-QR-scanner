import { describe, it, expect } from "vitest";
import {
  validateTicketForEvent,
  verifyWorkspaceSecret,
} from "../src/core/securityLock";
import { type WorkspaceEventConfig } from "../src/core/types";

describe("securityLock (Multi-Tenant Isolation & Check-In Enforcement)", () => {
  const mockEventA: WorkspaceEventConfig = {
    eventCode: "FS9K-7M2P",
    eventName: "Acara A",
    eventDate: "2026-11-20",
    isActive: true,
    isLocked: true,
    securitySecret: "secret_a_123",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attendees: [
      {
        id: "att-a1",
        ticketCode: "FS9K-7M2P:TKT-001",
        name: "Peserta A1",
        status: "pending",
      },
      {
        id: "att-a2",
        ticketCode: "FS9K-7M2P:TKT-002",
        name: "Peserta A2 (Sudah Hadir)",
        status: "present",
        checkInTime: "08:30:00",
      },
    ],
  };

  const mockEventB: WorkspaceEventConfig = {
    eventCode: "B4R8-9T2X",
    eventName: "Acara B",
    eventDate: "2026-11-20",
    isActive: true,
    isLocked: true,
    securitySecret: "secret_b_456",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attendees: [
      {
        id: "att-b1",
        ticketCode: "B4R8-9T2X:TKT-999",
        name: "Peserta B1",
        status: "pending",
      },
    ],
  };

  it("harus menolak tiket jika acara sedang dinonaktifkan (Kill Switch Active)", () => {
    const inactiveEvent = { ...mockEventA, isActive: false };
    const result = validateTicketForEvent("FS9K-7M2P:TKT-001", inactiveEvent);

    expect(result.success).toBe(false);
    expect(result.status).toBe("event_inactive");
    expect(result.message).toContain("inactive");
  });

  it("harus menolak tiket Acara A jika dipindai di Acara B (Cross-Event Mismatch)", () => {
    // Panitia Acara B mencoba scan tiket Acara A
    const result = validateTicketForEvent("FS9K-7M2P:TKT-001", mockEventB);

    expect(result.success).toBe(false);
    expect(result.status).toBe("event_mismatch");
    expect(result.message).toContain("different event");
  });

  it("harus menolak tiket yang tidak terdaftar di direktori", () => {
    const result = validateTicketForEvent("FS9K-7M2P:TKT-FAKE-999", mockEventA);

    expect(result.success).toBe(false);
    expect(result.status).toBe("not_found");
  });

  it("harus menolak check-in ganda (Atomic Replay Protection)", () => {
    // Peserta A2 sudah berstatus 'present'
    const result = validateTicketForEvent("FS9K-7M2P:TKT-002", mockEventA);

    expect(result.success).toBe(false);
    expect(result.status).toBe("already_checked_in");
    expect(result.message).toContain("Already checked in");
  });

  it("harus meloloskan tiket yang sah dan belum hadir", () => {
    const result = validateTicketForEvent("FS9K-7M2P:TKT-001", mockEventA);

    expect(result.success).toBe(true);
    expect(result.status).toBe("checked_in");
    expect(result.attendee?.id).toBe("att-a1");
    expect(result.message).toContain("Peserta A1");
  });

  it("harus memvalidasi kecocokan token rahasia workspace", () => {
    expect(verifyWorkspaceSecret("secret_a_123", "secret_a_123")).toBe(true);
    expect(verifyWorkspaceSecret("wrong_secret", "secret_a_123")).toBe(false);
    expect(verifyWorkspaceSecret("", "secret_a_123")).toBe(false);
  });
});
