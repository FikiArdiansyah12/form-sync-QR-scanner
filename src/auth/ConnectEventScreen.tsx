import React, { useState, useEffect } from "react";
import {
  QrCode,
  ShieldCheck,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Link2,
} from "lucide-react";
import { PortalHeader } from "../components/PortalHeader";
import { validateEventCodeFormat } from "../core/eventCodeGenerator";
import {
  isEventWorkspaceExists,
  loadEventFromStorage,
  getWebhookForEvent,
  saveWebhookMapping,
  registerWorkspaceEvent,
  saveEventToStorage,
} from "../core/storage";
import { isEventPinProtected, setEventUnlockedInSession } from "../core/securityLock";
import { fetchEventFromSpreadsheet, testSpreadsheetConnectivity } from "../bridge/spreadsheetSync";

export interface ConnectResult {
  success: boolean;
  error?: string;
}

export interface ConnectEventScreenProps {
  onConnectEvent: (eventCode: string) => ConnectResult;
  onRegisterFromSpreadsheet?: (webhookUrl: string, eventCode: string) => Promise<ConnectResult>;
  initialError?: string | null;
}

/**
 * ConnectEventScreen
 * Layar tunggal terpadu untuk menghubungkan ruang kerja acara.
 * Alur terpadu tanpa tab ganda dan tanpa elemen redundan:
 * 1. Masukkan Event Code -> Langsung verifikasi & fetch ke backend
 * 2. Jika event ber-PIN -> Tampilkan form input Security PIN
 * 3. Jika event valid & PIN cocok -> Masuk ke Gate Scanner
 */
