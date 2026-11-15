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
import { validateEventCodeFormat, normalizeEventCode } from "../core/eventCodeGenerator";
import {
  isEventWorkspaceExists,
  isEventWorkspacePaired,
  loadEventFromStorage,
  getWebhookForEvent,
  saveWebhookMapping,
  registerWorkspaceEvent,
  saveEventToStorage,
} from "../core/storage";
import {
  isEventPinProtected,
  setEventUnlockedInSession,
  isEventUnlockedInSession,
} from "../core/securityLock";
import { fetchEventFromSpreadsheet, testSpreadsheetConnectivity, extractValidWebhookUrl } from "../bridge/spreadsheetSync";

export interface ConnectResult {
  success: boolean;
  error?: string;
}

export interface ConnectEventScreenProps {
  onConnectEvent: (eventCode: string) => ConnectResult;
  onRegisterFromSpreadsheet?: (webhookUrl: string, eventCode: string) => Promise<ConnectResult>;
  initialError?: string | null;
  defaultEventCode?: string;
}

/**
 * ConnectEventScreen
 * Layar otentikasi tunggal terpadu untuk menghubungkan ruang kerja acara.
 * Alur 3-Tahap Progresif Sesuai Spesifikasi:
 * 1. Masukkan Event Code -> Validasi: apakah code sudah pernah masuk ke workspace di perangkat ini (isEventWorkspaceExists)?
 * 2. Jika BELUM -> Pengguna diminta memasukkan Webhook URL Google Apps Script.
 * 3. Setelah masuk (via Webhook atau sudah terdaftar) -> Periksa apakah workspace punya PIN:
 *    - Jika punya PIN -> Pengguna wajib memasukkan Operator Security PIN.
 *    - Jika tidak punya PIN -> Langsung masuk ke Gate Scanner & Attendance Matrix.
 */
