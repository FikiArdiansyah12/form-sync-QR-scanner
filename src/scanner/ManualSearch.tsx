import React, { useState, useMemo } from "react";
import { Search, CheckCircle2, UserCheck, AlertCircle } from "lucide-react";
import { Attendee, CheckInValidationResult } from "../core/types";
import { matchesAttendeeSearch } from "../core/storage";

export interface ManualSearchProps {
  attendees: Attendee[];
  onCheckIn: (ticketCode: string) => CheckInValidationResult;
  onRevert?: (ticketCode: string) => void;
}

/**
 * Komponen pencarian manual instan nama, email, tiket, dan organisasi
 * untuk check-in mandiri tanpa kamera.
 * Dirancang selaras dengan antarmuka modal dialog resmi FormSync.
 */
export function ManualSearch({ attendees, onCheckIn, onRevert }: ManualSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [lastResult, setLastResult] = useState<CheckInValidationResult | null>(null);

  const filteredAttendees = useMemo(() => {
    const q = searchTerm.trim();
    if (!q) {
      return attendees.slice(0, 8);
    }
    return attendees.filter((a) => matchesAttendeeSearch(a, q));
  }, [attendees, searchTerm]);

  const handleTriggerCheckIn = (ticketCode: string) => {
    const res = onCheckIn(ticketCode);
    setLastResult(res);
  };

  return (
    <div className="flex flex-col gap-3 font-sans text-slate-900 select-none">
      {/* Search Input Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by attendee name, ticket code, or organization..."
          className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-300 bg-slate-50 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 transition-all"
        />
      </div>

      {/* Result Status Banner (Saat tiket baru saja di-scan atau di-check-in) */}
      {lastResult && (
        <div
          className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs transition-all ${
            lastResult.success
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {lastResult.success ? (
            <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-600" />
          ) : (
            <AlertCircle className="size-4 shrink-0 mt-0.5 text-rose-600" />
          )}
          <div className="flex-1">
            <span className="font-bold block">{lastResult.message}</span>
            {lastResult.attendee && (
              <span className="opacity-90 mt-0.5 block text-[11px]">
                {lastResult.attendee.name} ({lastResult.attendee.ticketCode})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Attendees List */}
      <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1">
        {filteredAttendees.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            No attendees matching your search.
          </div>
        ) : (
          filteredAttendees.map((att) => {
            const isCheckedIn = att.status === "present";
            return (
              <div
                key={att.id}
                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-100/70 transition-colors"
              >
                <div className="flex flex-col gap-0.5 min-w-0 pr-3">
                  <span className="text-xs font-bold text-slate-900 truncate">
                    {att.name}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="font-mono bg-white border border-slate-200 px-1.5 py-0.2 rounded text-[10px] text-slate-700 font-semibold">
                      {att.ticketCode}
                    </span>
                    {att.organization && (
                      <span className="truncate">{att.organization}</span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {isCheckedIn ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <UserCheck className="size-3 text-emerald-600" />
                        Checked In
                      </span>
                      {onRevert && (
                        <button
                          type="button"
                          onClick={() => onRevert(att.ticketCode)}
                          className="text-[11px] text-slate-500 hover:text-slate-900 underline decoration-dotted cursor-pointer px-1 py-0.5 transition-colors"
                          title="Revert check-in status"
                        >
                          Revert
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleTriggerCheckIn(att.ticketCode)}
                      className="h-8 px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-2xs"
                    >
                      <span>Check In</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
export default ManualSearch;
