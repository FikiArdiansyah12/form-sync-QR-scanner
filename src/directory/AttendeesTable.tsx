import React from "react";
import { UserCheck, Clock, Users } from "lucide-react";
import { Attendee, CheckInValidationResult } from "../core/types";
import { AttendeeRowMeta } from "./AttendeeRowMeta";

export interface AttendeesTableProps {
  attendees: Attendee[];
  onCheckIn: (ticketCode: string) => CheckInValidationResult;
  onRevert: (attendeeId: string) => void;
  onSync?: () => void;
  isSyncing?: boolean;
}

/**
 * AttendeesTable
 * Tabel & daftar peserta dengan dukungan tampilan responsif:
 * - Mobile (< sm): Tampilan Card List fleksibel tanpa scroll horizontal yang rusak.
 * - Desktop (>= sm): Tampilan tabel tabular 6 kolom yang lengkap.
 */
export function AttendeesTable({
  attendees,
  onCheckIn,
  onRevert,
  onSync,
  isSyncing,
}: AttendeesTableProps) {
  const formatTime = (timeStr?: string) => {
    return timeStr || "—";
  };

  return (
    <div className="w-full">
      {/* 1. TAMPILAN MOBILE (< sm): CARD LIST */}
      <div className="sm:hidden space-y-2.5">
        {attendees.length === 0 ? (
          <div className="py-8 px-4 text-center border border-dashed border-slate-200 rounded-xl bg-white flex flex-col items-center justify-center gap-2 shadow-2xs">
            <Users className="size-6 text-slate-400" />
            <span className="font-semibold text-slate-800 text-xs">No Attendee Records</span>
            <span className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
              Connect to Google Sheets to populate your attendee list.
            </span>
            {onSync && (
              <button
                type="button"
                onClick={onSync}
                disabled={isSyncing}
                className="mt-1 h-8 px-3.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSyncing ? "Syncing Records..." : "Sync Records"}
              </button>
            )}
          </div>
        ) : (
          attendees.map((att) => {
            const isPresent = att.status === "present";
            return (
              <div
                key={att.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col gap-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-slate-900 text-sm truncate">{att.name}</span>
                    {att.email && (
                      <span className="text-[11px] text-slate-500 truncate">{att.email}</span>
                    )}
                  </div>
                  <div className="shrink-0">
                    {isPresent ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <UserCheck className="size-3 text-emerald-600" />
                        <span>Present</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        <Clock className="size-3 text-slate-500" />
                        <span>Pending</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[11px] bg-slate-50 px-2 py-0.5 rounded border border-slate-200 font-bold text-slate-700 shrink-0">
                      {att.ticketCode}
                    </span>
                    {att.organization && (
                      <span className="text-slate-500 text-[11px] truncate">
                        {att.organization}
                      </span>
                    )}
                  </div>

                  <div className="shrink-0">
                    {isPresent ? (
                      <button
                        type="button"
                        onClick={() => onRevert(att.id)}
                        className="h-8 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        Undo
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onCheckIn(att.ticketCode)}
                        className="h-8 px-3.5 rounded-lg bg-slate-900 text-white text-xs font-bold cursor-pointer hover:bg-slate-800 transition-colors shadow-2xs"
                      >
                        Check In
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 2. TAMPILAN DESKTOP (>= sm): TABULAR TABLE */}
      <div className="hidden sm:block w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse font-sans">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
            <tr>
              <th className="py-2.5 px-3.5">Attendee Name</th>
              <th className="py-2.5 px-3.5">Ticket Code</th>
              <th className="py-2.5 px-3.5">Organization / Team</th>
              <th className="py-2.5 px-3.5">Status</th>
              <th className="py-2.5 px-3.5">Check-In Time</th>
              <th className="py-2.5 px-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {attendees.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-xs text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Users className="size-6 text-slate-400" />
                    <span className="font-semibold text-slate-700">No Attendee Records</span>
                    <span className="text-[11px] text-slate-400">Connect to Google Sheets to populate your attendee list.</span>
                    {onSync && (
                      <button
                        type="button"
                        onClick={onSync}
                        disabled={isSyncing}
                        className="mt-1 h-8 px-3.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isSyncing ? "Syncing Records..." : "Sync Records"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              attendees.map((att) => {
                const isPresent = att.status === "present";
                return (
                  <tr
                    key={att.id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <AttendeeRowMeta attendee={att} />

                    <td className="py-2.5 px-3.5">
                      {isPresent ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-mono font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <UserCheck className="size-2.5 text-emerald-600" />
                          <span>Present</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          <Clock className="size-2.5 text-slate-500" />
                          <span>Pending</span>
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3.5 text-slate-500 text-[11px] font-mono">
                      {formatTime(att.checkInTime)}
                    </td>

                    <td className="py-2.5 px-3.5 text-right">
                      {isPresent ? (
                        <button
                          type="button"
                          onClick={() => onRevert(att.id)}
                          className="px-2.5 py-1 rounded-md border border-slate-200 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          Undo
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onCheckIn(att.ticketCode)}
                          className="px-3 py-1 rounded-md bg-slate-900 text-white text-[11px] font-semibold cursor-pointer hover:bg-slate-800 transition-colors"
                        >
                          Check In
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