export const ConnectEventScreen: React.FC<ConnectEventScreenProps> = ({
  onConnectEvent,
  onRegisterFromSpreadsheet,
  initialError,
  defaultEventCode = "",
}) => {
  // Mode tampilan: "code" (masukkan event code), "pair" (minta webhook jika belum pernah masuk), atau "pin" (verifikasi PIN)
  const [stage, setStage] = useState<"code" | "pair" | "pin">("code");
  const [codeInput, setCodeInput] = useState(defaultEventCode);
  const [pinInput, setPinInput] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(
    typeof initialError === "string" && initialError.trim() ? initialError.trim() : null
  );
  const [isVerifying, setIsVerifying] = useState(false);

  // Webhook URL untuk progressive pairing
  const [customWebhookUrl, setCustomWebhookUrl] = useState("");

  // Menyimpan data event sementara yang sedang diverifikasi PIN atau pairing-nya
  const [pendingEventCode, setPendingEventCode] = useState<string>("");
  const [pendingExpectedPin, setPendingExpectedPin] = useState<string>("");

  useEffect(() => {
    if (typeof initialError === "string" && initialError.trim()) {
      setError(initialError.trim());
    } else {
      setError(null);
    }
  }, [initialError]);

  const handleFormatInput = (val: string) => {
    let rawInput = val.trim();

    // Otomatis ekstrak jika pengguna menempelkan link scanner portal lengkap
    if (rawInput.includes("event=")) {
      try {
        const fullUrl = rawInput.startsWith("http") ? rawInput : `https://${rawInput}`;
        const parsed = new URL(fullUrl);
        const extractedEvent = parsed.searchParams.get("event");
        const extractedWh = parsed.searchParams.get("wh");
        if (extractedEvent) {
          const cleanCode = normalizeEventCode(extractedEvent);
          setCodeInput(cleanCode);
          if (extractedWh && extractedWh.includes("script.google.com")) {
            saveWebhookMapping(cleanCode, decodeURIComponent(extractedWh));
          }
          if (error) setError(null);
          return;
        }
      } catch {}
    }

    const raw = rawInput.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (raw.length <= 4) {
      setCodeInput(raw);
    } else {
      setCodeInput(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
    }
    if (error) setError(null);
  };

  /**
   * Tahap 1: Verifikasi Event Code
   * Logika Utama:
   * 1. Validasi format 8-digit XXXX-YYYY.
   * 2. Periksa: apakah code sudah pernah masuk ke workspace di perangkat ini (isEventWorkspaceExists)?
   * 3. Jika BELUM:
   *    - Langsung alihkan ke Tahap 2 (stage = "pair") untuk meminta Webhook URL.
   * 4. Jika SUDAH:
   *    - Periksa apakah workspace punya PIN:
   *      - Jika punya PIN: Alihkan ke Tahap 3 (stage = "pin").
   *      - Jika tidak punya PIN: Langsung masuk ke Workspace.
   */
  const handleProceedCode = (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = codeInput.trim().toUpperCase();
    if (!validateEventCodeFormat(formatted)) {
      setError("Please enter a valid 8-digit code format: XXXX-YYYY");
      return;
    }
    setError(null);

    // 1. Validasi: apakah kode acara sudah pernah dipasangkan dengan Webhook yang aktif di perangkat ini
    const isPaired = isEventWorkspacePaired(formatted);

    if (!isPaired) {
      // JIKA BELUM PERNAH (atau belum terhubung webhook): Pengguna diminta memasukkan Webhook URL
      setPendingEventCode(formatted);
      setCustomWebhookUrl("");
      setError(null);
      setStage("pair");
      return;
    }

    // JIKA SUDAH PERNAH: Periksa apakah workspace punya PIN atau tidak
    const localEvent = loadEventFromStorage(formatted);
    const hasPin = Boolean(localEvent && isEventPinProtected(localEvent.pin));
    const isUnlocked = isEventUnlockedInSession(formatted);

    if (hasPin && !isUnlocked) {
      // PUNYA PIN & BELUM UNLOCK: Pengguna wajib memasukkan Security PIN
      setPendingEventCode(formatted);
      setPendingExpectedPin(localEvent?.pin || "");
      setStage("pin");
      setPinInput("");
      return;
    }

    // TIDAK PUNYA PIN ATAU SUDAH DI-UNLOCK: Langsung masuk ke Workspace pemindai
    completeConnection(formatted);
  };

  /**
   * Tahap 2: Progressive Webhook Pairing (Saat event code belum pernah masuk ke workspace)
   * Logika:
   * 1. Pengguna memasukkan Webhook URL Google Apps Script.
   * 2. Lakukan live fetch ke spreadsheet backend via Webhook.
   * 3. Jika berhasil: Simpan pemetaan webhook & daftarkan workspace di storage lokal.
   * 4. Lalu periksa apakah workspace punya PIN atau tidak:
   *    - Jika PUNYA PIN: Alihkan ke Tahap 3 (stage = "pin") untuk meminta PIN.
   *    - Jika TIDAK PUNYA PIN: Langsung masuk ke Workspace pemindai.
   */
  const handlePairWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawWh = customWebhookUrl.trim();
    if (!rawWh) {
      setError("Please paste your Google Apps Script Webhook URL.");
      return;
    }

    const checkWh = extractValidWebhookUrl(rawWh);
    if (!checkWh.valid || !checkWh.resolvedUrl) {
      setError(
        checkWh.error ||
          "Invalid Webhook URL. Please paste your Google Apps Script Webhook (starts with https://script.google.com/macros/s/...) or click 'Open Scanner' in Google Sheets."
      );
      return;
    }

    const resolvedWebhook = checkWh.resolvedUrl;
    setError(null);
    setIsVerifying(true);

    try {
      // 1. Live fetch ke backend Google Sheets menggunakan webhook URL
      const fetchRes = await fetchEventFromSpreadsheet(resolvedWebhook, pendingEventCode);
      if (fetchRes.success) {
        // Simpan mapping webhook secara permanen di storage
        saveWebhookMapping(pendingEventCode, resolvedWebhook);

        const remotePin = fetchRes.pin || "";
        const hasPin = Boolean(fetchRes.hasPin || remotePin);

        let existing = loadEventFromStorage(pendingEventCode);
        if (!existing) {
          existing = registerWorkspaceEvent(pendingEventCode, {
            origin: "sheets",
            securitySecret: fetchRes.securitySecret,
            pin: remotePin,
          });
        } else {
          existing.pin = remotePin;
          if (fetchRes.securitySecret) existing.securitySecret = fetchRes.securitySecret;
        }
        existing.spreadsheetWebhookUrl = resolvedWebhook;
        if (fetchRes.attendees) existing.attendees = fetchRes.attendees;
        saveEventToStorage(existing);

        // 2. Periksa apakah workspace punya PIN atau tidak
        if (hasPin) {
          // PUNYA PIN: Wajib memasukkan Security PIN
          setPendingExpectedPin(remotePin);
          setStage("pin");
          setPinInput("");
          setIsVerifying(false);
          return;
        }

        // TIDAK PUNYA PIN: Langsung masuk ke workspace
        completeConnection(pendingEventCode);
        return;
      } else {
        setError(
          fetchRes.error ||
            `Failed to fetch event '${pendingEventCode}' from Google Sheets. Ensure your Webhook script is deployed as Web App and accessible.`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error pairing event with webhook.";
      setError(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  /**
   * Tahap 3: Verifikasi Operator Security PIN
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
        <PortalHeader badgeText={stage === "pin" ? "Protected" : undefined} />

        {/* Content Body */}
        <div className="p-5 sm:p-7 space-y-5 bg-white flex-1">
          {stage === "code" && (
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-center text-xl text-slate-900 font-mono font-bold tracking-widest uppercase focus:bg-white focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all placeholder:text-slate-300 shadow-2xs"
                  />

                  {typeof error === "string" && Boolean(error.trim()) && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium leading-relaxed">
                      {error}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isVerifying}
                  className="w-full h-11 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-sm font-bold shadow-2xs transition-colors cursor-pointer text-center flex items-center justify-center"
                >
                  {isVerifying ? "Verifying..." : "Connect Workspace"}
                </button>
              </form>

              {/* Help Callout */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
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
          )}

          {stage === "pair" && (
            /* TAHAP 2: PROGRESSIVE WEBHOOK PAIRING */
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-100 text-slate-800 mb-1">
                  <Link2 className="w-6 h-6" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  Pair Event Workspace
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Workspace <strong className="font-mono text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{pendingEventCode}</strong> is not paired on this device yet. Enter your Google Apps Script Webhook URL to link it permanently.
                </p>
              </div>

              <form onSubmit={handlePairWebhook} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Google Apps Script Webhook URL
                  </label>

                  <input
                    type="url"
                    value={customWebhookUrl}
                    onChange={(e) => {
                      setCustomWebhookUrl(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 h-11 text-xs sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all shadow-2xs"
                  />

                  {typeof error === "string" && Boolean(error.trim()) && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium leading-relaxed">
                      {error}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStage("code");
                      setError(null);
                    }}
                    className="w-full sm:w-auto h-11 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer text-center"
                  >
                    Change Code
                  </button>

                  <button
                    type="submit"
                    disabled={isVerifying}
                    className="w-full sm:flex-1 h-11 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs sm:text-sm font-bold shadow-2xs transition-colors cursor-pointer text-center flex items-center justify-center"
                  >
                    {isVerifying ? "Verifying & Pairing..." : "Pair & Connect Workspace"}
                  </button>
                </div>
              </form>

              {/* Callout Info */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-800 block">
                    Instant Auto-Connect Tip
                  </span>
                  <span>
                    You can also open the event spreadsheet, go to <strong className="text-slate-700">Extensions &gt; FormSync &gt; Attendance</strong>, and click <strong className="text-slate-700">Open Scanner</strong> to pair this device automatically without typing the Webhook URL.
                  </span>
                </div>
              </div>
            </div>
          )}

          {stage === "pin" && (
            /* TAHAP 3: VERIFIKASI OPERATOR SECURITY PIN */
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 text-slate-800 mb-1">
                  <Lock className="w-5 h-5" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  Security PIN Required
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
                  Workspace <strong className="font-mono text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 font-bold">{pendingEventCode}</strong> is protected. Enter the 4–8 digit PIN configured in your Google Sheet add-on.
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
                      inputMode="numeric"
                      maxLength={12}
                      value={pinInput}
                      onChange={(e) => {
                        setPinInput(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Enter 4-8 digit PIN"
                      autoFocus
                      autoComplete="new-password"
                      spellCheck={false}
                      className="w-full h-12 bg-slate-50 border border-slate-300 rounded-xl px-4 text-center text-lg sm:text-xl text-slate-900 font-mono font-bold tracking-[0.25em] focus:bg-white focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all placeholder:text-slate-400 placeholder:tracking-normal placeholder:font-normal placeholder:text-sm shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                      title={showPin ? "Hide PIN" : "Show PIN"}
                      aria-label={showPin ? "Hide PIN" : "Show PIN"}
                    >
                      {showPin ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>

                  {typeof error === "string" && Boolean(error.trim()) && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium leading-relaxed">
                      {error}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStage("code");
                      setError(null);
                    }}
                    className="col-span-1 h-11 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer text-center flex items-center justify-center"
                  >
                    Back
                  </button>

                  <button
                    type="submit"
                    className="col-span-2 h-11 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold shadow-2xs transition-colors cursor-pointer text-center flex items-center justify-center"
                  >
                    Unlock and Enter
                  </button>
                </div>
              </form>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
                <KeyRound className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-800 block">
                    Coordinator Security PIN
                  </span>
                  <span>
                    The security PIN is configured and managed in your Google Sheet under <strong className="text-slate-700">Extensions &gt; FormSync &gt; Attendance</strong>.
                  </span>
                </div>
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
