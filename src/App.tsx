import React, { useState, useEffect, useMemo } from "react";
import {
  Camera,
  ShieldCheck,
  TableProperties,
  Users,
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
  isEventWorkspaceExists,
  registerWorkspaceEvent,
  saveWebhookMapping,
  getWebhookForEvent,
  DEFAULT_DEMO_EVENT,
} from "./core/storage";
import {
  isEventPinProtected,
  verifyOperatorPin,
  isEventUnlockedInSession,
  setEventUnlockedInSession,
  clearEventUnlockedInSession,
} from "./core/securityLock";
import { validateEventCodeFormat } from "./core/eventCodeGenerator";
import {
  testSpreadsheetConnectivity,
  fetchEventFromSpreadsheet,
  syncCheckInToSpreadsheet,
} from "./bridge/spreadsheetSync";
import { FormSyncBrandLogo } from "./components/FormSyncBrandLogo";
import { AttendanceLogo } from "./components/BrandLogos";
import { GateScannerView } from "./scanner/GateScannerView";
import { CrossCheckMatrixTable } from "./matrix/CrossCheckMatrixTable";
import { AttendeesTable } from "./directory/AttendeesTable";
import { AttendeeFilterBar, FilterStatus } from "./directory/AttendeeFilterBar";
import { WorkspaceControlPanel } from "./coordinator/WorkspaceControlPanel";
import { PinLockScreen } from "./auth/PinLockScreen";
import { ConnectEventScreen, ConnectResult } from "./auth/ConnectEventScreen";

export type ActiveViewTab = "scanner" | "matrix" | "directory";

/**
 * Sinkronkan parameter event di URL browser tanpa reload halaman.
 */
