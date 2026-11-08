import React, { useState } from "react";
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
  syncPinToSpreadsheet,
  mergeRemoteAttendees,
  type ConnectivityTestResult,
} from "../bridge/spreadsheetSync";

export interface WorkspaceControlPanelProps {
  event: WorkspaceEventConfig;
  onUpdateEvent: (updated: WorkspaceEventConfig) => void;
}

/**
 * WorkspaceControlPanel
 * Panel konfigurasi koordinator acara dan sinkronisasi Google Sheets.
 * Desain mobile-first responsif, anti-overflow, dan bebas dari nested modal trap.
 */
export function WorkspaceControlPanel({
  event,
  onUpdateEvent,
}: WorkspaceControlPanelProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  // Inline collapsible states (menggantikan nested modals yang bertabrakan di mobile)
  const [showQrInline, setShowQrInline] = useState(false);
  const [showScriptInline, setShowScriptInline] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  // Live Connectivity & Sheets Webhook State
  const [webhookInput, setWebhookInput] = useState(event.spreadsheetWebhookUrl || "");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectivityTestResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

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
      const res = await fetchEventFromSpreadsheet(url, event.eventCode);
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs select-none font-sans space-y-4">
      {/* 1. Header Bar: Status & Kill Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Event Workspace Coordinator
            </h2>
            <span
              className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${
                event.isActive
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-slate-100 border-slate-200 text-slate-600"
              }`}
            >
              {event.isActive ? "Scanner Active" : "Scanner Inactive"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Single permanent event identifier linked to your Google Sheet database.
          </p>
        </div>

        <button
          type="button"
          onClick={handleToggleActive}
          className={`h-9 px-3.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-2 border shrink-0 ${
            event.isActive
              ? "bg-white border-slate-300 text-slate-800 hover:bg-slate-50 shadow-2xs"
              : "bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900"
          }`}
          title="Toggle scanner active state"
          aria-label="Toggle scanner active state"
        >
          <Power className={`size-3.5 ${event.isActive ? "text-emerald-600" : "text-slate-400"}`} />
          <span>{event.isActive ? "Deactivate Scanner" : "Activate Scanner"}</span>
        </button>
      </div>

      {/* 2. Grid Informasi Utama: Event Code & Scanner URL (Responsive 1 col mobile, 2 col sm/desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Card A: 8-Digit Event Code */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50/70 border border-slate-200 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                8-Digit Event Code
              </span>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                <Lock className="size-3 text-slate-400" />
                <span>Locked</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 bg-white p-2.5 rounded-lg border border-slate-200/90">
              <span className="font-mono text-lg sm:text-xl font-bold tracking-wider text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis">
                {event.eventCode}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="h-8 px-2.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer text-slate-700 text-xs font-semibold gap-1"
                  title="Copy event code"
                  aria-label="Copy event code"
                >
                  {copiedCode ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5 text-slate-500" />}
                  <span className="hidden xs:inline">{copiedCode ? "Copied" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowQrInline(!showQrInline)}
                  className={`size-8 rounded-md border flex items-center justify-center transition-colors cursor-pointer ${
                    showQrInline
                      ? "bg-slate-900 border-slate-900 text-white"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                  }`}
                  title="Toggle QR Code view"
                  aria-label="Toggle QR Code view"
                >
                  <QrCode className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px]">
            <span className="text-slate-500">Permanent lock active</span>
            <button
              type="button"
              onClick={() => setShowRegenerateConfirm(true)}
              className="text-xs text-rose-600 hover:text-rose-700 hover:underline cursor-pointer font-medium"
            >
              Regenerate Code
            </button>
          </div>
        </div>

        {/* Card B: Field Scanner URL */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50/70 border border-slate-200 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
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

            <div className="p-2 rounded-lg bg-white border border-slate-200/90 font-mono text-xs text-slate-800 truncate select-all">
              {scannerUrl}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
            <button
              type="button"
              onClick={handleCopyUrl}
              className="flex-1 h-8 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shadow-2xs"
            >
              {copiedUrl ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3 text-slate-500" />}
              <span>{copiedUrl ? "Link Copied" : "Copy Link"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowScriptInline(!showScriptInline)}
              className={`h-8 px-3 rounded-md border text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                showScriptInline
                  ? "bg-slate-900 border-slate-900 text-white"
                  : "border-slate-300 bg-white hover:bg-slate-50 text-slate-800 shadow-2xs"
              }`}
              title="Toggle Google Sheets Apps Script Bridge"
            >
              <Code2 className="size-3" />
              <span>{showScriptInline ? "Hide Script" : "Sheets Script"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2b. Live Google Sheets Connectivity & Sync Strip */}
      <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50/70 border border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-emerald-600" />
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Google Sheets Webhook &amp; Connectivity
            </span>
          </div>
          {event.spreadsheetWebhookUrl && (
            <span className="text-[11px] font-mono text-slate-500 truncate max-w-xs">
              Linked: {event.spreadsheetWebhookUrl}
            </span>
          )}
        </div>

        <p className="text-[12px] text-slate-600 leading-relaxed">
          Connect your Google Apps Script deployment URL to verify real-time sync with your spreadsheet database.
        </p>

        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={webhookInput}
              onChange={(e) => setWebhookInput(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="flex-1 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono text-slate-900 focus:outline-none focus:border-slate-800"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="h-9 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs font-semibold cursor-pointer transition-colors shadow-2xs whitespace-nowrap"
              >
                {isTesting ? "Testing..." : "Test Connectivity"}
              </button>
              <button
                type="button"
                onClick={handleSyncAttendeesFromSheet}
                disabled={isSyncing || (!webhookInput.trim() && !event.spreadsheetWebhookUrl)}
                className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-semibold cursor-pointer transition-colors shadow-2xs whitespace-nowrap"
              >
                <span>{isSyncing ? "Syncing..." : "Sync Attendees"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Status Hasil Test Connectivity */}
        {testResult && (
          <div
            className={`p-3 rounded-lg border text-xs space-y-1.5 ${
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
            <p className="text-[12px] leading-relaxed">
              {testResult.message}
            </p>
          </div>
        )}

        {/* Sync Feedback Message */}
        {syncFeedback && (
          <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-800 font-medium">
            {syncFeedback}
          </div>
        )}
      </div>

      {/* 3. Inline QR Code Card (Bebas dari nested modal trap, rapi di mobile & desktop) */}
      {showQrInline && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 animate-in fade-in duration-150">
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

          <p className="text-xs text-slate-600">
            Have field committee scan this QR code with their smartphone camera to open the gate scanner directly.
          </p>

          <div className="p-4 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center max-w-xs mx-auto space-y-2 shadow-2xs">
            <span className="font-mono text-base font-bold text-slate-900 tracking-wider">
              {event.eventCode}
            </span>
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-600 break-all select-all">
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

      {/* 4. Inline Sheets Script Bridge (Bebas dari nested modal trap) */}
      {showScriptInline && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 animate-in fade-in duration-150">
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

          <p className="text-xs text-slate-600">
            Paste this script into Extensions -&gt; Apps Script in your spreadsheet to sync attendance back and forth.
          </p>

          <pre className="max-h-48 overflow-auto p-3.5 rounded-lg bg-white border border-slate-200 font-mono text-[11px] text-slate-800 select-all leading-relaxed shadow-2xs">
            <code>{generateAppsScriptCode(event.eventCode, event.securitySecret)}</code>
          </pre>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-500">
              Configured for Event ID: {event.eventCode}
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

      {/* 5. Operator Security PIN Status (Read-Only di Web App demi keamanan database Sheets) */}
      <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50/70 border border-slate-200 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Lock className="size-3.5 text-slate-700" />
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Operator Security PIN Status
            </span>
          </div>
          <span
            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
              event.pin
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-slate-100 border-slate-200 text-slate-600"
            }`}
          >
            {event.pin ? "Protected (Active)" : "Open Access (No PIN)"}
          </span>
        </div>

        <p className="text-[12px] text-slate-600 leading-relaxed">
          {event.pin
            ? "This workspace is protected by an Operator Security PIN. To change or reset the PIN, please configure it directly in your Google Sheets FormSync add-on."
            : "No Security PIN configured. Anyone with this event link can scan tickets. To protect your database, set an Operator Security PIN in your Google Sheets FormSync add-on."}
        </p>
      </div>

      {/* 6. Modal Konfirmasi Regenerate Code (Dialog Penting Berdiri Sendiri) */}
      {showRegenerateConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-amber-600">
              <ShieldAlert className="size-5" />
              <h3 className="text-base font-bold text-slate-900">Regenerate Event Code?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Generating a new event code will invalidate the current code ({event.eventCode}).
              Any printed QR badges or committee links using the old code will no longer work.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRegenerateConfirm(false)}
                className="h-9 px-4 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRegenerate}
                className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
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
