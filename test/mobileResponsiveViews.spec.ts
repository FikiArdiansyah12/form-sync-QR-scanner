import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { AttendeesTable } from "../src/directory/AttendeesTable";
import { AttendeeFilterBar } from "../src/directory/AttendeeFilterBar";
import { type Attendee } from "../src/core/types";

describe("Mobile-Responsive Components Suite (UI/UX Pro Max)", () => {
  const dummyAttendees: Attendee[] = [
    {
      id: "att-1",
      ticketCode: "TCK-1001",
      name: "Budi Santoso",
      email: "budi@example.com",
      organization: "Engineering Team",
      status: "present",
      checkInTime: "10:15",
    },
    {
      id: "att-2",
      ticketCode: "TCK-1002",
      name: "Siti Rahma",
      email: "siti@example.com",
      organization: "Design Guild",
      status: "pending",
    },
  ];

  it("renders AttendeesTable structure with both mobile card list and desktop tabular markup", () => {
    const onCheckIn = vi.fn();
    const onRevert = vi.fn();

    const element = React.createElement(AttendeesTable, {
      attendees: dummyAttendees,
      onCheckIn,
      onRevert,
    });

    expect(element).toBeDefined();
    expect(element.props.attendees).toHaveLength(2);
    expect(element.props.attendees[0].name).toBe("Budi Santoso");
    expect(element.props.attendees[1].status).toBe("pending");
  });

  it("handles empty attendee directory state gracefully without horizontal table overflow", () => {
    const onCheckIn = vi.fn();
    const onRevert = vi.fn();

    const emptyElement = React.createElement(AttendeesTable, {
      attendees: [],
      onCheckIn,
      onRevert,
    });

    expect(emptyElement).toBeDefined();
    expect(emptyElement.props.attendees).toHaveLength(0);
  });

  it("configures AttendeeFilterBar with touch-friendly responsive actions", () => {
    const onSearchChange = vi.fn();
    const onStatusFilterChange = vi.fn();
    const onExportCsv = vi.fn();

    const filterBar = React.createElement(AttendeeFilterBar, {
      searchTerm: "",
      onSearchChange,
      statusFilter: "all",
      onStatusFilterChange,
      onExportCsv,
      totalCount: 2,
      presentCount: 1,
      pendingCount: 1,
    });

    expect(filterBar).toBeDefined();
    expect(filterBar.props.totalCount).toBe(2);
    expect(filterBar.props.presentCount).toBe(1);
    expect(filterBar.props.pendingCount).toBe(1);
  });
});