function updateBrowserUrlEvent(code: string | null) {
  if (typeof window === "undefined") return;
  try {
    const nextUrl = new URL(window.location.href);
    if (code) {
      nextUrl.searchParams.set("event", code);
    } else {
      nextUrl.searchParams.delete("event");
      nextUrl.searchParams.delete("code");
    }
    window.history.replaceState({}, "", nextUrl.toString());
  } catch {}
}

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
      const origin = params.get("origin");
      const reg = params.get("reg");
      const wh = params.get("wh");
      return {
        eventCode: code && validateEventCodeFormat(code) ? code.toUpperCase() : "",
        initialTab: tab && ["scanner", "matrix", "directory"].includes(tab) ? tab : "scanner",
        isFromSheets: origin === "sheets" || reg === "1",
        webhookUrl: wh ? decodeURIComponent(wh) : "",
      };
    }
    return {
      eventCode: "",
      initialTab: "scanner" as ActiveViewTab,
      isFromSheets: false,
      webhookUrl: "",
    };
  }, []);

  const [activeEventCode, setActiveEventCode] = useState<string>("");
  const [codeInput, setCodeInput] = useState<string>("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [connectInitialError, setConnectInitialError] = useState<string | null>(null);
  const [isSwitchingEvent, setIsSwitchingEvent] = useState(false);

  const [eventConfig, setEventConfig] = useState<WorkspaceEventConfig | null>(null);

  // Status otentikasi PIN operator untuk event aktif
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);

  // Tab Utama (Default: scanner)
  const [activeTab, setActiveTab] = useState<ActiveViewTab>(urlParams.initialTab);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");

  // State Modal Sheets Sync
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // State Filter & Search Direktori
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  const refreshEventData = (code: string) => {
    if (!code || !code.trim()) {
      setEventConfig(null);
      return;
    }
    const loaded = loadEventFromStorage(code);
    setEventConfig(loaded);
  };

  // Validasi URL saat aplikasi pertama kali dimuat
  useEffect(() => {
    if (!urlParams.eventCode) return;
    const code = urlParams.eventCode;
    const exists = isEventWorkspaceExists(code);

    if (exists) {
      setActiveEventCode(code);
      refreshEventData(code);
      setIsUnlocked(isEventUnlockedInSession(code));
    } else if (urlParams.isFromSheets) {
      // Terverifikasi dibuka dari Google Sheets Add-on resmi
      const newEv = registerWorkspaceEvent(code, { origin: "sheets" });
      if (urlParams.webhookUrl) {
        newEv.spreadsheetWebhookUrl = urlParams.webhookUrl;
        saveWebhookMapping(code, urlParams.webhookUrl);
        saveEventToStorage(newEv);
      }
      setActiveEventCode(code);
      refreshEventData(code);
      setIsUnlocked(true);
    } else {
      // Tolak seketika: bukan dari Sheets dan belum pernah terdaftar
      setActiveEventCode("");
      setEventConfig(null);
      setConnectInitialError(
        `Event Code '${code}' was not found. Please open the scanner link directly from your FormSync Google Sheets add-on.`
      );
      updateBrowserUrlEvent(null);
    }
  }, [urlParams]);

  const handleConnectEvent = (code: string): ConnectResult => {
    const formatted = code.trim().toUpperCase();
    if (!validateEventCodeFormat(formatted)) {
      return { success: false, error: "Please enter a valid 8-digit code (XXXX-YYYY)." };
    }

    let exists = isEventWorkspaceExists(formatted);
    if (!exists) {
      // Pulihkan secara otomatis jika event memiliki pairing Webhook yang tersimpan
      const mappedWh = getWebhookForEvent(formatted);
      if (mappedWh) {
        const newEv = registerWorkspaceEvent(formatted, { origin: "sheets" });
        newEv.spreadsheetWebhookUrl = mappedWh;
        saveEventToStorage(newEv);
        exists = true;
      }
    }

    if (!exists) {
      return {
        success: false,
        error: `Event Code '${formatted}' not found. Please activate the Attendance module in your Google Sheet add-on to connect.`,
      };
    }

    setActiveEventCode(formatted);
    refreshEventData(formatted);
    setConnectInitialError(null);
    updateBrowserUrlEvent(formatted);
    return { success: true };
  };

  const handleRegisterFromSpreadsheet = async (
    webhookUrl: string,
    eventCode: string
  ): Promise<ConnectResult> => {
    const conn = await testSpreadsheetConnectivity(webhookUrl, eventCode);
    if (!conn.success) {
      return { success: false, error: conn.message };
    }

    const targetCode = conn.eventCode || eventCode;
    const fetchRes = await fetchEventFromSpreadsheet(webhookUrl, targetCode);
    const newEvent = registerWorkspaceEvent(targetCode, {
      origin: "sheets",
      securitySecret: fetchRes.securitySecret,
    });
    newEvent.spreadsheetWebhookUrl = webhookUrl.trim();

    if (fetchRes.success && fetchRes.attendees) {
      newEvent.attendees = fetchRes.attendees;
    }
    saveEventToStorage(newEvent);

    setActiveEventCode(targetCode);
    setEventConfig(newEvent);
    setConnectInitialError(null);
    updateBrowserUrlEvent(targetCode);
    return { success: true };
  };

  const handleDisconnectEvent = () => {
    setActiveEventCode("");
    setEventConfig(null);
    setIsUnlocked(false);
    setConnectInitialError(null);
    updateBrowserUrlEvent(null);
  };

  // Saat eventConfig dimuat atau activeEventCode berganti, cek status proteksi PIN
  useEffect(() => {
    if (!eventConfig) return;
    if (!isEventPinProtected(eventConfig.pin)) {
      // Jika event tidak memiliki PIN (open access), otomatis diizinkan
      setIsUnlocked(true);
    } else {
      // Jika event dilindungi PIN, periksa apakah sudah pernah di-unlock di session ini
      setIsUnlocked(isEventUnlockedInSession(eventConfig.eventCode));
    }
  }, [eventConfig, activeEventCode]);

  const handleUnlockPin = (pin: string): boolean => {
    if (!eventConfig) return false;
    const isValid = verifyOperatorPin(pin, eventConfig.pin);
    if (isValid) {
      setEventUnlockedInSession(eventConfig.eventCode);
      setIsUnlocked(true);
      return true;
    }
    return false;
  };

  const handleLockWorkspace = () => {
    if (eventConfig) {
      clearEventUnlockedInSession(eventConfig.eventCode);
      setIsUnlocked(false);
    }
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

    // Sinkronkan ke spreadsheet secara asinkron jika Webhook URL terhubung
    if (result.success && updatedEvent.spreadsheetWebhookUrl) {
      syncCheckInToSpreadsheet(updatedEvent.spreadsheetWebhookUrl, {
        eventCode: updatedEvent.eventCode,
        ticketCode: ticketCode,
        securitySecret: updatedEvent.securitySecret,
        checkInTime: result.attendee?.checkInTime,
      }).catch((err) => console.warn("Background sheet sync error:", err));
    }

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

    // Sinkronkan ke spreadsheet secara asinkron jika Webhook URL terhubung
    if (result.success && updatedEvent.spreadsheetWebhookUrl) {
      syncCheckInToSpreadsheet(updatedEvent.spreadsheetWebhookUrl, {
        eventCode: updatedEvent.eventCode,
        ticketCode: ticketCode,
        securitySecret: updatedEvent.securitySecret,
        checkInTime: result.attendee?.sessions?.[sessionId]?.checkInTime || new Date().toTimeString().split(" ")[0],
      }).catch((err) => console.warn("Background sheet sync error:", err));
    }

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
      setCodeError("Format: XXXX-YYYY (e.g. ABCD-1234)");
      return;
    }
    if (!isEventWorkspaceExists(formatted)) {
      setCodeError(`Event Code '${formatted}' not found.`);
      return;
    }
    setCodeError(null);
    setActiveEventCode(formatted);
    refreshEventData(formatted);
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

  // 1. Jika belum ada kode acara yang aktif (ID murni kosong secara default):
  if (!activeEventCode || !eventConfig) {
    return (
      <ConnectEventScreen
        onConnectEvent={handleConnectEvent}
        onRegisterFromSpreadsheet={handleRegisterFromSpreadsheet}
        initialError={connectInitialError}
      />
    );
  }

  // 2. Jika event dilindungi PIN dan operator belum memasukkan PIN yang benar di sesi ini:
  if (isEventPinProtected(eventConfig.pin) && !isUnlocked) {
    return (
      <PinLockScreen
        eventCode={activeEventCode}
        eventName={eventConfig.eventName || "Attendance Workspace"}
        onUnlock={handleUnlockPin}
        onSelectEvent={(c) => {
          const res = handleConnectEvent(c);
          if (!res.success) {
            setConnectInitialError(res.error || null);
          }
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 sm:py-6 sm:px-4 font-sans text-slate-900 selection:bg-slate-200 flex justify-center items-start">
      {/* Modal Dialog Card Terpusat - Full Width & Clean di Mobile */}
      <div className="w-full max-w-4xl bg-white sm:rounded-2xl border-0 sm:border border-slate-200 shadow-none sm:shadow-lg overflow-hidden flex flex-col min-h-screen sm:min-h-0">
        {/* 1. Modal Top Bar (FormSync Workspace Header) */}
        <div className="p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 bg-white gap-3 select-none">
          <div className="flex items-center justify-between sm:justify-start gap-2.5">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              FormSync Workspace
            </h1>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
              {activeEventCode}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {isEventPinProtected(eventConfig.pin) && (
              <button
                type="button"
                onClick={handleLockWorkspace}
                className="text-xs font-semibold text-slate-600 hover:text-rose-600 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
                title="Lock workspace"
              >
                Lock
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSwitchingEvent(!isSwitchingEvent)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Switch Event
            </button>
            <button
              type="button"
              onClick={handleDisconnectEvent}
              className="text-xs font-semibold text-slate-500 hover:text-rose-600 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
              title="Close this event workspace"
            >
              Exit
            </button>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors flex items-center gap-1.5"
            >
              <ShieldCheck className="size-3.5 text-emerald-600" />
              <span>Sheets Sync</span>
            </button>
          </div>
        </div>

        {/* Popdown Switch Event Form */}
        {isSwitchingEvent && (
          <div className="p-3 sm:px-5 bg-slate-50 border-b border-slate-200">
            <form onSubmit={handleSwitchEvent} className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
              <span className="text-slate-700 font-semibold">Event Code:</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. ABCD-1234"
                  maxLength={9}
                  className="h-8 px-2.5 w-32 rounded-lg border border-slate-300 bg-white font-mono text-slate-900 font-bold focus:outline-none focus:border-slate-800"
                  autoFocus
                />
                <button
                  type="submit"
                  className="h-8 px-3.5 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 cursor-pointer"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => setIsSwitchingEvent(false)}
                  className="h-8 px-2 text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              {codeError && <span className="text-rose-600 font-medium">{codeError}</span>}
            </form>
          </div>
        )}

        {/* 2. Horizontal Tab Pills Bar - Responsif 3 Kolom di Mobile */}
        <div className="p-2.5 sm:px-5 flex items-center justify-between border-b border-slate-100 bg-white gap-2">
          <div className="grid grid-cols-3 sm:flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            {/* Tab 1: Scanner (Attendance) */}
            <button
              type="button"
              onClick={() => setActiveTab("scanner")}
              className={`h-9 px-2.5 sm:px-3 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "scanner"
                  ? "bg-white border border-[#ea1d25] text-[#ea1d25] font-bold shadow-xs ring-1 ring-[#ea1d25]/15"
                  : "bg-slate-50 sm:bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <AttendanceLogo className="size-3.5 text-[#ea1d25] shrink-0" />
              <span className="truncate">Scanner</span>
            </button>

            {/* Tab 2: Cross-Check Matrix */}
            <button
              type="button"
              onClick={() => setActiveTab("matrix")}
              className={`h-9 px-2.5 sm:px-3 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "matrix"
                  ? "bg-white border border-[#ea1d25] text-[#ea1d25] font-bold shadow-xs ring-1 ring-[#ea1d25]/15"
                  : "bg-slate-50 sm:bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <TableProperties className="size-3.5 text-slate-600 shrink-0" />
              <span className="truncate">Matrix</span>
            </button>

            {/* Tab 3: Attendees List */}
            <button
              type="button"
              onClick={() => setActiveTab("directory")}
              className={`h-9 px-2.5 sm:px-3 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "directory"
                  ? "bg-white border border-[#ea1d25] text-[#ea1d25] font-bold shadow-xs ring-1 ring-[#ea1d25]/15"
                  : "bg-slate-50 sm:bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Users className="size-3.5 text-slate-600 shrink-0" />
              <span className="truncate">Attendees ({attendees.length})</span>
            </button>
          </div>

          {/* Module Pill Badge di Kanan */}
          <div className="shrink-0 hidden md:block">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
              Attendance Module
            </span>
          </div>
        </div>

        {/* 3. Main Modal Body Container */}
        <div className="p-3.5 sm:p-5 flex-1 bg-white">
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

        {/* 4. Modal Footer Bar */}
        <div className="p-3 sm:px-5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          {activeTab !== "scanner" ? (
            <button
              type="button"
              onClick={() => setActiveTab("scanner")}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer transition-colors"
            >
              Back to Scanner
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <ShieldCheck className="size-3.5 text-emerald-400" />
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
