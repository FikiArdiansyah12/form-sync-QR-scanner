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
  isEventWorkspacePaired,
  registerWorkspaceEvent,
  saveWebhookMapping,
  getWebhookForEvent,
  removeEventFromStorage,
  DEFAULT_DEMO_EVENT,
} from "./core/storage";
import {
  isEventPinProtected,
  verifyOperatorPin,
  isEventUnlockedInSession,
  setEventUnlockedInSession,
  clearEventUnlockedInSession,
} from "./core/securityLock";
import { validateEventCodeFormat, formatEventCodeWithHyphen } from "./core/eventCodeGenerator";
import {
  testSpreadsheetConnectivity,
  fetchEventFromSpreadsheet,
  syncCheckInToSpreadsheet,
  syncRevertCheckInToSpreadsheet,
  syncCreateSessionToSpreadsheet,
  syncDeleteSessionToSpreadsheet,
  syncToggleSessionToSpreadsheet,
  mergeRemoteAttendees,
  SpreadsheetFetchResponse,
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
        eventCode: code && validateEventCodeFormat(code) ? formatEventCodeWithHyphen(code) : "",
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
  const activeEventCodeRef = React.useRef(activeEventCode);
  useEffect(() => {
    activeEventCodeRef.current = activeEventCode;
  }, [activeEventCode]);

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
  const [isSyncingRecords, setIsSyncingRecords] = useState(false);

  // Pelindung race condition: melacak checkpoint dan status presensi yang baru saja dimutasi (30 detik)
  // agar polling in-flight atau cache browser tidak mengembalikan status/checkpoint lama.
  const sessionTombstonesRef = React.useRef<Map<string, number>>(new Map());
  const pendingSessionAddsRef = React.useRef<Map<string, { session: AttendanceSession; timestamp: number }>>(new Map());
  const activeSessionMutationCountRef = React.useRef<number>(0);

  interface CheckInOverrideEntry {
    ticketCode: string;
    sessionId: string; // '__ALL__' untuk revert global
    action: "present" | "reverted";
    checkInTime?: string;
    timestamp: number;
  }
  const pendingCheckInOverridesRef = React.useRef<Map<string, CheckInOverrideEntry>>(new Map());
  const activeCheckInMutationCountRef = React.useRef<number>(0);

  const filterSessionsAgainstTombstones = React.useCallback((sessionsList: AttendanceSession[]) => {
    const now = Date.now();
    for (const [key, ts] of sessionTombstonesRef.current.entries()) {
      if (now - ts > 30000) {
        sessionTombstonesRef.current.delete(key);
      }
    }
    return sessionsList.filter((s) => {
      if (!s) return false;
      const idDeleted = sessionTombstonesRef.current.has(`id:${s.id}`);
      const nameDeleted = s.name ? sessionTombstonesRef.current.has(`name:${s.name.trim().toLowerCase()}`) : false;
      return !idDeleted && !nameDeleted;
    });
  }, []);

  const applySafeRemoteMerge = React.useCallback(
    (prev: WorkspaceEventConfig, remote: SpreadsheetFetchResponse): WorkspaceEventConfig => {
      const merged = mergeRemoteAttendees(prev, remote);
      const now = Date.now();
      for (const [key, item] of pendingSessionAddsRef.current.entries()) {
        if (now - item.timestamp > 20000) {
          pendingSessionAddsRef.current.delete(key);
        }
      }
      for (const [key, entry] of pendingCheckInOverridesRef.current.entries()) {
        if (now - entry.timestamp > 30000) {
          pendingCheckInOverridesRef.current.delete(key);
        }
      }

      // Overlay mutasi presensi yang sedang berlangsung atau dalam masa perlindungan 30 detik
      let safeAttendees = merged.attendees || [];
      if (activeCheckInMutationCountRef.current > 0) {
        safeAttendees = prev.attendees;
      } else if (pendingCheckInOverridesRef.current.size > 0) {
        safeAttendees = safeAttendees.map((att) => {
          const cleanTkt = att.ticketCode.trim().toUpperCase();
          const globalRevert = pendingCheckInOverridesRef.current.get(`${cleanTkt}::__ALL__`);
          if (globalRevert && globalRevert.action === "reverted") {
            return { ...att, status: "pending" as const, checkInTime: undefined, sessions: {} };
          }
          let nextAtt = att;
          for (const entry of pendingCheckInOverridesRef.current.values()) {
            if (entry.ticketCode !== cleanTkt || entry.sessionId === "__ALL__") continue;
            const nextSessions = { ...(nextAtt.sessions || {}) };
            if (entry.action === "reverted") {
              delete nextSessions[entry.sessionId];
            } else {
              nextSessions[entry.sessionId] = {
                status: "present",
                checkInTime: entry.checkInTime || new Date().toTimeString().split(" ")[0],
              };
            }
            const hasActive = Object.values(nextSessions).some(
              (s) => s.status === "present" || s.status === "claimed"
            );
            nextAtt = {
              ...nextAtt,
              status: hasActive ? ("present" as const) : ("pending" as const),
              checkInTime: hasActive ? nextAtt.checkInTime : undefined,
              sessions: nextSessions,
            };
          }
          return nextAtt;
        });
      }

      if (activeSessionMutationCountRef.current > 0) {
        return { ...merged, sessions: prev.sessions, attendees: safeAttendees };
      }

      let safeSessions = filterSessionsAgainstTombstones(merged.sessions || []);

      for (const [, item] of pendingSessionAddsRef.current.entries()) {
        const alreadyPresent = safeSessions.some(
          (s) => s.id === item.session.id || s.name.trim().toLowerCase() === item.session.name.trim().toLowerCase()
        );
        if (!alreadyPresent) {
          safeSessions = [...safeSessions, item.session];
        }
      }

      return { ...merged, sessions: safeSessions, attendees: safeAttendees };
    },
    [filterSessionsAgainstTombstones]
  );

  const handleSyncRecords = async () => {
    const code = activeEventCodeRef.current || activeEventCode;
    if (!code) return;
    const webhookUrl = eventConfig?.spreadsheetWebhookUrl || getWebhookForEvent(code);
    if (!webhookUrl) {
      setIsSettingsOpen(true);
      return;
    }
    setIsSyncingRecords(true);
    try {
      const res = await fetchEventFromSpreadsheet(webhookUrl, code);
      if (res.success && res.attendees) {
        setEventConfig((prev) => {
          if (!prev) return prev;
          const merged = applySafeRemoteMerge(prev, res);
          saveEventToStorage(merged);
          return merged;
        });
      }
    } catch (e) {
      console.warn("Manual sync error:", e);
    } finally {
      setIsSyncingRecords(false);
    }
  };

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

    // 1. Jika dibuka langsung dari Google Sheets Add-on resmi dengan parameter webhook terlampir:
    if (urlParams.isFromSheets && urlParams.webhookUrl && urlParams.webhookUrl.startsWith("https://script.google.com/macros/s/")) {
      let currentEv = loadEventFromStorage(code);
      if (!currentEv) {
        currentEv = registerWorkspaceEvent(code, { origin: "sheets" });
      }
      currentEv.spreadsheetWebhookUrl = urlParams.webhookUrl;
      saveWebhookMapping(code, urlParams.webhookUrl);
      saveEventToStorage(currentEv);

      setActiveEventCode(code);
      refreshEventData(code);
      const isPinRequired = isEventPinProtected(currentEv.pin);
      setIsUnlocked(!isPinRequired || isEventUnlockedInSession(code));

      // Auto-fetch data peserta langsung dari spreadsheet
      fetchEventFromSpreadsheet(urlParams.webhookUrl, code)
        .then((fetchRes) => {
          if (fetchRes.success && fetchRes.attendees) {
            const loaded = loadEventFromStorage(code);
            if (loaded) {
              const merged = applySafeRemoteMerge(loaded, fetchRes);
              saveEventToStorage(merged);
              setEventConfig(merged);
            }
          }
        })
        .catch((err) => console.warn("Initial sheets attendee fetch error:", err));
      return;
    }

    // 2. Jika kode acara sudah pernah berpasangan (paired) dengan Webhook aktif di perangkat ini:
    const isPaired = isEventWorkspacePaired(code);
    if (isPaired) {
      if (urlParams.webhookUrl && urlParams.webhookUrl.startsWith("https://script.google.com/macros/s/")) {
        const currentEv = loadEventFromStorage(code);
        if (currentEv && currentEv.spreadsheetWebhookUrl !== urlParams.webhookUrl) {
          currentEv.spreadsheetWebhookUrl = urlParams.webhookUrl;
          saveWebhookMapping(code, urlParams.webhookUrl);
          saveEventToStorage(currentEv);
        }
      }
      const loaded = loadEventFromStorage(code);
      setActiveEventCode(code);
      refreshEventData(code);
      const isPinRequired = Boolean(loaded && isEventPinProtected(loaded.pin));
      setIsUnlocked(!isPinRequired || isEventUnlockedInSession(code));

      // Jika data peserta masih kosong, coba sinkronkan otomatis di background
      const targetWh = (loaded && loaded.spreadsheetWebhookUrl) || getWebhookForEvent(code);
      if (targetWh && (!loaded || !loaded.attendees || loaded.attendees.length === 0)) {
        fetchEventFromSpreadsheet(targetWh, code)
          .then((fetchRes) => {
            if (fetchRes.success && fetchRes.attendees) {
              const cur = loadEventFromStorage(code);
              if (cur) {
                const merged = applySafeRemoteMerge(cur, fetchRes);
                saveEventToStorage(merged);
                setEventConfig(merged);
              }
            }
          })
          .catch(() => {});
      }
      return;
    }

    // 3. Jika kode acara belum pernah terpasang dengan Webhook:
    // Arahkan ke ConnectEventScreen bersih (defaultEventCode terisi otomatis) agar pengguna diminta memasukkan Webhook URL
    setActiveEventCode("");
    setEventConfig(null);
    setConnectInitialError(null);
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
    const loaded = loadEventFromStorage(formatted);
    const isPinRequired = Boolean(loaded && isEventPinProtected(loaded.pin));
    setIsUnlocked(!isPinRequired || isEventUnlockedInSession(formatted));
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

  const handleDisconnectEvent = (reasonMsg?: unknown) => {
    const codeToClean = activeEventCodeRef.current || activeEventCode;
    if (codeToClean) {
      removeEventFromStorage(codeToClean);
      clearEventUnlockedInSession(codeToClean);
    }
    setActiveEventCode("");
    setEventConfig(null);
    setIsUnlocked(false);
    setIsSettingsOpen(false);
    const cleanReason = typeof reasonMsg === "string" && reasonMsg.trim() ? reasonMsg.trim() : null;
    setConnectInitialError(cleanReason);
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

  // Periodic Heartbeat & Visibility Health-Check ke Google Sheets
  useEffect(() => {
    if (!activeEventCode || !eventConfig?.spreadsheetWebhookUrl) {
      return;
    }

    const webhookUrl = eventConfig.spreadsheetWebhookUrl;
    const currentCode = activeEventCode;
    let isCancelled = false;

    const verifyWorkspaceHealth = async () => {
      // Hanya lakukan verifikasi jika dokumen terlihat untuk menghemat kuota GAS
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }
      try {
        const check = await fetchEventFromSpreadsheet(webhookUrl, currentCode);
        if (isCancelled) return;
        if (
          check.error === "WORKSPACE_DISCONNECTED" ||
          (check.message && check.message.toLowerCase().includes("disconnected by the administrator"))
        ) {
          handleDisconnectEvent(check.message || "This event workspace has been disconnected by the administrator.");
          return;
        }

        // Sinkronkan data peserta & sesi secara transparan
        if (check.success && Array.isArray(check.attendees)) {
          setEventConfig((prev) => {
            if (!prev) return prev;
            const merged = applySafeRemoteMerge(prev, check);
            saveEventToStorage(merged);
            return merged;
          });
        }
      } catch {
        // Abaikan kegagalan jaringan sesaat
      }
    };

    // Verifikasi awal setelah 2 detik untuk memastikan workspace yang baru dimuat masih valid
    const initialVerifyTimeout = setTimeout(() => {
      verifyWorkspaceHealth();
    }, 2000);

    // Polling berkala setiap 25 detik
    const timer = setInterval(verifyWorkspaceHealth, 25000);

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        verifyWorkspaceHealth();
      }
    };

    const handleWindowFocus = () => {
      verifyWorkspaceHealth();
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleWindowFocus);
    }

    return () => {
      isCancelled = true;
      clearTimeout(initialVerifyTimeout);
      clearInterval(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleWindowFocus);
      }
    };
  }, [activeEventCode, eventConfig?.spreadsheetWebhookUrl]);

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

  // Helper terpusat untuk sinkronisasi Check-In ke Google Sheets dengan pelindung race-condition
  const syncCheckInRecord = (
    updatedEvent: WorkspaceEventConfig,
    ticketCode: string,
    targetSessionId: string,
    checkInTime?: string
  ) => {
    const cleanTkt = ticketCode.trim().toUpperCase();
    const targetSess = (updatedEvent.sessions || []).find((s) => s.id === targetSessionId);
    const resolvedTime = checkInTime || new Date().toTimeString().split(" ")[0];

    pendingCheckInOverridesRef.current.delete(`${cleanTkt}::__ALL__`);
    pendingCheckInOverridesRef.current.set(`${cleanTkt}::${targetSessionId || "default"}`, {
      ticketCode: cleanTkt,
      sessionId: targetSessionId,
      action: "present",
      checkInTime: resolvedTime,
      timestamp: Date.now(),
    });

    if (!updatedEvent.spreadsheetWebhookUrl) return;

    activeCheckInMutationCountRef.current += 1;
    syncCheckInToSpreadsheet(updatedEvent.spreadsheetWebhookUrl, {
      action: "session_checkin",
      eventCode: updatedEvent.eventCode,
      ticketCode: ticketCode,
      securitySecret: updatedEvent.securitySecret,
      sessionId: targetSessionId,
      sessionName: targetSess?.name,
      checkInTime: resolvedTime,
    })
      .then((syncRes) => {
        if (syncRes && syncRes.error === "WORKSPACE_DISCONNECTED") {
          handleDisconnectEvent("This workspace has been disconnected by the administrator.");
          return;
        }
        if (syncRes && syncRes.success && Array.isArray(syncRes.sessions)) {
          setEventConfig((prev) => {
            if (!prev) return prev;
            const filtered = filterSessionsAgainstTombstones(syncRes.sessions || []);
            const synced = { ...prev, sessions: filtered };
            saveEventToStorage(synced);
            return synced;
          });
        }
      })
      .catch((err) => console.warn("Background sheet sync error:", err))
      .finally(() => {
        activeCheckInMutationCountRef.current = Math.max(0, activeCheckInMutationCountRef.current - 1);
      });
  };

  // Helper terpusat untuk sinkronisasi Undo / Revert presensi ke Google Sheets
  const syncRevertRecord = (
    currentEvent: WorkspaceEventConfig,
    attendeeId: string,
    sessionId?: string
  ) => {
    const targetAttendee = (currentEvent.attendees || []).find((a) => a.id === attendeeId);
    if (!targetAttendee || !targetAttendee.ticketCode) return;

    const cleanTkt = targetAttendee.ticketCode.trim().toUpperCase();
    const overrideKey = `${cleanTkt}::${sessionId || "__ALL__"}`;
    const targetSess = sessionId
      ? (currentEvent.sessions || []).find((s) => s.id === sessionId)
      : undefined;

    pendingCheckInOverridesRef.current.set(overrideKey, {
      ticketCode: cleanTkt,
      sessionId: sessionId || "__ALL__",
      action: "reverted",
      timestamp: Date.now(),
    });

    if (!currentEvent.spreadsheetWebhookUrl) return;

    activeCheckInMutationCountRef.current += 1;
    syncRevertCheckInToSpreadsheet(currentEvent.spreadsheetWebhookUrl, {
      eventCode: currentEvent.eventCode,
      ticketCode: targetAttendee.ticketCode,
      securitySecret: currentEvent.securitySecret,
      sessionId: sessionId || "",
      sessionName: targetSess?.name || "",
    })
      .then((syncRes) => {
        if (syncRes && syncRes.error === "WORKSPACE_DISCONNECTED") {
          handleDisconnectEvent("This workspace has been disconnected by the administrator.");
        }
      })
      .catch((err) => console.warn("Background revert sync error:", err))
      .finally(() => {
        activeCheckInMutationCountRef.current = Math.max(0, activeCheckInMutationCountRef.current - 1);
      });
  };

  // Handler Check-In Umum
  const handleCheckIn = (ticketCode: string): CheckInValidationResult => {
    if (!eventConfig) {
      return { success: false, status: "event_mismatch", message: "Event not loaded." };
    }
    const { result, updatedEvent } = processCheckIn(eventConfig, ticketCode);
    setEventConfig(updatedEvent);

    if (result.success) {
      syncCheckInRecord(updatedEvent, ticketCode, selectedSessionId || "", result.attendee?.checkInTime);
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

    if (result.success) {
      syncCheckInRecord(
        updatedEvent,
        ticketCode,
        sessionId,
        result.attendee?.sessions?.[sessionId]?.checkInTime
      );
    }

    return result;
  };

  // Handler Revert Sesi (dari Scanner atau Cross-Check Matrix)
  const handleRevertSession = (attendeeId: string, sessionId: string) => {
    if (!eventConfig) return;
    const updated = revertCheckIn(eventConfig, attendeeId, sessionId);
    setEventConfig(updated);
    syncRevertRecord(eventConfig, attendeeId, sessionId);
  };

  // Handler Revert Global Peserta (dari Direktori Peserta)
  const handleRevertAttendee = (attendeeId: string) => {
    if (!eventConfig) return;
    const updated = revertCheckIn(eventConfig, attendeeId);
    setEventConfig(updated);
    syncRevertRecord(eventConfig, attendeeId);
  };

  // Handler Tambah Sesi Kustom
  const handleAddSession = (name: string, type: SessionType, description?: string) => {
    if (!eventConfig) return;
    const cleanLower = name.trim().toLowerCase();
    sessionTombstonesRef.current.delete(`name:${cleanLower}`);

    const updated = addSessionToEvent(eventConfig, name, type, description);
    saveEventToStorage(updated);
    setEventConfig(updated);
    const newestSession = updated.sessions[updated.sessions.length - 1];
    if (newestSession) {
      sessionTombstonesRef.current.delete(`id:${newestSession.id}`);
      pendingSessionAddsRef.current.set(`name:${cleanLower}`, {
        session: newestSession,
        timestamp: Date.now(),
      });
      setSelectedSessionId(newestSession.id);
    }

    // Sinkronkan penambahan kolom sesi ke spreadsheet secara real-time
    if (updated.spreadsheetWebhookUrl) {
      activeSessionMutationCountRef.current += 1;
      syncCreateSessionToSpreadsheet(updated.spreadsheetWebhookUrl, {
        eventCode: updated.eventCode,
        securitySecret: updated.securitySecret,
        sessionName: name,
        sessionType: type,
      })
        .then((syncRes) => {
          if (syncRes && syncRes.error === "WORKSPACE_DISCONNECTED") {
            handleDisconnectEvent("This workspace has been disconnected by the administrator.");
            return;
          }
          if (syncRes && syncRes.success && Array.isArray(syncRes.sessions)) {
            pendingSessionAddsRef.current.delete(`name:${cleanLower}`);
            setEventConfig((prev) => {
              if (!prev) return prev;
              const filtered = filterSessionsAgainstTombstones(syncRes.sessions || []);
              const synced = { ...prev, sessions: filtered };
              saveEventToStorage(synced);
              return synced;
            });
          }
        })
        .catch((err) => console.warn("Background session sync error:", err))
        .finally(() => {
          activeSessionMutationCountRef.current = Math.max(0, activeSessionMutationCountRef.current - 1);
        });
    }
  };

  // Handler Hapus Sesi
  const handleDeleteSession = (sessionId: string) => {
    if (!eventConfig) return;
    const targetSession = (eventConfig.sessions || []).find((s) => s.id === sessionId);
    const sessionName = targetSession?.name || "";
    const now = Date.now();
    sessionTombstonesRef.current.set(`id:${sessionId}`, now);
    if (sessionName) {
      const lowerName = sessionName.trim().toLowerCase();
      sessionTombstonesRef.current.set(`name:${lowerName}`, now);
      pendingSessionAddsRef.current.delete(`name:${lowerName}`);
    }

    const updated = deleteSessionFromEvent(eventConfig, sessionId);
    saveEventToStorage(updated);
    setEventConfig(updated);

    // Sinkronkan penghapusan checkpoint ke spreadsheet secara real-time
    if (updated.spreadsheetWebhookUrl) {
      activeSessionMutationCountRef.current += 1;
      syncDeleteSessionToSpreadsheet(
        updated.spreadsheetWebhookUrl,
        updated.eventCode,
        updated.securitySecret,
        sessionId,
        sessionName
      )
        .then((syncRes) => {
          if (syncRes && syncRes.error === "WORKSPACE_DISCONNECTED") {
            handleDisconnectEvent("This workspace has been disconnected by the administrator.");
            return;
          }
          if (syncRes && syncRes.success && Array.isArray(syncRes.sessions)) {
            setEventConfig((prev) => {
              if (!prev) return prev;
              const filtered = filterSessionsAgainstTombstones(syncRes.sessions || []);
              const synced = { ...prev, sessions: filtered };
              saveEventToStorage(synced);
              return synced;
            });
          }
        })
        .catch((err) => console.warn("Background session delete sync error:", err))
        .finally(() => {
          activeSessionMutationCountRef.current = Math.max(0, activeSessionMutationCountRef.current - 1);
        });
    }
  };

  // Handler Kontrol Status Aktif / Non-Aktif Sesi Checkpoint
  const handleToggleSessionActive = (sessionId: string, isActive: boolean) => {
    if (!eventConfig) return;
    const updatedSessions = (eventConfig.sessions || []).map((s) =>
      s.id === sessionId ? { ...s, isActive } : s
    );
    const updated: WorkspaceEventConfig = {
      ...eventConfig,
      sessions: updatedSessions,
      updatedAt: new Date().toISOString(),
    };
    saveEventToStorage(updated);
    setEventConfig(updated);

    if (updated.spreadsheetWebhookUrl) {
      syncToggleSessionToSpreadsheet(
        updated.spreadsheetWebhookUrl,
        updated.eventCode,
        updated.securitySecret,
        sessionId,
        isActive
      ).catch((err) => console.warn("Background session toggle sync error:", err));
    }
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
        defaultEventCode={urlParams.eventCode || ""}
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
            <span className="text-xs sm:text-sm font-mono font-bold text-slate-500">
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
              onClick={() => handleDisconnectEvent()}
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
                  className="h-9 px-3 w-36 rounded-xl border border-slate-300 bg-white font-mono text-xs sm:text-sm text-slate-900 font-bold focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 uppercase tracking-wider shadow-2xs"
                  autoFocus
                />
                <button
                  type="submit"
                  className="h-9 px-4 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer shadow-2xs"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => setIsSwitchingEvent(false)}
                  className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 cursor-pointer text-xs font-semibold"
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
                onToggleSession={handleToggleSessionActive}
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
                onRevert={handleRevertAttendee}
                onSync={handleSyncRecords}
                isSyncing={isSyncingRecords}
              />
            </div>
          )}
        </div>

        {/* 4. Footer Bar: Hanya aktif di tab Matrix/Directory tanpa tombol Sync dobel */}
        {activeTab !== "scanner" && (
          <div className="p-3.5 sm:px-5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between pb-6 sm:pb-3.5">
            <button
              type="button"
              onClick={() => setActiveTab("scanner")}
              className="h-9 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <span>Back to Scanner</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal Sheets Sync & Webhook - Fullscreen di Mobile, Card Modal di Desktop */}
      {isSettingsOpen && eventConfig && (
        <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full sm:max-w-xl bg-white sm:rounded-2xl border-0 sm:border border-slate-200 shadow-2xl flex flex-col h-full sm:h-auto sm:max-h-[90vh] overflow-hidden">
            <div className="sticky top-0 bg-white z-10 px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-600" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Google Sheets Synchronization
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="h-8 px-3 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1">
              <WorkspaceControlPanel
                event={eventConfig}
                onUpdateEvent={(updated) => {
                  setEventConfig(updated);
                  setActiveEventCode(updated.eventCode);
                }}
                onDisconnect={handleDisconnectEvent}
                onClose={() => setIsSettingsOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FormSyncApp;
