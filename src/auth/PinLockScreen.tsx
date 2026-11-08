import React, { useState } from "react";
import { Shield, KeyRound, ArrowRight, CornerDownLeft } from "lucide-react";
import { FormSyncBrandLogo } from "../components/FormSyncBrandLogo";
import { PortalHeader } from "../components/PortalHeader";
import { validateEventCodeFormat } from "../core/eventCodeGenerator";

export interface PinLockScreenProps {
  eventCode: string;
  eventName: string;
  onUnlock: (pin: string) => boolean;
  onSelectEvent: (code: string) => void;
}

/**
 * PinLockScreen
 * Komponen layar otentikasi PIN operator.
 * Ditampilkan saat acara dilindungi oleh security PIN sebelum memberikan akses
 * ke pemindai tiket (Gate Scanner), cross-check matrix, dan direktori peserta.
 */
export const PinLockScreen: React.FC<PinLockScreenProps> = ({
  eventCode,
  eventName,
  onUnlock,
  onSelectEvent,
}) => {
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [switchCodeInput, setSwitchCodeInput] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) {
      setError("Please enter the security PIN.");
      return;
    }

    setIsVerifying(true);
    setError(null);

    const success = onUnlock(pinInput.trim());
    if (!success) {
      setError("Incorrect Security PIN. Please verify with your event coordinator.");
      setIsVerifying(false);
    }
  };

  const handleSwitchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = switchCodeInput.trim().toUpperCase();
    if (!validateEventCodeFormat(formatted)) {
      setError("Format: XXXX-YYYY (e.g. ABCD-1234)");
      return;
    }
    setError(null);
    onSelectEvent(formatted);
    setIsSwitchingMode(false);
    setSwitchCodeInput("");
  };

  return (
    <div className="min-h-screen bg-slate-100/80 py-8 px-4 font-sans text-slate-900 selection:bg-slate-200 flex justify-center items-center">
      <div className="w-full max-w-md bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col">
        {/* Top Header Bar */}
        <PortalHeader badgeText={isSwitchingMode ? "Select Event" : "Protected"} />

        {/* Body Content */}
        <div className="p-6 sm:p-8 space-y-6 bg-white">
          {!isSwitchingMode ? (
            /* Mode 1: Verifikasi PIN */
            <>
              <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 text-[#ea1d25] mb-1">
                  <KeyRound className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                    Operator PIN Required
                  </h2>
                  <p className="text-[13px] text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                    Enter the security PIN set by the coordinator to access scanner and check-in records.
                  </p>
                </div>

                {/* Event Code Badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                  <span className="font-semibold text-slate-500">Event:</span>
                  <span className="font-bold text-slate-900">{eventName}</span>
                  <span className="font-mono font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                    {eventCode}
                  </span>
                </div>
              </div>

              {/* Form Input PIN */}
              <form onSubmit={handlePinSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[13px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-slate-600" />
                      <span>Security PIN</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
                    >
                      {showPin ? "Hide PIN" : "Show PIN"}
                    </button>
                  </div>

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
                      className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-center text-lg text-slate-900 font-mono tracking-widest focus:outline-none focus:border-[#ea1d25] focus:ring-2 focus:ring-[#ea1d25]/15 transition-all"
                    />
                  </div>

                  {error && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                      {error}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="space-y-2.5 pt-2">
                  <button
                    type="submit"
                    disabled={isVerifying}
                    className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[14px] font-bold shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <span>{isVerifying ? "Verifying PIN..." : "Unlock Scanner"}</span>
                    {!isVerifying && <ArrowRight className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsSwitchingMode(true);
                      setError(null);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <CornerDownLeft className="w-3.5 h-3.5" />
                    <span>Switch to Another Event</span>
                  </button>
                </div>
              </form>
            </>
          ) : (
            /* Mode 2: Switch Event Code */
            <>
              <div className="text-center space-y-3">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 text-slate-800 mb-1">
                  <FormSyncBrandLogo className="w-8 h-8" showDomain={false} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                    Load Event by Code
                  </h2>
                  <p className="text-[13px] text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                    Enter the 8-digit event code provided on the Google Sheets FormSync add-on.
                  </p>
                </div>
              </div>

              {/* Form Input Event Code */}
              <form onSubmit={handleSwitchSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-slate-700 uppercase tracking-wider block">
                    8-Digit Event Code
                  </label>
                  <input
                    type="text"
                    maxLength={9}
                    value={switchCodeInput}
                    onChange={(e) => {
                      setSwitchCodeInput(e.target.value.toUpperCase());
                      if (error) setError(null);
                    }}
                    placeholder="e.g. ABCD-1234"
                    autoFocus
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-center text-lg text-slate-900 font-mono font-bold tracking-wider focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition-all uppercase"
                  />

                  {error && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                      {error}
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[14px] font-bold shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Load Event Workspace</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsSwitchingMode(false);
                      setError(null);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Back to PIN Verification
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 text-center">
          <p className="text-[11px] text-slate-400">
            FormSync Secure Multi-Tenant Gatekeeping
          </p>
        </div>
      </div>
    </div>
  );
};
