import React, { useState } from "react";
import {
  Search,
  Camera,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  Trash2,
  Layers,
} from "lucide-react";
import {
  Attendee,
  AttendanceSession,
  CheckInValidationResult,
  SessionType,
} from "../core/types";
import { CameraScanner } from "./CameraScanner";
import { matchesAttendeeSearch } from "../core/storage";
import { AttendanceLogo } from "../components/BrandLogos";

export interface GateScannerViewProps {
  eventCode: string;
  eventName: string;
  sessions: AttendanceSession[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onAddSession: (name: string, type: SessionType) => void;
  onDeleteSession: (sessionId: string) => void;
  onToggleSession?: (sessionId: string, isActive: boolean) => void;
  attendees: Attendee[];
  onCheckInSession: (ticketCode: string, sessionId: string) => CheckInValidationResult;
  onRevertSession: (attendeeId: string, sessionId: string) => void;
}

/**
 * Gate Scanner View
 * Tampilan pemindai gerbang dan manajemen sesi yang bersih dan mobile-friendly.
 * Mengurangi kontainer bertingkat (flattened cards) agar tampilan di layar smartphone lega dan nyaman.
 */
export function GateScannerView({
  eventCode,
  eventName,
  sessions,
  activeSessionId,
  onSelectSession,
  onAddSession,
  onDeleteSession,
  onToggleSession,
  attendees,
  onCheckInSession,
  onRevertSession,
}: GateScannerViewProps) {
  const [scanMode, setScanMode] = useState<"camera" | "manual">("camera");
  const [manualTicketInput, setManualTicketInput] = useState("");
  const [lastResult, setLastResult] = useState<CheckInValidationResult | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState("");

  // State untuk form inline tambah checkpoint & konfirmasi hapus
  const [isAddingSession, setIsAddingSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [newSessionType, setNewSessionType] = useState<SessionType>("checkin");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const currentSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];

  // Peserta yang baru saja check-in pada sesi ini
  const recentCheckIns = React.useMemo(() => {
    if (!currentSession) return [];
    return attendees
      .filter((a) => {
        const rec = a.sessions?.[currentSession.id];
        return rec?.status === "present" || rec?.status === "claimed";
      })
      .slice(-3)
      .reverse();
  }, [attendees, currentSession]);

  // Handle Scan Ticket
  const handleProcessScan = (ticketCode: string) => {
    if (!currentSession) return;
    const res = onCheckInSession(ticketCode, currentSession.id);
    setLastResult(res);
  };

  // Handle Manual Input Submit
  const handleManualInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTicketInput.trim()) return;
    handleProcessScan(manualTicketInput.trim());
    setManualTicketInput("");
  };

  // Handle pembuatan checkpoint baru
  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionName.trim()) return;
    onAddSession(newSessionName.trim(), newSessionType);
    setNewSessionName("");
    setIsAddingSession(false);
  };

  // Filter list untuk mode manual search
  const filteredAttendees = React.useMemo(() => {
    const q = manualSearchQuery.trim();
    if (!q) return attendees.slice(0, 5);
    return attendees.filter((a) => matchesAttendeeSearch(a, q));
  }, [attendees, manualSearchQuery]);

  return (
    <div className="space-y-3.5 font-sans max-w-3xl mx-auto">
      {/* 1. Header Bar: Judul & Status Kamera Responsif */}
      <div className="flex items-start sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 p-1 text-slate-800">
            <AttendanceLogo className="h-4.5 w-auto" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight">
              Attendance &amp; QR Check-In
            </h2>
            <p className="text-xs text-slate-500 truncate">
              Validate tickets, manage checkpoints, and track real-time attendance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-[11px] font-semibold text-emerald-700">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span>Camera Ready</span>
        </div>
      </div>

      {/* 2. Checkpoints Section - Card Bersih & Kontrol Lengkap */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="size-3.5 text-slate-600" />
            <span>Event Checkpoints</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
              {sessions.length}
            </span>
          </span>
          {currentSession && (
            <span className="text-xs font-medium text-slate-500 font-mono">
              Active: <strong className="text-slate-800">{currentSession.name}</strong>
            </span>
          )}
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Define checkpoints for this workspace to track attendance across entrance gates, meal claims, or seminar sessions.
        </p>

        {/* Checkpoint Pills & Add Form */}
        {sessions.length === 0 ? (
          <form onSubmit={handleCreateSession} className="flex flex-col sm:flex-row gap-2.5 pt-1.5">
            <input
              type="text"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="Enter checkpoint name (e.g. Main Gate, Lunch)..."
              className="w-full sm:flex-1 h-10.5 bg-slate-50 border border-slate-300 rounded-xl px-3.5 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all shadow-2xs"
              autoFocus
            />
            <button
              type="submit"
              className="w-full sm:w-auto h-10.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[13.5px] font-bold cursor-pointer transition-colors flex items-center justify-center shadow-2xs shrink-0"
            >
              Create Checkpoint
            </button>
          </form>
        ) : (
          <div className="space-y-3 pt-1">
            {/* 1. Tampilan Desktop: Tabel Kontrol Checkpoint Terstruktur */}
            <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3.5">Checkpoint Name</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Scanner</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13px]">
                  {sessions.map((sess) => {
                    const isSelected = sess.id === currentSession?.id;
                    const isActive = sess.isActive !== false;
                    const isConfirmingDelete = confirmDeleteId === sess.id;

                    return (
                      <tr
                        key={sess.id}
                        className={`transition-colors ${
                          isSelected ? "bg-slate-50/80 font-medium" : "hover:bg-slate-50/50"
                        }`}
                      >
                        {/* 1. Nama Checkpoint */}
                        <td className="py-2.5 px-3.5">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectSession(sess.id);
                              setLastResult(null);
                            }}
                            className="font-bold text-slate-900 hover:text-slate-700 cursor-pointer text-left truncate block max-w-[220px]"
                            title={sess.name}
                          >
                            {sess.name}
                          </button>
                        </td>

                        {/* 2. Type */}
                        <td className="py-2.5 px-3">
                          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                            {sess.type === "redemption" ? "Claim" : "Gate"}
                          </span>
                        </td>

                        {/* 3. Status Toggle */}
                        <td className="py-2.5 px-3">
                          {onToggleSession ? (
                            <button
                              type="button"
                              onClick={() => onToggleSession(sess.id, !isActive)}
                              className={`px-2 py-0.5 rounded-md text-[10.5px] font-semibold cursor-pointer border transition-colors ${
                                isActive
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                  : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                              }`}
                              title={isActive ? "Click to Pause" : "Click to Activate"}
                            >
                              {isActive ? "Active" : "Paused"}
                            </button>
                          ) : (
                            <span className="text-[10.5px] font-semibold text-slate-500">
                              {isActive ? "Active" : "Paused"}
                            </span>
                          )}
                        </td>

                        {/* 4. Scanner Selection */}
                        <td className="py-2.5 px-3">
                          {isSelected ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-900">
                              <span className="size-1.5 rounded-full bg-emerald-500" />
                              <span>Current Active</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectSession(sess.id);
                                setLastResult(null);
                              }}
                              className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-100 cursor-pointer transition-colors"
                            >
                              Select
                            </button>
                          )}
                        </td>

                        {/* 5. Action: Trash Icon & Inline Confirm */}
                        <td className="py-2.5 px-3 text-right">
                          {isConfirmingDelete ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteSession(sess.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10.5px] cursor-pointer"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10.5px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(sess.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors inline-flex items-center justify-center"
                              title="Delete Checkpoint"
                              aria-label={`Delete ${sess.name}`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 2. Tampilan Mobile: Clean Compact Cards (100% Fit Tanpa Terpotong & Tanpa Scroll Horizontal) */}
            <div className="block sm:hidden space-y-2">
              {sessions.map((sess) => {
                const isSelected = sess.id === currentSession?.id;
                const isActive = sess.isActive !== false;
                const isConfirmingDelete = confirmDeleteId === sess.id;

                return (
                  <div
                    key={sess.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isSelected
                        ? "bg-slate-50/90 border-slate-900 shadow-2xs ring-1 ring-slate-900/10"
                        : "bg-white border-slate-200"
                    }`}
                  >
                    {/* Baris Atas: Nama, Kategori, dan Tombol Hapus Tong Sampah */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSession(sess.id);
                            setLastResult(null);
                          }}
                          className="font-bold text-[13.5px] text-slate-900 truncate hover:text-slate-700 text-left"
                          title={sess.name}
                        >
                          {sess.name}
                        </button>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase shrink-0">
                          {sess.type === "redemption" ? "Claim" : "Gate"}
                        </span>
                      </div>

                      {/* Tombol Hapus Tong Sampah */}
                      <div className="shrink-0">
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteSession(sess.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-1 rounded bg-rose-600 text-white font-bold text-[10.5px] cursor-pointer"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-1.5 py-1 rounded bg-slate-200 text-slate-700 text-[10.5px] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(sess.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors inline-flex items-center justify-center"
                            title="Delete Checkpoint"
                            aria-label={`Delete ${sess.name}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Baris Bawah: Status Sakelar & Seleksi Scanner */}
                    <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-100 text-xs">
                      <div>
                        {onToggleSession ? (
                          <button
                            type="button"
                            onClick={() => onToggleSession(sess.id, !isActive)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
                              isActive
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {isActive ? "Active" : "Paused"}
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-500">
                            {isActive ? "Active" : "Paused"}
                          </span>
                        )}
                      </div>

                      <div>
                        {isSelected ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-900 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-md">
                            <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                            <span className="whitespace-nowrap">Current Active</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectSession(sess.id);
                              setLastResult(null);
                            }}
                            className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 px-3 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 shadow-2xs cursor-pointer"
                          >
                            Select Scanner
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tombol Tambah Checkpoint Baru */}
            {!isAddingSession && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingSession(true)}
                  className="h-9 px-3.5 rounded-xl border border-dashed border-slate-300 bg-white hover:bg-slate-50 text-[13px] font-semibold text-slate-700 cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="size-3.5 text-slate-500" />
                  <span>Add Another Checkpoint</span>
                </button>
              </div>
            )}

            {/* Sub-Card Form Tambah Checkpoint yang Terstruktur & Rapi */}
            {isAddingSession && (
              <div className="mt-2 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-slate-800 uppercase tracking-wider">
                    Add New Checkpoint
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingSession(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer transition-colors"
                    title="Close"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <form onSubmit={handleCreateSession} className="space-y-2.5">
                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-slate-700 block">
                      Checkpoint Name
                    </label>
                    <input
                      type="text"
                      value={newSessionName}
                      onChange={(e) => setNewSessionName(e.target.value)}
                      placeholder="e.g. Entrance Gate, Lunch, Seminar Room..."
                      className="w-full h-10 px-3.5 bg-white border border-slate-300 rounded-lg text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all shadow-2xs"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-slate-700 block">
                      Verification Purpose
                    </label>
                    <select
                      value={newSessionType}
                      onChange={(e) => setNewSessionType(e.target.value as SessionType)}
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-800 focus:outline-none focus:border-slate-900 cursor-pointer shadow-2xs"
                    >
                      <option value="checkin">Gate Check-In (Standard Entrance)</option>
                      <option value="redemption">Voucher / Meal Claim (One-time Redemption)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingSession(false)}
                      className="h-9 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-semibold cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="h-9 px-4.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-bold shadow-2xs cursor-pointer transition-colors flex items-center justify-center"
                    >
                      Save Checkpoint
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Scanner Section - Card Bersih */}
      {sessions.length > 0 && currentSession && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Live Scanner
            </span>

            {/* Mode Toggle: Camera vs Manual Search */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setScanMode("camera")}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                  scanMode === "camera"
                    ? "bg-white text-slate-900 font-bold shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Camera className="size-3" />
                <span>Camera</span>
              </button>
              <button
                type="button"
                onClick={() => setScanMode("manual")}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                  scanMode === "manual"
                    ? "bg-white text-slate-900 font-bold shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Search className="size-3" />
                <span>Manual</span>
              </button>
            </div>
          </div>

          {/* Status Alert Banner */}
          {lastResult && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                lastResult.success
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-rose-50 border-rose-200 text-rose-900"
              }`}
            >
              {lastResult.success ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600 mt-0.5" />
              ) : (
                <AlertCircle className="size-4 shrink-0 text-rose-600 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <span className="font-bold block">
                  {lastResult.success ? "Check-In Verified" : "Access Denied"}
                </span>
                <p className="mt-0.5 text-xs text-slate-700">{lastResult.message}</p>
                {lastResult.attendee && (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-mono">
                    <span className="font-bold text-slate-900">{lastResult.attendee.name}</span>
                    <span className="text-slate-500">{lastResult.attendee.ticketCode}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Viewport Kamera atau Manual Search */}
          {scanMode === "camera" ? (
            <div className="flex flex-col gap-3">
              <CameraScanner
                onScanTicket={handleProcessScan}
                onSwitchToManual={() => setScanMode("manual")}
              />

              {/* Input Bar Tiket */}
              <div className="pt-1.5">
                <form onSubmit={handleManualInputSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={manualTicketInput}
                      onChange={(e) => setManualTicketInput(e.target.value)}
                      placeholder={`Enter ticket code (e.g. ${eventCode || "EVENT"}:TKT-001)...`}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-slate-50/70 focus:bg-white text-xs sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all shadow-2xs"
                    />
                  </div>
                  <button
                    type="submit"
                    className="h-11 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold cursor-pointer transition-colors flex items-center justify-center shrink-0 shadow-2xs"
                  >
                    Verify Ticket
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 pt-1">
              <input
                type="text"
                value={manualSearchQuery}
                onChange={(e) => setManualSearchQuery(e.target.value)}
                placeholder="Search attendee by name, code, or organization..."
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-slate-50/70 focus:bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all shadow-2xs"
              />

              {attendees.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                  No attendees loaded yet.
                </div>
              ) : filteredAttendees.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">
                  No attendees match your search query.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                  {filteredAttendees.map((att) => {
                    const rec = att.sessions?.[currentSession.id];
                    const isChecked = rec?.status === "present" || rec?.status === "claimed";
                    return (
                      <div
                        key={att.id}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {att.name}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500">
                            {att.ticketCode}
                          </span>
                        </div>

                        {isChecked ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold border border-emerald-200">
                              Verified
                            </span>
                            <button
                              type="button"
                              onClick={() => onRevertSession(att.id, currentSession.id)}
                              className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer underline"
                            >
                              Undo
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleProcessScan(att.ticketCode)}
                            className="h-8 px-3 rounded-md bg-slate-900 text-white text-xs font-semibold cursor-pointer hover:bg-slate-800"
                          >
                            Check In
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. Recent Scans Stream - Card Bersih */}
      {recentCheckIns.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-3.5 space-y-2 shadow-2xs">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
            Recent Scans ({currentSession?.name})
          </span>
          <div className="space-y-1.5">
            {recentCheckIns.map((att) => {
              const rec = att.sessions?.[currentSession?.id || ""];
              return (
                <div
                  key={att.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/60 text-xs"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-semibold text-slate-900 truncate">{att.name}</span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {att.ticketCode} • {rec?.checkInTime || "Just now"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRevertSession(att.id, currentSession.id)}
                    className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-700 text-xs hover:bg-slate-100 cursor-pointer font-medium"
                  >
                    Undo
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
