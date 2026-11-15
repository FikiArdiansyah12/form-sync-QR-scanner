import React from "react";
import { Search, Download } from "lucide-react";

export type FilterStatus = "all" | "present" | "pending";

export interface AttendeeFilterBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: FilterStatus;
  onStatusFilterChange: (status: FilterStatus) => void;
  onExportCsv: () => void;
  totalCount: number;
  presentCount: number;
  pendingCount: number;
}

/**
 * Filter bar direktori peserta berdesain Google Form Sync Add-On.
 */
export function AttendeeFilterBar({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onExportCsv,
  totalCount,
  presentCount,
  pendingCount,
}: AttendeeFilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 font-sans">
      {/* Search Input */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name, ticket, or organization..."
          className="w-full h-8.5 pl-8.5 pr-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
      </div>

      {/* Segmented Filter Pills & Export Action */}
      <div className="flex items-center justify-between sm:justify-start gap-2">
        <div className="flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium flex-1 sm:flex-initial">
          <button
            type="button"
            onClick={() => onStatusFilterChange("all")}
            className={`flex-1 sm:flex-initial px-2 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer text-center whitespace-nowrap ${
              statusFilter === "all"
                ? "bg-white text-slate-900 font-bold shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange("present")}
            className={`flex-1 sm:flex-initial px-2 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer text-center whitespace-nowrap ${
              statusFilter === "present"
                ? "bg-white text-slate-900 font-bold shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Present ({presentCount})
          </button>
          <button
            type="button"
            onClick={() => onStatusFilterChange("pending")}
            className={`flex-1 sm:flex-initial px-2 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer text-center whitespace-nowrap ${
              statusFilter === "pending"
                ? "bg-white text-slate-900 font-bold shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Pending ({pendingCount})
          </button>
        </div>

        {/* Export CSV Button */}
        <button
          type="button"
          onClick={onExportCsv}
          className="h-8.5 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer transition-colors flex items-center gap-1.5 shrink-0"
        >
          <Download className="size-3.5" />
          <span className="hidden xs:inline">Export</span>
          <span>CSV</span>
        </button>
      </div>
    </div>
  );
}
