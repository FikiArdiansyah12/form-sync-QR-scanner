import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import {
  calculateAttendanceStats,
  processCheckIn,
  revertCheckIn,
  toggleEventStatus,
  exportAttendeesToCsv,
  saveWebhookMapping,
  getWebhookForEvent,
  removeWebhookMapping,
  removeEventFromStorage,
  isEventWorkspacePaired,
  registerWorkspaceEvent,
  saveEventToStorage,
  deleteSessionFromEvent,
} from "../src/core/storage";
import { type WorkspaceEventConfig, type Attendee } from "../src/core/types";

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

describe("storage (Attendance Metrics & Check-In Silo)", () => {
  let testEvent: WorkspaceEventConfig;
  const memLocal = createMemoryStorage();

  beforeAll(() => {
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: memLocal },
      writable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: memLocal,
      writable: true,
    });
  });

  const mockAttendees: Attendee[] = [
    {
      id: "att-001",
      ticketCode: "FS9K-7M2P:TKT-101",
      name: "Budi Santoso",
      organization: "PT Teknologi Nusantara",
      status: "present",
      checkInTime: "08:45:12",
    },
    {
      id: "att-002",
      ticketCode: "FS9K-7M2P:TKT-102",
      name: "Siti Rahmawati",
      organization: "Institut Teknologi Digital",
      status: "pending",
    },
    {
      id: "att-003",
      ticketCode: "FS9K-7M2P:TKT-103",
      name: "Ahmad Fauzi",
      organization: "FinTech Solusindo",
      status: "pending",
    },
    {
      id: "att-004",
      ticketCode: "FS9K-7M2P:TKT-104",
      name: "Dewi Lestari",
      organization: "Global Cloud Systems",
      status: "present",
      checkInTime: "09:02:45",
    },
    {
      id: "att-005",
      ticketCode: "FS9K-7M2P:TKT-105",
      name: "Rian Pratama",
      organization: "Cyber Security Labs",
      status: "pending",
    },
  ];

  beforeEach(() => {
    testEvent = {
      eventCode: "FS9K-7M2P",
      eventName: "Test Event Workspace",
      eventDate: "2026-11-20",
      location: "Main Auditorium",
      isActive: true,
      isLocked: false,
      securitySecret: "test-secret",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessions: [
        { id: "morning", name: "Morning Check-In", type: "checkin", isActive: true },
      ],
      activeSessionId: "morning",
      attendees: JSON.parse(JSON.stringify(mockAttendees)),
    };
  });

  it("harus menghitung statistik kehadiran dengan tepat", () => {
    // 5 peserta: 2 present, 3 pending
    const stats = calculateAttendanceStats(testEvent.attendees);

    expect(stats.total).toBe(5);
    expect(stats.present).toBe(2);
    expect(stats.pending).toBe(3);
    expect(stats.percentage).toBe(40); // 2/5 = 40%
  });

  it("harus mengembalikan nilai 0 jika daftar peserta kosong", () => {
    const stats = calculateAttendanceStats([]);
    expect(stats.total).toBe(0);
    expect(stats.present).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.percentage).toBe(0);
  });

  it("harus memproses check-in peserta yang valid dan memperbarui status", () => {
    // att-002 (Siti Rahmawati) berstatus pending
    const { result, updatedEvent } = processCheckIn(testEvent, "FS9K-7M2P:TKT-102");

    expect(result.success).toBe(true);
    expect(result.status).toBe("checked_in");

    const updatedAttendee = updatedEvent.attendees.find((a) => a.id === "att-002")!;
    expect(updatedAttendee.status).toBe("present");
    expect(updatedAttendee.checkInTime).toBeDefined();

    // Verifikasi rasio kehadiran meningkat
    const newStats = calculateAttendanceStats(updatedEvent.attendees);
    expect(newStats.present).toBe(3);
    expect(newStats.percentage).toBe(60); // 3/5 = 60%
  });

  it("harus dapat membatalkan status check-in (revert)", () => {
    // att-001 berstatus present, lakukan revert
    const reverted = revertCheckIn(testEvent, "att-001");
    const attendee = reverted.attendees.find((a) => a.id === "att-001")!;

    expect(attendee.status).toBe("pending");
    expect(attendee.checkInTime).toBeUndefined();

    const stats = calculateAttendanceStats(reverted.attendees);
    expect(stats.present).toBe(1);
  });

  it("harus dapat mengubah sakelar status event (Active/Inactive)", () => {
    const disabled = toggleEventStatus(testEvent, false);
    expect(disabled.isActive).toBe(false);

    const reenabled = toggleEventStatus(disabled, true);
    expect(reenabled.isActive).toBe(true);
  });

  it("harus menghasilkan format CSV yang valid dan mencakup semua kolom", () => {
    const csv = exportAttendeesToCsv(testEvent.attendees);

    expect(csv).toContain("Ticket Code,Name,Organization,Email,Phone,Status,Check-in Time,Table Number");
    expect(csv).toContain("Budi Santoso");
    expect(csv).toContain("PT Teknologi Nusantara");
    expect(csv).toContain("present");
  });

  it("harus dapat menyimpan dan mengambil pemetaan persistent Webhook URL untuk event tertentu", () => {
    const dummyCode = "ABCD-1234";
    const dummyWebhook = "https://script.google.com/macros/s/AKfycb_sample/exec";

    saveWebhookMapping(dummyCode, dummyWebhook);
    const retrieved = getWebhookForEvent(dummyCode);
    expect(retrieved).toBe(dummyWebhook);

    // Harus tahan terhadap format tanpa tanda strip
    const retrievedWithoutHyphen = getWebhookForEvent("ABCD1234");
    expect(retrievedWithoutHyphen).toBe(dummyWebhook);

    // Event yang belum pernah dipetakan harus mengembalikan null
    expect(getWebhookForEvent("NONEXISTENT")).toBeNull();
  });

  it("isEventWorkspacePaired harus memverifikasi apakah workspace sudah terpasang webhook valid", () => {
    const code = "TEST-9999";
    // Belum pernah dibuat
    expect(isEventWorkspacePaired(code)).toBe(false);

    // Dibuat tapi belum ada webhook
    const ev = registerWorkspaceEvent(code);
    saveEventToStorage(ev);
    expect(isEventWorkspacePaired(code)).toBe(false);

    // Ditambahkan webhook mati (AKfycby_4eb)
    ev.spreadsheetWebhookUrl = "https://script.google.com/macros/s/AKfycby_4eb0VxAd6istXNWQ5-Bjs5NPTgW_WoolzbauQuwLJX40m4Ih/exec";
    saveEventToStorage(ev);
    expect(isEventWorkspacePaired(code)).toBe(false);

    // Ditambahkan webhook aktif valid
    ev.spreadsheetWebhookUrl = "https://script.google.com/macros/s/AKfycbxAu0QtKScozu4S9YyKbPaWXE7G4eZftizHydS_zKhu9SlAzrghsJCx40JUwBm5bd8FiQ/exec";
    saveEventToStorage(ev);
    expect(isEventWorkspacePaired(code)).toBe(true);
  });

  it("removeEventFromStorage dan removeWebhookMapping harus membersihkan seluruh data acara dari storage lokal", () => {
    const code = "DEL-1234";
    const wh = "https://script.google.com/macros/s/AKfycbxAu0QtKScozu4S9YyKbPaWXE7G4eZftizHydS_zKhu9SlAzrghsJCx40JUwBm5bd8FiQ/exec";

    saveWebhookMapping(code, wh);
    const ev = registerWorkspaceEvent(code);
    ev.spreadsheetWebhookUrl = wh;
    saveEventToStorage(ev);

    expect(isEventWorkspacePaired(code)).toBe(true);

    // Hapus acara
    removeEventFromStorage(code);

    expect(isEventWorkspacePaired(code)).toBe(false);
    expect(getWebhookForEvent(code)).toBeNull();
  });

  it("deleteSessionFromEvent harus menghapus sesi berdasarkan ID maupun duplikat nama yang sama", () => {
    const ev: WorkspaceEventConfig = {
      ...testEvent,
      sessions: [
        { id: "apel_pagi", name: "APEL PAGI", type: "checkin", isActive: true },
        { id: "sa", name: "sa", type: "checkin", isActive: true },
        { id: "sess_duplicate_sa", name: "SA", type: "checkin", isActive: true },
      ],
      activeSessionId: "sa",
    };

    const updated = deleteSessionFromEvent(ev, "sa");
    expect(updated.sessions.length).toBe(1);
    expect(updated.sessions[0].name).toBe("APEL PAGI");
    expect(updated.activeSessionId).toBe("apel_pagi");
  });
});
