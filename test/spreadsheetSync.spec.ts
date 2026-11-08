import { describe, it, expect, vi } from "vitest";
import {
  fetchEventFromSpreadsheet,
  syncCheckInToSpreadsheet,
  mergeRemoteAttendees,
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
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            eventCode: "FS9K7M2P",
            ticketCode: "FS9K-7M2P:TKT-101",
            securitySecret,
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

    it("should return unchanged local config if remote is unsuccessful", () => {
      const local = DEFAULT_DEMO_EVENT;
      const remote = {
        success: false,
        error: "Server error",
      };

      const merged = mergeRemoteAttendees(local, remote);
      expect(merged).toBe(local);
    });
  });
});
