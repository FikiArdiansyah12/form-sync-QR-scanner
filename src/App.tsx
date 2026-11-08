import React, { useState, useEffect, useMemo } from "react";
import {
  Camera,
  ShieldCheck,
  TableProperties,
  Users,
  RefreshCw,
  X,
} from "lucide-react";
import {
  Attendee,
  AttendanceStats,
  AttendanceSession,
  WorkspaceEventConfig,
  CheckInValidationResult,
  SessionType,
} from "./core/types";
import {
  loadEventFromStorage,
  saveEventToStorage,
  calculateAttendanceStats,
  processCheckIn,
  processSessionCheckIn,
  revertCheckIn,
  addSessionToEvent,
  deleteSessionFromEvent,
  DEFAULT_DEMO_EVENT,
} from "./core/storage";
import { validateEventCodeFormat } from "./core/eventCodeGenerator";
import { FormSyncBrandLogo } from "./components/FormSyncBrandLogo";
import { AttendanceLogo } from "./components/BrandLogos";
import { GateScannerView } from "./scanner/GateScannerView";
import { CrossCheckMatrixTable } from "./matrix/CrossCheckMatrixTable";
import { AttendeesTable } from "./directory/AttendeesTable";
import { AttendeeFilterBar, FilterStatus } from "./directory/AttendeeFilterBar";
import { WorkspaceControlPanel } from "./coordinator/WorkspaceControlPanel";

export type ActiveViewTab = "scanner" | "matrix" | "directory";

/**
 * Aplikasi Utama FormSync Attendance & Check-In Portal.
 * Mengadopsi 100% Visual Style Google Form Sync Add-On Resmi:
 * Modal container terpusat, tab pills horizontal dengan accent merah FormSync (#ea1d25),
 * kartu modul bertingkat dengan border slate-200, dan tombol primer Save & Sync.
 */
