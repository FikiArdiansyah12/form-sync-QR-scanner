import React, { useState } from "react";
import { X } from "lucide-react";
import { Attendee, AttendanceStats, CheckInValidationResult } from "../core/types";
import { FormSyncSquareLogo } from "../components/FormSyncSquareLogo";
import { CameraScanner } from "./CameraScanner";
import { ManualSearch } from "./ManualSearch";

export interface AttendanceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  attendees: Attendee[];
  stats: AttendanceStats;
  onCheckIn: (ticketCode: string) => CheckInValidationResult;
  onRevert?: (ticketCode: string) => void;
}

/**
 * Modal Popup FormSync Attendance Scanner persis 1:1 seperti screenshot dialog Google Sheets resmi.
 * Menghadirkan segmented control Camera Scanner & Manual Search, logo resmi FormSync,
 * status banner zero-dot (tanpa karakter bullet), serta tombol Try Camera Again.
 */
export function AttendanceScannerModal({
  isOpen,
  onClose,
  attendees,
  stats,
  onCheckIn,
  onRevert,
}: AttendanceScannerModalProps) {
  const [activeTab, setActiveTab] = useState<"camera" | "manual">("camera");

  if (!isOpen) return null;

  const percentage =
    stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendance-scanner-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
    >
      {/* Modal Dialog Card (Clean Light Mode presisi 1:1 Google Sheets dialog) */}
      <div className="relative w-full max-w-[460px] rounded-3xl bg-white border border-slate-200/90 shadow-2xl p-6 flex flex-col font-sans text-slate-900 transition-all">
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-1">
          <h2
            id="attendance-scanner-title"
            className="text-base sm:text-lg font-bold text-slate-900 tracking-tight"
          >
            FormSync — Attendance Scanner
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner dialog"
            className="size-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Sub-header Summary Card */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100 my-4">
          <div className="flex items-center gap-3">
            <FormSyncSquareLogo className="size-10" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-900 leading-tight">
                FormSync Scanner
              </span>
              <span className="text-[11px] text-slate-500 leading-tight mt-0.5">
                Event Attendance Validation
              </span>
            </div>
          </div>

          {/* Ratio Text Bersih Tanpa Kontainer Pembungkus */}
          <div className="text-xs font-bold text-emerald-700 tracking-tight">
            Present: {stats.present} / {stats.total} ({percentage}%)
          </div>
        </div>

        {/* Segmented Switcher Tabs */}
        <div className="grid grid-cols-2 p-1.5 rounded-xl bg-slate-100 text-xs font-medium mb-4">
          <button
            type="button"
            onClick={() => setActiveTab("camera")}
            className={`py-2 text-center rounded-lg transition-all cursor-pointer ${
              activeTab === "camera"
                ? "bg-white text-slate-900 font-bold shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Camera Scanner
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("manual")}
            className={`py-2 text-center rounded-lg transition-all cursor-pointer ${
              activeTab === "manual"
                ? "bg-white text-slate-900 font-bold shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Manual Search
          </button>
        </div>

        {/* Main Body Content */}
        <div className="w-full">
          {activeTab === "camera" ? (
            <CameraScanner
              onScanTicket={(ticket) => onCheckIn(ticket)}
              onSwitchToManual={() => setActiveTab("manual")}
            />
          ) : (
            <ManualSearch
              attendees={attendees}
              onCheckIn={onCheckIn}
              onRevert={onRevert}
            />
          )}
        </div>
      </div>
    </div>
  );
}
export default AttendanceScannerModal;
