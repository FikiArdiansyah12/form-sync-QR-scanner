import { describe, it, expect, vi } from "vitest";
import {
  fetchEventFromSpreadsheet,
  syncCheckInToSpreadsheet,
  syncRevertCheckInToSpreadsheet,
  syncCreateSessionToSpreadsheet,
  syncDeleteSessionToSpreadsheet,
  syncToggleSessionToSpreadsheet,
  requestAttendeeSyncFromSpreadsheet,
  mergeRemoteAttendees,
  extractValidWebhookUrl,
} from "../src/bridge/spreadsheetSync";
import { DEFAULT_DEMO_EVENT } from "../src/core/storage";

describe("Spreadsheet Sync Client", () => {
  const webhookUrl = "https://script.google.com/macros/s/AKfycbz_mock/exec";
  const eventCode = "FS9K-7M2P";
  const securitySecret = "demo-workspace-secret-key";

  describe("fetchEventFromSpreadsheet", () => {
    it("should return error when webhookUrl is empty", async () => {
      const res = await fetchEventFromSpreadsheet("", eventCode);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Spreadsheet webhook URL is required");
    });

    it("should return error when eventCode is empty", async () => {
      const res = await fetchEventFromSpreadsheet(webhookUrl, "");
      expect(res.success).toBe(false);
      expect(res.error).toContain("Event code is required");
    });

    it("should fetch event attendees successfully with formatted query parameter", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          eventCode: "FS9K-7M2P",
          attendees: [
            {
              id: "sheet-row-2",
              ticketCode: "FS9K-7M2P:TKT-101",
              name: "Alice Smith",
              status: "present",
            },
          ],
        }),
      });

      const res = await fetchEventFromSpreadsheet(webhookUrl, eventCode, mockFetch as unknown as typeof fetch);

      expect(mockFetch).toHaveBeenCalledWith(
        `${webhookUrl}?event=FS9K7M2P`,
        expect.objectContaining({ method: "GET" })
      );
      expect(res.success).toBe(true);
      expect(res.attendees?.length).toBe(1);
      expect(res.attendees?.[0].name).toBe("Alice Smith");
    });

    it("should handle HTTP errors gracefully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const res = await fetchEventFromSpreadsheet(webhookUrl, eventCode, mockFetch as unknown as typeof fetch);
      expect(res.success).toBe(false);
      expect(res.error).toContain("HTTP error from spreadsheet webhook: 500");
    });

    it("should handle network failure exceptions gracefully", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection timeout"));

      const res = await fetchEventFromSpreadsheet(webhookUrl, eventCode, mockFetch as unknown as typeof fetch);
      expect(res.success).toBe(false);
      expect(res.error).toBe("Connection timeout");
    });
  });

  describe("syncCheckInToSpreadsheet", () => {
    it("should validate required payload parameters", async () => {
      const res = await syncCheckInToSpreadsheet(webhookUrl, {
        eventCode: "",
        ticketCode: "TKT-101",
        securitySecret: "secret",
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Missing required check-in fields");
    });

    it("should dispatch POST check-in successfully", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: "Check-in recorded successfully for Alice Smith",
          name: "Alice Smith",
          checkInTime: "09:30:00",
        }),
      });

      const res = await syncCheckInToSpreadsheet(
        webhookUrl,
        {
          eventCode: "FS9K-7M2P",
          ticketCode: "FS9K-7M2P:TKT-101",
          securitySecret,
          checkInTime: "09:30:00",
        },
        mockFetch as unknown as typeof fetch
      );

      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "text/plain;charset=utf-8" }),
          body: JSON.stringify({
            action: "session_checkin",
            eventCode: "FS9K7M2P",
            ticketCode: "FS9K-7M2P:TKT-101",
            securitySecret,
            sessionId: "",
            checkInTime: "09:30:00",
          }),
        })
      );
      expect(res.success).toBe(true);
      expect(res.name).toBe("Alice Smith");
    });

    it("should catch fetch failure when syncing check-in", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network offline"));

      const res = await syncCheckInToSpreadsheet(
        webhookUrl,
        {
          eventCode: "FS9K-7M2P",
          ticketCode: "FS9K-7M2P:TKT-101",
          securitySecret,
        },
        mockFetch as unknown as typeof fetch
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe("Network offline");
    });
  });

  describe("syncCreateSessionToSpreadsheet", () => {
    it("should validate required session parameters", async () => {
      const res = await syncCreateSessionToSpreadsheet("", {
        eventCode: "FS9K-7M2P",
        securitySecret: "secret",
        sessionName: "olama",
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Spreadsheet webhook URL is required");

      const res2 = await syncCreateSessionToSpreadsheet(webhookUrl, {
        eventCode: "",
        securitySecret: "secret",
        sessionName: "olama",
      });
      expect(res2.success).toBe(false);
      expect(res2.error).toContain("Missing required session fields");
    });

    it("should dispatch POST create_session with proper body", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: "Session 'olama' columns created successfully in spreadsheet.",
          sessions: [{ id: "olama", name: "olama", type: "checkin", isActive: true }],
        }),
      });

      const res = await syncCreateSessionToSpreadsheet(
        webhookUrl,
        {
          eventCode: "FS9K-7M2P",
          securitySecret: "demo-secret",
          sessionName: "olama",
          sessionType: "checkin",
        },
        mockFetch as unknown as typeof fetch
      );

      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "text/plain;charset=utf-8" }),
          body: JSON.stringify({
            action: "create_session",
            eventCode: "FS9K7M2P",
            securitySecret: "demo-secret",
            sessionName: "olama",
            sessionType: "checkin",
          }),
        })
      );
      expect(res.success).toBe(true);
      expect(res.sessions?.length).toBe(1);
    });
  });

  describe("requestAttendeeSyncFromSpreadsheet", () => {
    it("should dispatch sync_attendees action to spreadsheet", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: "Attendee synchronization executed.",
          syncResult: { success: true, addedCount: 5 },
        }),
      });

      const res = await requestAttendeeSyncFromSpreadsheet(
        webhookUrl,
        "FS9K-7M2P",
        "demo-secret",
        mockFetch as unknown as typeof fetch
      );

      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "sync_attendees",
            eventCode: "FS9K7M2P",
            securitySecret: "demo-secret",
          }),
        })
      );
      expect(res.success).toBe(true);
      expect(res.syncResult.addedCount).toBe(5);
    });
  });

  describe("mergeRemoteAttendees", () => {
    it("should merge remote attendees and sessions correctly into event config", () => {
      const initialEvent = {
        eventCode: "8T8L-V86U",
        eventName: "Demo Event",
        securitySecret: "sec123",
        pin: "1234",
        isActive: true,
        sessions: [{ id: "session_1", name: "Morning", type: "checkin" as const }],
        attendees: [],
        createdAt: "2026-11-09T00:00:00Z",
        updatedAt: "2026-11-09T00:00:00Z",
      };

      const remoteData = {
        success: true,
        eventCode: "8T8L-V86U",
        attendees: [
          {
            id: "att_1",
            ticketCode: "TKT-101",
            name: "Budi Santoso",
            email: "budi@example.com",
            status: "pending" as const,
          },
        ],
        sessions: [
          { id: "session_1", name: "Morning", type: "checkin" as const },
          { id: "session_2", name: "Afternoon", type: "checkpoint" as const },
        ],
        updatedAt: "2026-11-09T01:00:00Z",
      };

      const merged = mergeRemoteAttendees(initialEvent, remoteData);
      expect(merged.attendees.length).toBe(1);
      expect(merged.attendees[0].name).toBe("Budi Santoso");
      expect(merged.sessions.length).toBe(2);
      expect(merged.sessions[1].name).toBe("Afternoon");
    });
  });

  describe("mergeRemoteAttendees", () => {
    it("should merge new attendees from remote into local event config", () => {
      const local = DEFAULT_DEMO_EVENT;
      const remote = {
        success: true,
        attendees: [
          {
            id: "remote-1",
            ticketCode: "FS9K-7M2P:TKT-999",
            name: "New Guest",
            status: "present" as const,
          },
        ],
        updatedAt: "2026-11-20T10:00:00.000Z",
      };

      const merged = mergeRemoteAttendees(local, remote);
      expect(merged.attendees.length).toBe(1);
      expect(merged.attendees[0].name).toBe("New Guest");
      expect(merged.updatedAt).toBe("2026-11-20T10:00:00.000Z");
    });

    it("should reject outdated deleted deployment URL (AKfycby_4eb)", () => {
      const outdated = "https://script.google.com/macros/s/AKfycby_4eb0VxAd6istXNWQ5-Bjs5NPTgW_WoolzbauQuwLJX40m4Ih/exec";
      const res = extractValidWebhookUrl(outdated);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("outdated deployment (404 Not Found)");
    });

    it("should handle WORKSPACE_DISCONNECTED error response gracefully on fetch", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          error: "WORKSPACE_DISCONNECTED",
          message: "This event workspace has been disconnected by administrator.",
        }),
      });

      const res = await fetchEventFromSpreadsheet(webhookUrl, eventCode, mockFetch as unknown as typeof fetch);
      expect(res.success).toBe(false);
      expect(res.error).toBe("WORKSPACE_DISCONNECTED");
      expect(res.message).toContain("disconnected");
    });

    it("should handle WORKSPACE_DISCONNECTED error response gracefully on check-in sync", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          error: "WORKSPACE_DISCONNECTED",
          message: "This event workspace has been disconnected by administrator.",
        }),
      });

      const res = await syncCheckInToSpreadsheet(
        webhookUrl,
        {
          eventCode: "FS9K-7M2P",
          ticketCode: "TKT-101",
          securitySecret: "sec123",
        },
        mockFetch as unknown as typeof fetch
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe("WORKSPACE_DISCONNECTED");
      expect(res.message).toContain("disconnected");
    });

    it("should return unchanged local config if remote is unsuccessful", () => {
      const local = DEFAULT_DEMO_EVENT;
      const remote = {
        success: false,
        error: "Server error",
      };

      const merged = mergeRemoteAttendees(local, remote);
      expect(merged).toBe(local);
    });

    it("should dispatch syncDeleteSessionToSpreadsheet correctly", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          deleted: true,
          sessionId: "main_gate",
          sessions: [],
        }),
      });

      const res = await syncDeleteSessionToSpreadsheet(
        webhookUrl,
        eventCode,
        securitySecret,
        "main_gate",
        mockFetch as unknown as typeof fetch
      );

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "delete_session",
            eventCode: "FS9K7M2P",
            securitySecret: securitySecret,
            sessionId: "main_gate",
          }),
        })
      );
    });

    it("should include sessionName when provided to syncDeleteSessionToSpreadsheet", async () => {
      const webhookUrl = "https://script.google.com/macros/s/AKfycbz_mock/exec";
      const eventCode = "FS9K7M2P";
      const securitySecret = "demo-workspace-secret-key";
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          deleted: true,
          sessionId: "main_gate",
          sessions: [],
        }),
      });

      const res = await syncDeleteSessionToSpreadsheet(
        webhookUrl,
        eventCode,
        securitySecret,
        "main_gate",
        mockFetch as unknown as typeof fetch,
        "APEL PAGI"
      );

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "delete_session",
            eventCode: "FS9K7M2P",
            securitySecret: securitySecret,
            sessionId: "main_gate",
            sessionName: "APEL PAGI",
          }),
        })
      );
    });

    it("should dispatch syncToggleSessionToSpreadsheet correctly", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          sessions: [{ id: "main_gate", name: "Main Gate", isActive: false }],
        }),
      });

      const res = await syncToggleSessionToSpreadsheet(
        webhookUrl,
        eventCode,
        securitySecret,
        "main_gate",
        false,
        mockFetch as unknown as typeof fetch
      );

      expect(res.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "toggle_session",
            eventCode: "FS9K7M2P",
            securitySecret: securitySecret,
            sessionId: "main_gate",
            isActive: false,
          }),
        })
      );
    });

    it("should clear local sessions when remote.sessions is explicitly an empty array", () => {
      const local = {
        ...DEFAULT_DEMO_EVENT,
        sessions: [{ id: "sa", name: "sa", type: "checkin" as const, isActive: true }],
      };
      const remote = {
        success: true,
        sessions: [],
        attendees: [],
      };
      const merged = mergeRemoteAttendees(local, remote);
      expect(merged.sessions).toEqual([]);
    });
  });

  describe("syncRevertCheckInToSpreadsheet", () => {
    it("should validate required revert fields", async () => {
      const res = await syncRevertCheckInToSpreadsheet(webhookUrl, {
        eventCode: "",
        ticketCode: "TKT-101",
        securitySecret,
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Missing required revert fields");
    });

    it("should dispatch POST revert_checkin with sessionId and sessionName", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          status: "reverted",
          clearedCells: 2,
          message: "Check-in status reverted for Alice Smith.",
        }),
      });

      const res = await syncRevertCheckInToSpreadsheet(
        webhookUrl,
        {
          eventCode: "8T8L-V86U",
          ticketCode: "REG-20261109-165405",
          securitySecret,
          sessionId: "asn",
          sessionName: "asn",
        },
        mockFetch as unknown as typeof fetch
      );

      expect(res.success).toBe(true);
      expect(res.clearedCells).toBe(2);
      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "revert_checkin",
            eventCode: "8T8LV86U",
            ticketCode: "REG-20261109-165405",
            securitySecret,
            sessionId: "asn",
            sessionName: "asn",
          }),
        })
      );
    });

    it("should handle WORKSPACE_DISCONNECTED when reverting check-in", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          error: "WORKSPACE_DISCONNECTED",
          message: "Workspace disconnected.",
        }),
      });

      const res = await syncRevertCheckInToSpreadsheet(
        webhookUrl,
        {
          eventCode: "8T8L-V86U",
          ticketCode: "REG-20261109-165405",
          securitySecret,
        },
        mockFetch as unknown as typeof fetch
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe("WORKSPACE_DISCONNECTED");
    });
  });
});
