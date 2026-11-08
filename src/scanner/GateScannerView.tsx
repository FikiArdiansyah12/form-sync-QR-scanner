import React, { useState } from "react";
import {
  Search,
  Camera,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
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
  attendees,
  onCheckInSession,
  onRevertSession,
}: GateScannerViewProps) {
  const [scanMode, setScanMode] = useState<"camera" | "manual">("camera");
  const [manualTicketInput, setManualTicketInput] = useState("");
  const [lastResult, setLastResult] = useState<CheckInValidationResult | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState("");

  // State untuk form inline tambah checkpoint
  const [isAddingSession, setIsAddingSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [newSessionType, setNewSessionType] = useState<SessionType>("checkin");

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
      {/* 1. Header Bar: Judul & Status Kamera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 p-1 text-slate-800">
            <AttendanceLogo className="h-4.5 w-auto" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
              Attendance &amp; QR Check-In
            </h2>
            <p className="text-xs text-slate-500">
              Validate tickets, manage checkpoints, and track real-time attendance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
            Camera Ready
          </span>
        </div>
      </div>

      {/* 2. Checkpoints Section - Card Bersih */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="size-3.5 text-slate-600" />
            <span>Event Checkpoints</span>
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
          <form onSubmit={handleCreateSession} className="flex flex-col sm:flex-row gap-2 pt-1">
            <input
              type="text"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="Enter checkpoint name (e.g. Main Gate, Lunch)..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-slate-400"
              autoFocus
            />
            <button
              type="submit"
              className="h-9 px-4 rounded-lg bg-[#ea1d25] hover:bg-[#d41820] text-white text-xs font-bold cursor-pointer transition-colors"
            >
              Create Checkpoint
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            {sessions.map((sess) => {
              const isSelected = sess.id === currentSession?.id;
              return (
                <div
                  key={sess.id}
                  className={`flex items-center rounded-lg border text-xs transition-all ${
                    isSelected
                      ? "bg-white border-[#ea1d25] text-[#ea1d25] font-bold shadow-xs ring-1 ring-[#ea1d25]/20"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSession(sess.id);
                      setLastResult(null);
                    }}
                    className="py-1.5 px-3 cursor-pointer"
                  >
                    {sess.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSession(sess.id)}
                    className={`pr-2 pl-1 py-1.5 cursor-pointer opacity-50 hover:opacity-100 ${
                      isSelected ? "text-[#ea1d25]" : "text-slate-400 hover:text-rose-600"
                    }`}
                    title="Delete checkpoint"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              );
            })}

            {!isAddingSession ? (
              <button
                type="button"
                onClick={() => setIsAddingSession(true)}
                className="h-8 px-2.5 rounded-lg border border-dashed border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-600 cursor-pointer flex items-center gap-1 transition-colors"
              >
                <Plus className="size-3" />
                <span>Add Checkpoint</span>
              </button>
            ) : (
              <form onSubmit={handleCreateSession} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full mt-2">
                <input
                  type="text"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder="Checkpoint name..."
                  className="flex-1 h-8.5 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:border-slate-500"
                  autoFocus
                />
                <select
                  value={newSessionType}
                  onChange={(e) => setNewSessionType(e.target.value as SessionType)}
                  className="h-8.5 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-700"
                >
                  <option value="checkin">Gate Check-In</option>
                  <option value="redemption">Voucher Claim</option>
                </select>
                <div className="flex items-center gap-1.5">
                  <button
                    type="submit"
                    className="flex-1 sm:flex-none h-8.5 px-3.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingSession(false)}
                    className="h-8.5 px-2.5 rounded-lg text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
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
              <div className="pt-1">
                <form onSubmit={handleManualInputSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={manualTicketInput}
                      onChange={(e) => setManualTicketInput(e.target.value)}
                      placeholder={`Enter ticket code (e.g. ${eventCode || "EVENT"}:TKT-001)...`}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-mono focus:outline-none focus:bg-white focus:border-slate-400"
                    />
                  </div>
                  <button
                    type="submit"
                    className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer transition-colors flex items-center justify-center shrink-0"
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
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-slate-400"
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
