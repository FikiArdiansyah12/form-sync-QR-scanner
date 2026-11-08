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
  X,
} from "lucide-react";
import { type WorkspaceEventConfig } from "../core/types";
import { generateAppsScriptCode } from "../bridge/googleAppsScriptBridge";
import { generate8DigitEventCode } from "../core/eventCodeGenerator";

export interface WorkspaceControlPanelProps {
  event: WorkspaceEventConfig;
  onUpdateEvent: (updated: WorkspaceEventConfig) => void;
}

export function WorkspaceControlPanel({
  event,
  onUpdateEvent,
}: WorkspaceControlPanelProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const scannerUrl = `https://formsync.my.id/scanner?event=${event.eventCode}`;

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

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs select-none font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground tracking-tight">
              Event Workspace Coordinator
            </h2>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-md font-medium border ${
                event.isActive
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted border-border/80 text-muted-foreground"
              }`}
            >
              {event.isActive ? "Scanner Active" : "Scanner Inactive"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Single permanent event identifier linked to your Google Sheet database.
          </p>
        </div>

        {/* Sakelar Active / Inactive (Zero-dot policy: teks langsung) */}
        <button
          type="button"
          onClick={handleToggleActive}
          className={`h-9 px-3.5 rounded-xl text-xs font-medium cursor-pointer transition-colors flex items-center gap-2 border ${
            event.isActive
              ? "bg-card border-border/80 text-foreground hover:bg-muted"
              : "bg-muted/60 border-border text-muted-foreground hover:text-foreground"
          }`}
          title="Toggle scanner active state"
          aria-label="Toggle scanner active state"
        >
          <Power className={`size-3.5 ${event.isActive ? "text-emerald-500" : "text-muted-foreground"}`} />
          <span>{event.isActive ? "Deactivate Scanner" : "Activate Scanner"}</span>
        </button>
      </div>

      {/* Bagian Kode Acara 8-Digit Terkunci */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              8-Digit Event Code
            </span>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Lock className="size-3" />
              <span>Locked</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xl sm:text-2xl font-bold tracking-wider text-foreground">
              {event.eventCode}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCopyCode}
                className="size-8 rounded-lg border border-border/80 bg-card hover:bg-muted flex items-center justify-center transition-colors cursor-pointer text-foreground"
                title="Copy event code"
                aria-label="Copy event code"
              >
                {copiedCode ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="size-8 rounded-lg border border-border/80 bg-card hover:bg-muted flex items-center justify-center transition-colors cursor-pointer text-foreground"
                title="View scanner QR code"
                aria-label="View scanner QR code"
              >
                <QrCode className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between pt-2.5 border-t border-border/40 text-[11px]">
            <span className="text-muted-foreground">Permanent lock active</span>
            <button
              type="button"
              onClick={() => setShowRegenerateConfirm(true)}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
            >
              Regenerate Code
            </button>
          </div>
        </div>

        {/* Bagian Tautan Panitia & Webhook Bridge */}
        <div className="p-4 rounded-xl bg-muted/40 border border-border/60 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Field Scanner URL
              </span>
              <a
                href={scannerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <span>Preview</span>
                <ExternalLink className="size-3" />
              </a>
            </div>

            <div className="p-2 rounded-lg bg-card border border-border/60 font-mono text-xs text-foreground truncate select-all">
              {scannerUrl}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/40">
            <button
              type="button"
              onClick={handleCopyUrl}
              className="flex-1 h-8 rounded-lg border border-border/80 bg-card hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              {copiedUrl ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
              <span>{copiedUrl ? "URL Copied" : "Copy Scanner URL"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowScriptModal(true)}
              className="h-8 px-3 rounded-lg border border-border/80 bg-card hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer flex items-center gap-1.5"
              title="Google Sheets Apps Script Bridge"
            >
              <Code2 className="size-3" />
              <span>Sheets Script</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal QR Code Lapangan */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4 animate-in fade-in-50 duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl relative">
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 size-7 rounded-lg text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer"
              title="Close modal"
              aria-label="Close modal"
            >
              <X className="size-4" />
            </button>

            <h3 className="text-base font-semibold text-foreground text-center">
              Field Scanner QR Access
            </h3>
            <p className="text-xs text-muted-foreground text-center mt-1">
              Have event committee scan this QR code with their smartphone camera.
            </p>

            <div className="my-5 p-4 bg-white rounded-xl flex items-center justify-center mx-auto w-48 h-48 border border-border/60">
              {/* Fallback QR placeholder jika qrcode generator runtime tersedia */}
              <div className="text-center font-mono text-xs text-slate-900 break-all p-2">
                <span className="block font-bold text-sm mb-1">{event.eventCode}</span>
                <span className="text-[10px] text-slate-600">{scannerUrl}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="flex-1 h-9 rounded-xl border border-border/80 bg-muted hover:bg-muted/80 text-xs font-medium text-foreground cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Copy className="size-3.5" />
                <span>Copy URL</span>
              </button>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="h-9 px-4 rounded-xl bg-foreground text-background text-xs font-medium cursor-pointer hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Regenerate Code */}
      {showRegenerateConfirm && (
        <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4 animate-in fade-in-50 duration-200">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center gap-2.5 text-amber-500 mb-2">
              <ShieldAlert className="size-5" />
              <h3 className="text-base font-semibold text-foreground">Regenerate Event Code?</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Generating a new event code will invalidate the current code ({event.eventCode}).
              Any printed QR badges or committee links using the old code will no longer work.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowRegenerateConfirm(false)}
                className="h-9 px-4 rounded-xl border border-border/80 text-xs font-medium text-foreground hover:bg-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRegenerate}
                className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium cursor-pointer"
              >
                Confirm Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Google Sheets Apps Script */}
      {showScriptModal && (
        <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4 animate-in fade-in-50 duration-200">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Google Sheets Apps Script Bridge
                </h3>
                <p className="text-xs text-muted-foreground">
                  Paste this script into Extensions -&gt; Apps Script in your spreadsheet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowScriptModal(false)}
                className="size-7 rounded-lg text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer"
                title="Close"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <pre className="my-4 flex-1 overflow-auto p-4 rounded-xl bg-muted/60 border border-border/60 font-mono text-xs text-foreground select-all leading-relaxed">
              <code>{generateAppsScriptCode(event.eventCode, event.securitySecret)}</code>
            </pre>

            <div className="flex justify-between items-center pt-2">
              <span className="text-[11px] text-muted-foreground">
                Configured for Event ID: {event.eventCode}
              </span>
              <button
                type="button"
                onClick={handleCopyScript}
                className="h-9 px-4 rounded-xl bg-foreground text-background text-xs font-medium cursor-pointer hover:opacity-90 flex items-center gap-1.5"
              >
                {copiedScript ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                <span>{copiedScript ? "Script Copied" : "Copy Full Script"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
