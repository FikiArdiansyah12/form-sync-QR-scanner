import React, { useState, useEffect } from "react";
import {
  Copy,
  Check,
  QrCode,
  ShieldAlert,
  ExternalLink,
  Code2,
  Lock,
  Power,
  Activity,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { type WorkspaceEventConfig } from "../core/types";
import { generateAppsScriptCode } from "../bridge/googleAppsScriptBridge";
import { generate8DigitEventCode } from "../core/eventCodeGenerator";
import {
  testSpreadsheetConnectivity,
  fetchEventFromSpreadsheet,
  requestAttendeeSyncFromSpreadsheet,
  mergeRemoteAttendees,
  type ConnectivityTestResult,
} from "../bridge/spreadsheetSync";

export interface WorkspaceControlPanelProps {
  event: WorkspaceEventConfig;
  onUpdateEvent: (updated: WorkspaceEventConfig) => void;
  onDisconnect?: (reasonMsg?: string) => void;
  onClose?: () => void;
}

/**
 * WorkspaceControlPanel
 * Panel sinkronisasi Google Sheets & kontrol koordinator acara.
 * Didesain flat, bersih, tanpa kontainer bertingkat berlebih, dan dioptimalkan untuk mobile.
 */
export function WorkspaceControlPanel({
  event,
  onUpdateEvent,
  onDisconnect,
  onClose,
}: WorkspaceControlPanelProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  // Inline collapsible states
  const [showQrInline, setShowQrInline] = useState(false);
  const [showScriptInline, setShowScriptInline] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  // Live Connectivity & Sheets Webhook State
  const [webhookInput, setWebhookInput] = useState(event.spreadsheetWebhookUrl || "");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectivityTestResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (event.spreadsheetWebhookUrl) {
      setWebhookInput(event.spreadsheetWebhookUrl);
    }
  }, [event.spreadsheetWebhookUrl]);

  const scannerUrl = `https://formsync.my.id/?event=${event.eventCode}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(event.eventCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(scannerUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyScript = () => {
    const script = generateAppsScriptCode(event.eventCode, event.securitySecret);
    navigator.clipboard.writeText(script);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleToggleActive = () => {
    onUpdateEvent({
      ...event,
      isActive: !event.isActive,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleConfirmRegenerate = () => {
    const newCode = generate8DigitEventCode();
    onUpdateEvent({
      ...event,
      eventCode: newCode,
      updatedAt: new Date().toISOString(),
    });
    setShowRegenerateConfirm(false);
  };

  const checkAndHandleDisconnection = (res: { error?: string; message?: string }): boolean => {
    if (
      res.error === "WORKSPACE_DISCONNECTED" ||
      (res.message && res.message.toLowerCase().includes("disconnected by the administrator"))
    ) {
      const disconnectMsg = res.message || "This event workspace has been disconnected by the administrator.";
      onClose?.();
      onDisconnect?.(disconnectMsg);
      return true;
    }
    return false;
  };

  const handleTestConnection = async () => {
    if (!webhookInput.trim()) {
      setTestResult({
        success: false,
        latencyMs: 0,
        eventMatched: false,
        message: "Please enter your Google Apps Script Webhook URL.",
        error: "URL_EMPTY",
      });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    setSyncFeedback(null);
    try {
      const res = await testSpreadsheetConnectivity(webhookInput, event.eventCode);
      setTestResult(res);

      if (checkAndHandleDisconnection(res)) {
        return;
      }

      if (res.success) {
        onUpdateEvent({
          ...event,
          spreadsheetWebhookUrl: webhookInput.trim(),
          updatedAt: new Date().toISOString(),
        });
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncAttendeesFromSheet = async () => {
    const url = webhookInput.trim() || event.spreadsheetWebhookUrl;
    if (!url) {
      setSyncFeedback("Please enter and verify Webhook URL first.");
      return;
    }
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      if (event.securitySecret) {
        try {
          await requestAttendeeSyncFromSpreadsheet(url, event.eventCode, event.securitySecret);
        } catch (ePre) {
          console.warn("Pre-sync attendee request:", ePre);
        }
      }
      const res = await fetchEventFromSpreadsheet(url, event.eventCode);

      if (checkAndHandleDisconnection(res)) {
        return;
      }

      if (res.success && res.attendees) {
        const merged = mergeRemoteAttendees(event, res);
        onUpdateEvent({
          ...merged,
          spreadsheetWebhookUrl: url,
        });
        setSyncFeedback(`Successfully synchronized ${res.attendees.length} attendee(s) from Google Sheets.`);
      } else {
        setSyncFeedback(`Sync failed: ${res.error || res.message || "Unknown error"}`);
      }
    } catch (e: any) {
      setSyncFeedback(`Sync failed: ${e?.message || "Network error"}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="select-none font-sans space-y-4">
      {/* 1. Header Bar: Status & Toggle Switch */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <span
              className={`size-2 rounded-full shrink-0 ${
                event.isActive ? "bg-emerald-500" : "bg-slate-400"
              }`}
            />
            <span className={event.isActive ? "text-emerald-700" : "text-slate-500"}>
              {event.isActive ? "Scanner Active" : "Scanner Inactive"}
            </span>
          </div>
          <span className="text-xs text-slate-400 hidden xs:inline">
            Single permanent identifier
          </span>
        </div>

        <button
          type="button"
          onClick={handleToggleActive}
          className={`h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 border shrink-0 ${
            event.isActive
              ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              : "bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900"
          }`}
          title="Toggle scanner active state"
        >
          <Power className={`size-3.5 ${event.isActive ? "text-emerald-600" : "text-slate-400"}`} />
          <span>{event.isActive ? "Deactivate" : "Activate"}</span>
        </button>
      </div>

      {/* 2. Grid Flat: Event Code & Scanner URL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Card A: 8-Digit Event Code */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              8-Digit Event Code
            </span>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
              <Lock className="size-3 text-slate-400" />
              <span>Locked</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 h-11">
            <span className="font-mono text-base sm:text-lg font-bold tracking-widest text-slate-900 truncate pl-1">
              {event.eventCode}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleCopyCode}
                className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center transition-colors cursor-pointer text-slate-700 text-xs font-semibold gap-1"
                title="Copy event code"
              >
                {copiedCode ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5 text-slate-500" />}
                <span>{copiedCode ? "Copied" : "Copy"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowQrInline(!showQrInline)}
                className={`size-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                  showQrInline
                    ? "bg-slate-900 border-slate-900 text-white"
                    : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
                title="Toggle QR Code view"
              >
                <QrCode className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-0.5">
            <span className="text-slate-400">Database linked</span>
            <button
              type="button"
              onClick={() => setShowRegenerateConfirm(true)}
              className="text-rose-600 hover:text-rose-700 hover:underline cursor-pointer font-medium"
            >
              Regenerate Code
            </button>
          </div>
        </div>

        {/* Card B: Field Scanner URL */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Field Scanner URL
            </span>
            <a
              href={scannerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
            >
              <span>Open Tab</span>
              <ExternalLink className="size-3" />
            </a>
          </div>

          <div className="h-11 flex items-center px-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs sm:text-sm text-slate-800 truncate select-all">
            {scannerUrl}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleCopyUrl}
              className="h-10 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
            >
              {copiedUrl ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5 text-slate-500" />}
              <span>{copiedUrl ? "Link Copied" : "Copy Link"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowScriptInline(!showScriptInline)}
              className={`h-10 px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shrink-0 shadow-2xs ${
                showScriptInline
                  ? "bg-slate-900 border-slate-900 text-white"
                  : "border-slate-300 bg-white hover:bg-slate-50 text-slate-800"
              }`}
            >
              <Code2 className="size-3.5" />
              <span>{showScriptInline ? "Hide Script" : "Sheets Script"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Google Sheets Webhook & Connectivity Strip */}
      <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-3 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Activity className="size-3.5 text-emerald-600" />
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Google Sheets Webhook &amp; Connectivity
            </span>
          </div>
          {event.spreadsheetWebhookUrl && (
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
              Linked
            </span>
          )}
        </div>

        <div className="space-y-2.5">
          <input
            type="url"
            value={webhookInput}
            onChange={(e) => setWebhookInput(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-slate-50/70 focus:bg-white text-xs sm:text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all shadow-2xs"
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="h-10 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-bold cursor-pointer transition-colors whitespace-nowrap shadow-2xs flex items-center justify-center gap-1.5"
            >
              <span>{isTesting ? "Testing..." : "Test Connectivity"}</span>
            </button>
            <button
              type="button"
              onClick={handleSyncAttendeesFromSheet}
              disabled={isSyncing || (!webhookInput.trim() && !event.spreadsheetWebhookUrl)}
              className="h-10 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-bold cursor-pointer transition-colors whitespace-nowrap shadow-2xs flex items-center justify-center gap-1.5"
            >
              <span>{isSyncing ? "Syncing..." : "Sync Attendees"}</span>
            </button>
          </div>
        </div>

        {/* Status Hasil Test Connectivity */}
        {testResult && (
          <div
            className={`p-3 rounded-lg border text-xs space-y-1 ${
              testResult.success
                ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                : testResult.error === "EVENT_MISMATCH"
                ? "bg-rose-50 border-rose-200 text-rose-900"
                : "bg-amber-50 border-amber-200 text-amber-900"
            }`}
          >
            <div className="flex items-center justify-between font-bold">
              <div className="flex items-center gap-1.5">
                {testResult.success ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <XCircle className="size-4 text-rose-600" />
                )}
                <span>
                  {testResult.success
                    ? "Connection Verified"
                    : testResult.error === "EVENT_MISMATCH"
                    ? "Event ID Rejected"
                    : "Connection Failed"}
                </span>
              </div>
              <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-white/80 border border-current">
                {testResult.latencyMs} ms
              </span>
            </div>
            <p className="text-[11px] leading-relaxed">
              {testResult.message}
            </p>
          </div>
        )}

        {/* Sync Feedback Message */}
        {syncFeedback && (
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium">
            {syncFeedback}
          </div>
        )}
      </div>

      {/* 4. Inline QR Code Card */}
      {showQrInline && (
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-3 shadow-2xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="size-4 text-slate-800" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Field Scanner QR Access
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowQrInline(false)}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
            >
              Close QR
            </button>
          </div>

          <p className="text-xs text-slate-500">
            Scan this QR code with smartphone camera to open the gate scanner directly.
          </p>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center max-w-xs mx-auto space-y-2">
            <span className="font-mono text-base font-bold text-slate-900 tracking-wider">
              {event.eventCode}
            </span>
            <div className="p-2 bg-white rounded-lg border border-slate-200 font-mono text-[11px] text-slate-600 break-all select-all">
              {scannerUrl}
            </div>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="mt-1 h-8 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Copy className="size-3" />
              <span>{copiedUrl ? "Link Copied" : "Copy Scanner URL"}</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. Inline Sheets Script Bridge */}
      {showScriptInline && (
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-3 shadow-2xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="size-4 text-slate-800" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Google Sheets Apps Script Bridge
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowScriptInline(false)}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
            >
              Close Script
            </button>
          </div>

          <pre className="max-h-48 overflow-auto p-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-800 select-all leading-relaxed">
            <code>{generateAppsScriptCode(event.eventCode, event.securitySecret)}</code>
          </pre>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-500">
              Event ID: {event.eventCode}
            </span>
            <button
              type="button"
              onClick={handleCopyScript}
              className="h-8 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
            >
              {copiedScript ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
              <span>{copiedScript ? "Script Copied" : "Copy Full Script"}</span>
            </button>
          </div>
        </div>
      )}

      {/* 6. Operator Security PIN Status */}
      <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Lock className="size-3.5 text-slate-700" />
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Operator Security PIN Status
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span
              className={`size-2 rounded-full shrink-0 ${
                event.pin ? "bg-emerald-500" : "bg-slate-400"
              }`}
            />
            <span className={event.pin ? "text-emerald-700" : "text-slate-500"}>
              {event.pin ? "Protected (Active)" : "Open Access (No PIN)"}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          {event.pin
            ? "Workspace is protected by an Operator Security PIN configured in your Google Sheets Add-on."
            : "No PIN required. To secure scanner access, configure an Operator Security PIN in your Google Sheets Add-on."}
        </p>
      </div>

      {/* 7. Modal Konfirmasi Regenerate Code */}
      {showRegenerateConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl space-y-3">
            <div className="flex items-center gap-2 text-amber-600">
              <ShieldAlert className="size-5" />
              <h3 className="text-sm font-bold text-slate-900">Regenerate Event Code?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Generating a new code will invalidate {event.eventCode}.
              Any committee links or printed badges using the old code will stop working.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRegenerateConfirm(false)}
                className="h-8 px-3.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRegenerate}
                className="h-8 px-3.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                Confirm Regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
