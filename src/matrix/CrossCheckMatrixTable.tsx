import React, { useState, useMemo } from "react";
import { Search, Download, UserCheck, Clock, Layers, Users } from "lucide-react";
import {
  Attendee,
  AttendanceSession,
  CrossCheckFilterType,
} from "../core/types";
import { filterCrossCheckMatrix, exportMatrixToCsv, matchesAttendeeSearch } from "../core/storage";
import { AttendeeRowMeta } from "../directory/AttendeeRowMeta";

export interface CrossCheckMatrixTableProps {
  attendees: Attendee[];
  sessions: AttendanceSession[];
  onCheckInSession: (ticketCode: string, sessionId: string) => void;
  onRevertSession: (attendeeId: string, sessionId: string) => void;
  onOpenSync?: () => void;
}

/**
 * Tabel Matriks Cross-Check Presensi Multi-Sesi Profesional.
 * Mengikuti panduan UI/UX Pro Max untuk visualisasi data tabular yang bersih dan mudah dibaca.
 */
export function CrossCheckMatrixTable({
  attendees,
  sessions,
  onCheckInSession,
  onRevertSession,
  onOpenSync,
}: CrossCheckMatrixTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<CrossCheckFilterType>("all");

  // Filter berdasarkan tipe filter cross-check
  const filteredByType = useMemo(() => {
    return filterCrossCheckMatrix(attendees, filterType, sessions);
  }, [attendees, filterType, sessions]);

  // Filter lanjutan berdasarkan kata kunci pencarian
  const finalAttendees = useMemo(() => {
    const q = searchTerm.trim();
    if (!q) return filteredByType;
    return filteredByType.filter((a) => matchesAttendeeSearch(a, q));
  }, [filteredByType, searchTerm]);

  const handleExportCsv = () => {
    const csv = exportMatrixToCsv(attendees, sessions);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-matrix-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 1. Kasus: Belum ada checkpoint kustom yang dibuat pengguna
  if (sessions.length === 0) {
    return (
      <div className="py-12 px-6 text-center border border-dashed border-slate-300 rounded-2xl bg-white flex flex-col items-center gap-2.5 shadow-xs">
        <div className="size-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
          <Layers className="size-5" />
        </div>
        <h3 className="text-xs font-bold text-slate-900 tracking-tight">
          No Custom Checkpoints Created
        </h3>
        <p className="text-[11px] text-slate-500 max-w-sm leading-relaxed">
          Create checkpoints in the Scanner tab to monitor attendance across your event gates, meals, or sessions.
        </p>
      </div>
    );
  }

  // 2. Kasus: Checkpoint ada tetapi belum ada peserta
  if (attendees.length === 0) {
    return (
      <div className="py-12 px-6 text-center border border-dashed border-slate-300 rounded-2xl bg-white flex flex-col items-center gap-2.5 shadow-xs">
        <div className="size-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
          <Users className="size-5" />
        </div>
        <h3 className="text-xs font-bold text-slate-900 tracking-tight">
          No Attendees in Workspace
        </h3>
        <p className="text-[11px] text-slate-500 max-w-sm leading-relaxed">
          Your custom checkpoints are active ({sessions.map((s) => s.name).join(", ")}). Connect to Google Sheets to populate your attendee list.
        </p>
        {onOpenSync && (
          <button
            type="button"
            onClick={onOpenSync}
            className="mt-2 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 cursor-pointer transition-colors"
          >
            Open Sheets Sync
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 font-sans text-slate-900">
      {/* Control Bar: Pencarian, Filter Cepat, dan Tombol Export */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, ticket code, or organization..."
            className="w-full h-8.5 pl-8.5 pr-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-start gap-2 flex-wrap">
          {/* Segmented Filter Pills */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium flex-1 sm:flex-initial">
            <button
              type="button"
              onClick={() => setFilterType("all")}
              className={`flex-1 sm:flex-initial px-2 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer text-center whitespace-nowrap ${
                filterType === "all"
                  ? "bg-white text-slate-900 font-semibold shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All ({attendees.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("completed_all")}
              className={`flex-1 sm:flex-initial px-2 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer text-center whitespace-nowrap ${
                filterType === "completed_all"
                  ? "bg-white text-slate-900 font-semibold shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Completed All
            </button>
            <button
              type="button"
              onClick={() => setFilterType("absent")}
              className={`flex-1 sm:flex-initial px-2 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer text-center whitespace-nowrap ${
                filterType === "absent"
                  ? "bg-white text-slate-900 font-semibold shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Absent
            </button>
          </div>

          {/* Export Matrix CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="h-8.5 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Download className="size-3.5" />
            <span className="hidden xs:inline">Export</span>
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Tabel Matriks */}
      <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
            <tr>
              <th className="py-2.5 px-3.5 min-w-[160px]">Attendee</th>
              <th className="py-2.5 px-3 min-w-[120px]">Ticket ID</th>
              <th className="py-2.5 px-3 min-w-[120px]">Organization</th>
              {sessions.map((sess) => (
                <th key={sess.id} className="py-2.5 px-3 text-center min-w-[130px] border-l border-slate-200">
                  <span className="font-bold text-slate-900 block truncate">{sess.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {finalAttendees.length === 0 ? (
              <tr>
                <td colSpan={3 + sessions.length} className="py-8 text-center text-xs text-slate-500">
                  No attendees match current filter criteria.
                </td>
              </tr>
            ) : (
              finalAttendees.map((att) => (
                <tr key={att.id} className="hover:bg-slate-50/70 transition-colors">
                  <AttendeeRowMeta attendee={att} />

                  {sessions.map((sess) => {
                    const record = att.sessions?.[sess.id];
                    const isChecked = record && (record.status === "present" || record.status === "claimed");

                    return (
                      <td key={sess.id} className="py-2.5 px-3 text-center border-l border-slate-200">
                        {isChecked ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <UserCheck className="size-2.5 text-emerald-600" />
                              <span>Verified</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => onRevertSession(att.id, sess.id)}
                              className="text-[10px] text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                              Undo
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onCheckInSession(att.ticketCode, sess.id)}
                            className="px-2.5 py-0.5 rounded bg-slate-900 text-white text-[10px] font-medium cursor-pointer hover:bg-slate-800 transition-colors"
                          >
                            Check In
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