export function FormSyncApp() {
  const urlParams = useMemo(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("event") || params.get("code");
      const tab = params.get("tab") as ActiveViewTab | null;
      return {
        eventCode: code && validateEventCodeFormat(code) ? code.toUpperCase() : DEFAULT_DEMO_EVENT.eventCode,
        initialTab: tab && ["scanner", "matrix", "directory"].includes(tab) ? tab : "scanner",
      };
    }
    return {
      eventCode: DEFAULT_DEMO_EVENT.eventCode,
      initialTab: "scanner" as ActiveViewTab,
    };
  }, []);

  const [activeEventCode, setActiveEventCode] = useState<string>(urlParams.eventCode);
  const [codeInput, setCodeInput] = useState<string>("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [isSwitchingEvent, setIsSwitchingEvent] = useState(false);

  const [eventConfig, setEventConfig] = useState<WorkspaceEventConfig | null>(null);

  // Tab Utama (Default: scanner)
  const [activeTab, setActiveTab] = useState<ActiveViewTab>(urlParams.initialTab);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");

  // State Modal Sheets Sync
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // State Filter & Search Direktori
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  const refreshEventData = (code: string) => {
    const loaded = loadEventFromStorage(code);
    setEventConfig(loaded);
  };

  // Bersihkan data dummy residu lama dari seluruh localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const keysToClean: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("formsync_")) {
            keysToClean.push(k);
          }
        }

        keysToClean.forEach((k) => {
          const raw = localStorage.getItem(k);
          if (raw && (raw.includes("Budi Santoso") || raw.includes("att-001") || raw.includes("Morning Check-In"))) {
            localStorage.removeItem(k);
          }
        });
      } catch {}
    }
    refreshEventData(activeEventCode);
  }, [activeEventCode]);

  const attendees: Attendee[] = useMemo(() => {
    return eventConfig ? eventConfig.attendees : [];
  }, [eventConfig]);

  const sessions: AttendanceSession[] = useMemo(() => {
    return eventConfig?.sessions || [];
  }, [eventConfig]);

  // Sinkronkan selectedSessionId bila sessions berubah
  useEffect(() => {
    if (sessions.length > 0) {
      if (!selectedSessionId || !sessions.some((s) => s.id === selectedSessionId)) {
        setSelectedSessionId(sessions[0].id);
      }
    } else {
      setSelectedSessionId("");
    }
  }, [sessions, selectedSessionId]);

  const stats: AttendanceStats = useMemo(() => {
    return calculateAttendanceStats(attendees);
  }, [attendees]);

  // Handler Check-In Umum
  const handleCheckIn = (ticketCode: string): CheckInValidationResult => {
    if (!eventConfig) {
      return { success: false, status: "event_mismatch", message: "Event not loaded." };
    }
    const { result, updatedEvent } = processCheckIn(eventConfig, ticketCode);
    setEventConfig(updatedEvent);
    return result;
  };

  // Handler Check-In Sesi Kustom
  const handleCheckInSession = (
    ticketCode: string,
    sessionId: string
  ): CheckInValidationResult => {
    if (!eventConfig) {
      return { success: false, status: "event_mismatch", message: "Event not loaded." };
    }
    const { result, updatedEvent } = processSessionCheckIn(eventConfig, ticketCode, sessionId);
    setEventConfig(updatedEvent);
    return result;
  };

  // Handler Revert Sesi
  const handleRevertSession = (attendeeId: string, sessionId: string) => {
    if (!eventConfig) return;
    const updated = revertCheckIn(eventConfig, attendeeId, sessionId);
    setEventConfig(updated);
  };

  // Handler Tambah Sesi Kustom
  const handleAddSession = (name: string, type: SessionType, description?: string) => {
    if (!eventConfig) return;
    const updated = addSessionToEvent(eventConfig, name, type, description);
    setEventConfig(updated);
    const newestSession = updated.sessions[updated.sessions.length - 1];
    if (newestSession) {
      setSelectedSessionId(newestSession.id);
    }
  };

  // Handler Hapus Sesi
  const handleDeleteSession = (sessionId: string) => {
    if (!eventConfig) return;
    const updated = deleteSessionFromEvent(eventConfig, sessionId);
    setEventConfig(updated);
  };

  // Handler Switch Event
  const handleSwitchEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = codeInput.trim().toUpperCase();
    if (!validateEventCodeFormat(formatted)) {
      setCodeError("Format: XXXX-YYYY (e.g. FS9K-7M2P)");
      return;
    }
    setCodeError(null);
    setActiveEventCode(formatted);
    setCodeInput("");
    setIsSwitchingEvent(false);
  };

  // Filtered attendees untuk direktori
  const filteredAttendees = useMemo(() => {
    return attendees.filter((att) => {
      if (statusFilter === "present" && att.status !== "present") return false;
      if (statusFilter === "pending" && att.status !== "pending") return false;

      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        att.name.toLowerCase().includes(q) ||
        att.ticketCode.toLowerCase().includes(q) ||
        (att.organization && att.organization.toLowerCase().includes(q)) ||
        (att.email && att.email.toLowerCase().includes(q))
      );
    });
  }, [attendees, statusFilter, searchTerm]);

  return (
    <div className="min-h-screen bg-slate-100/80 py-4 sm:py-8 px-2 sm:px-4 font-sans text-slate-900 selection:bg-slate-200 flex justify-center items-start">
      {/* Modal Dialog Card Terpusat Persis Add-on FormSync Asli */}
      <div className="w-full max-w-4xl bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col">
        {/* 1. Modal Top Bar (FormSync Workspace Header) */}
        <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-100 bg-white select-none">
          <div className="flex items-center gap-3">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              FormSync Workspace
            </h1>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600">
              {activeEventCode}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSwitchingEvent(!isSwitchingEvent)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 cursor-pointer transition-colors"
            >
              Switch Event
            </button>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 cursor-pointer transition-colors flex items-center gap-1"
            >
              <ShieldCheck className="size-3.5 text-emerald-600" />
              <span>Sheets Sync</span>
            </button>
          </div>
        </div>

        {/* Popdown Switch Event Form */}
        {isSwitchingEvent && (
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200">
            <form onSubmit={handleSwitchEvent} className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Event Code:</span>
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. FS9K-7M2P"
                maxLength={9}
                className="h-7 px-2.5 w-28 rounded-md border border-slate-300 bg-white font-mono text-slate-900 font-bold"
                autoFocus
              />
              <button
                type="submit"
                className="h-7 px-3 rounded-md bg-slate-900 text-white font-bold hover:bg-slate-800 cursor-pointer"
              >
                Load
              </button>
              <button
                type="button"
                onClick={() => setIsSwitchingEvent(false)}
                className="text-slate-500 hover:text-slate-800 ml-1 cursor-pointer"
              >
                Cancel
              </button>
              {codeError && <span className="text-rose-600 ml-1">{codeError}</span>}
            </form>
          </div>
        )}

        {/* 2. Horizontal Tab Pills Bar (Persis baris tab add-on di screenshot) */}
        <div className="p-3 sm:px-5 flex items-center justify-between border-b border-slate-100 bg-white overflow-x-auto gap-3">
          <div className="flex items-center gap-2 min-w-max">
            {/* Logo Ikon FormSync Kecil */}
            <div className="flex items-center pr-1 shrink-0">
              <FormSyncBrandLogo className="h-6 w-auto" showDomain={false} />
            </div>

            {/* Tab 1: Scanner (Attendance) */}
            <button
              type="button"
              onClick={() => setActiveTab("scanner")}
              className={`h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                activeTab === "scanner"
                  ? "bg-white border border-[#ea1d25] text-[#ea1d25] font-bold shadow-xs ring-1 ring-[#ea1d25]/15"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <AttendanceLogo className="size-3.5 text-[#ea1d25]" />
              <span>Gate Scanner</span>
            </button>

            {/* Tab 2: Cross-Check Matrix */}
            <button
              type="button"
              onClick={() => setActiveTab("matrix")}
              className={`h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                activeTab === "matrix"
                  ? "bg-white border border-[#ea1d25] text-[#ea1d25] font-bold shadow-xs ring-1 ring-[#ea1d25]/15"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <TableProperties className="size-3.5 text-slate-600" />
              <span>Cross-Check Matrix</span>
            </button>

            {/* Tab 3: Attendees List */}
            <button
              type="button"
              onClick={() => setActiveTab("directory")}
              className={`h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                activeTab === "directory"
                  ? "bg-white border border-[#ea1d25] text-[#ea1d25] font-bold shadow-xs ring-1 ring-[#ea1d25]/15"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Users className="size-3.5 text-slate-600" />
              <span>Attendees ({attendees.length})</span>
            </button>
          </div>

          {/* Module Pill Badge di Kanan Persis Screenshot */}
          <div className="shrink-0 hidden sm:block">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
              Attendance Module
            </span>
          </div>
        </div>

        {/* 3. Main Modal Body Container */}
        <div className="p-4 sm:p-5 flex-1 bg-white">
          {/* TAB 1: GATE SCANNER */}
          {activeTab === "scanner" && (
            <div className="animate-in fade-in duration-100">
              <GateScannerView
                eventCode={activeEventCode}
                eventName={eventConfig?.eventName || "Attendance Workspace"}
                sessions={sessions}
                activeSessionId={selectedSessionId}
                onSelectSession={setSelectedSessionId}
                onAddSession={handleAddSession}
                onDeleteSession={handleDeleteSession}
                attendees={attendees}
                onCheckInSession={handleCheckInSession}
                onRevertSession={handleRevertSession}
              />
            </div>
          )}

          {/* TAB 2: CROSS-CHECK MATRIX */}
          {activeTab === "matrix" && (
            <div className="animate-in fade-in duration-100">
              <CrossCheckMatrixTable
                attendees={attendees}
                sessions={sessions}
                onCheckInSession={handleCheckInSession}
                onRevertSession={handleRevertSession}
                onOpenSync={() => setIsSettingsOpen(true)}
              />
            </div>
          )}

          {/* TAB 3: ATTENDEES DIRECTORY */}
          {activeTab === "directory" && (
            <div className="space-y-3.5 animate-in fade-in duration-100">
              <AttendeeFilterBar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                onExportCsv={() => {}}
                totalCount={stats.total}
                presentCount={stats.present}
                pendingCount={stats.pending}
              />

              <AttendeesTable
                attendees={filteredAttendees}
                onCheckIn={handleCheckIn}
                onRevert={(id) => {
                  if (eventConfig) setEventConfig(revertCheckIn(eventConfig, id));
                }}
              />
            </div>
          )}
        </div>

        {/* 4. Modal Footer Bar (Persis Bottom Bar Add-on dengan Tombol Save Changes Merah) */}
        <div className="p-3.5 sm:px-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setActiveTab("scanner")}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer transition-colors"
          >
            &larr; Back to Scanner
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#ea1d25] hover:bg-[#d41820] text-white text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <span>Sync with Sheets</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal Sheets Sync & Webhook */}
      {isSettingsOpen && eventConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl p-5 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4.5 text-emerald-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Google Sheets Synchronization
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded cursor-pointer"
              >
                Close
              </button>
            </div>

            <WorkspaceControlPanel
              event={eventConfig}
              onUpdateEvent={(updated) => {
                setEventConfig(updated);
                setActiveEventCode(updated.eventCode);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default FormSyncApp;