export const ConnectEventScreen: React.FC<ConnectEventScreenProps> = ({
  onConnectEvent,
  onRegisterFromSpreadsheet,
  initialError,
}) => {
  // Mode tampilan: "code" (masukkan event code) atau "pin" (verifikasi PIN)
  const [stage, setStage] = useState<"code" | "pin">("code");
  const [codeInput, setCodeInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(initialError || null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Opsi webhook manual (collapsible) jika perangkat belum pernah membuka link scanner
  const [showCustomWebhook, setShowCustomWebhook] = useState(false);
  const [customWebhookUrl, setCustomWebhookUrl] = useState("");

  // Menyimpan data event sementara yang sedang diverifikasi PIN-nya
  const [pendingEventCode, setPendingEventCode] = useState<string>("");
  const [pendingExpectedPin, setPendingExpectedPin] = useState<string>("");

  useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  const handleFormatInput = (val: string) => {
    const raw = val.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (raw.length <= 4) {
      setCodeInput(raw);
    } else {
      setCodeInput(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
    }
    if (error) setError(null);
  };

  /**
   * Tahap 1: Verifikasi Event Code & Fetch ke Backend
   */
  const handleProceedCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = codeInput.trim().toUpperCase();
    if (!validateEventCodeFormat(formatted)) {
      setError("Please enter a valid 8-digit code format: XXXX-YYYY");
      return;
    }
    setError(null);
    setIsVerifying(true);

    try {
      // 1. Cek apakah ada Webhook URL tersimpan di persistent registry
      let webhookUrl = getWebhookForEvent(formatted);

      // Jika user menginput custom webhook di menu collapsible
      if (customWebhookUrl.trim()) {
        webhookUrl = customWebhookUrl.trim();
        saveWebhookMapping(formatted, webhookUrl);
      }

      // 2. Jika ada webhook URL, lakukan live fetch ke backend Google Sheets
      if (webhookUrl) {
        const fetchRes = await fetchEventFromSpreadsheet(webhookUrl, formatted);
        if (fetchRes.success) {
          // Event terverifikasi di backend Google Sheets
          const remotePin = fetchRes.pin || "";
          const hasPin = Boolean(fetchRes.hasPin || remotePin);

          // Daftarkan/update event di local storage
          let existing = loadEventFromStorage(formatted);
          if (!existing) {
            existing = registerWorkspaceEvent(formatted, {
              origin: "sheets",
              securitySecret: fetchRes.securitySecret,
              pin: remotePin,
            });
          } else {
            existing.pin = remotePin;
            if (fetchRes.securitySecret) existing.securitySecret = fetchRes.securitySecret;
          }
          existing.spreadsheetWebhookUrl = webhookUrl;
          if (fetchRes.attendees) existing.attendees = fetchRes.attendees;
          saveEventToStorage(existing);

          // Jika event terproteksi PIN, alihkan ke tahap input PIN
          if (hasPin) {
            setPendingEventCode(formatted);
            setPendingExpectedPin(remotePin);
            setStage("pin");
            setPinInput("");
            setIsVerifying(false);
            return;
          }

          // Jika open access (tanpa PIN), langsung connect
          completeConnection(formatted);
          return;
        } else {
          // Fetch gagal
          setError(
            fetchRes.error ||
              `Failed to fetch event '${formatted}' from Google Sheets. Check your webhook URL.`
          );
          setIsVerifying(false);
          return;
        }
      }

      // 3. Jika tidak ada webhook tapi event sudah ada di local storage
      if (isEventWorkspaceExists(formatted)) {
        const localEvent = loadEventFromStorage(formatted);
        if (localEvent && isEventPinProtected(localEvent.pin)) {
          setPendingEventCode(formatted);
          setPendingExpectedPin(localEvent.pin || "");
          setStage("pin");
          setPinInput("");
          setIsVerifying(false);
          return;
        }
        completeConnection(formatted);
        return;
      }

      // 4. Jika event tidak ditemukan di lokal dan belum ada webhook terhubung
      setError(
        `Event Code '${formatted}' is not paired yet. Open the scanner link from your FormSync Google Sheets add-on once to link it automatically, or enter your Apps Script Webhook below.`
      );
      setShowCustomWebhook(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error verifying event workspace.";
      setError(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  /**
   * Tahap 2: Verifikasi Operator Security PIN
   */
  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pinInput.trim();
    if (!cleanPin) {
      setError("Please enter the Operator Security PIN.");
      return;
    }

    if (pendingExpectedPin && cleanPin !== pendingExpectedPin) {
      setError("Incorrect Security PIN. Please check the PIN set in your Google Sheet add-on.");
      return;
    }

    // PIN Valid: Catat status unlock di sesi dan masuk ke workspace
    setEventUnlockedInSession(pendingEventCode);
    completeConnection(pendingEventCode);
  };

  const completeConnection = (code: string) => {
    const res = onConnectEvent(code);
    if (!res.success) {
      setError(res.error || `Could not connect to event '${code}'.`);
      setStage("code");
      return;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 sm:bg-slate-100/80 p-0 sm:py-8 sm:px-4 font-sans text-slate-900 selection:bg-slate-200 flex justify-center items-center">
      <div className="w-full max-w-lg bg-white sm:rounded-2xl border-0 sm:border border-slate-200 shadow-none sm:shadow-lg overflow-hidden flex flex-col min-h-screen sm:min-h-0">
        {/* Top Header Bar */}
        <PortalHeader badgeText={stage === "pin" ? "Protected" : "Connect"} />

        {/* Content Body */}
        <div className="p-5 sm:p-7 space-y-5 bg-white flex-1">
          {stage === "code" ? (
            /* TAHAP 1: INPUT EVENT CODE */
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-100 text-slate-800 mb-1">
                  <QrCode className="w-6 h-6" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  Connect Event Workspace
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Enter the 8-digit Event Code from your Google Sheets FormSync add-on to access the gate scanner and attendance matrix.
                </p>
              </div>

              <form onSubmit={handleProceedCode} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    8-Digit Event Code
                  </label>

                  <input
                    type="text"
                    maxLength={9}
                    value={codeInput}
                    onChange={(e) => handleFormatInput(e.target.value)}
                    placeholder="e.g. ABCD-1234"
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-center text-xl text-slate-900 font-mono font-bold tracking-widest uppercase focus:bg-white focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all placeholder:text-slate-300"
                  />

                  {error && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium leading-relaxed">
                      {error}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-sm font-bold shadow-xs transition-colors cursor-pointer text-center"
                >
                  {isVerifying ? "Verifying..." : "Connect Workspace"}
                </button>
              </form>

              {/* Opsi Opsional: Input Webhook Pertama Kali jika belum pairing */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomWebhook(!showCustomWebhook)}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Link2 className="size-3.5 text-slate-400" />
                  <span>
                    {showCustomWebhook
                      ? "Hide Advanced Webhook Pairing"
                      : "First time on this device? Pair via Webhook URL"}
                  </span>
                </button>

                {showCustomWebhook && (
                  <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                      Google Apps Script Webhook URL
                    </label>
                    <input
                      type="url"
                      value={customWebhookUrl}
                      onChange={(e) => setCustomWebhookUrl(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-slate-800"
                    />
                    <p className="text-[11px] text-slate-500">
                      Copy this from your Google Sheets FormSync add-on. Once entered, this device will remember the connection permanently.
                    </p>
                  </div>
                )}
              </div>

              {/* Help Callout */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-800 block">
                    Where do I find my Event Code?
                  </span>
                  <span>
                    Open your event spreadsheet, go to{" "}
                    <strong className="text-slate-700">Extensions &gt; FormSync &gt; Attendance</strong>, and copy your assigned 8-digit code or scanner link.
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* TAHAP 2: VERIFIKASI OPERATOR SECURITY PIN */
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 mb-1">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  Security PIN Required
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
                  Workspace <strong className="font-mono text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{pendingEventCode}</strong> is protected. Enter the 4–8 digit PIN configured in your Google Sheet add-on.
                </p>
              </div>

              <form onSubmit={handleVerifyPin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Operator Security PIN
                  </label>

                  <div className="relative">
                    <input
                      type={showPin ? "text" : "password"}
                      maxLength={12}
                      value={pinInput}
                      onChange={(e) => {
                        setPinInput(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Enter 4-8 digit PIN"
                      autoFocus
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-center text-xl text-slate-900 font-mono font-bold tracking-widest focus:bg-white focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all placeholder:text-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showPin ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>

                  {error && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium leading-relaxed">
                      {error}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStage("code");
                      setError(null);
                    }}
                    className="py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer text-center"
                  >
                    Back
                  </button>

                  <button
                    type="submit"
                    className="flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer text-center"
                  >
                    Unlock and Enter
                  </button>
                </div>
              </form>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 leading-relaxed text-center">
                Security PIN is managed exclusively by the event coordinator in the Google Sheets FormSync add-on.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50 text-center">
          <p className="text-xs text-slate-400">
            FormSync Field Check-In &amp; Gate Scanner Portal
          </p>
        </div>
      </div>
    </div>
  );
};
