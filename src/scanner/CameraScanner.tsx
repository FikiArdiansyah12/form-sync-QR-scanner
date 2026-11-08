import React, { useState, useEffect, useRef } from "react";
import { Camera } from "lucide-react";

export interface CameraScannerProps {
  onScanTicket: (ticketCode: string) => void;
  onSwitchToManual: () => void;
}

/**
 * Komponen Kamera WebRTC Scanner responsif mobile-first.
 * 1:1 identik dengan antarmuka resmi screenshot Google Sheets dialog:
 * - State 'Camera Permission Required' berlatar dashed border bersih dengan tombol 'Try Camera Again' dan 'Switch to Manual Search'.
 * - Bebas emoticon dan bebas icon circular reload.
 */
export function CameraScanner({
  onScanTicket,
  onSwitchToManual,
}: CameraScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const isCooldownRef = useRef(false);

  // Inisialisasi akses kamera
  const startCamera = async () => {
    setIsScanning(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API not supported in this browser environment.");
      }

      // Hentikan stream sebelumnya jika ada
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setHasPermission(true);

      // Inisialisasi BarcodeDetector loop jika didukung oleh browser
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        try {
          const barcodeDetector = new (window as any).BarcodeDetector({
            formats: ["qr_code"],
          });

          if (scanIntervalRef.current) {
            window.clearInterval(scanIntervalRef.current);
          }

          scanIntervalRef.current = window.setInterval(async () => {
            if (
              videoRef.current &&
              videoRef.current.readyState >= 2 &&
              !isCooldownRef.current
            ) {
              try {
                const barcodes = await barcodeDetector.detect(videoRef.current);
                if (barcodes && barcodes.length > 0) {
                  const rawValue = barcodes[0].rawValue;
                  if (rawValue && rawValue.trim()) {
                    isCooldownRef.current = true;
                    onScanTicket(rawValue.trim());
                    // Cooldown 2.5 detik agar tidak men-scan tiket yang sama berulang kali per detik
                    window.setTimeout(() => {
                      isCooldownRef.current = false;
                    }, 2500);
                  }
                }
              } catch {
                // Frame decode error biasa, diabaikan
              }
            }
          }, 350);
        } catch {
          // BarcodeDetector fallback
        }
      }
    } catch {
      setHasPermission(false);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    startCamera();

    return () => {
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center w-full font-sans select-none">
      {/* Kasus 1: Izin Kamera Belum Diberikan / Ditolak (1:1 Screenshot Google Sheets Dialog) */}
      {hasPermission !== true && (
        <div className="w-full rounded-2xl border border-dashed border-slate-300 p-8 flex flex-col items-center text-center bg-white transition-all">
          {/* Kotak Ikon Kamera Abu-Abu */}
          <div className="size-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700 mb-4 shadow-2xs">
            <Camera className="size-6 stroke-[1.8]" />
          </div>

          <h4 className="text-base font-bold text-slate-900 tracking-tight">
            Camera Permission Required
          </h4>
          <p className="text-xs text-slate-500 mt-1.5 max-w-xs leading-relaxed">
            To scan QR tickets, allow browser camera permissions, or use Manual Search to check in attendees instantly.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-6 w-full justify-center">
            {/* Tombol Try Camera Again (Teks dinamis tanpa ikon panah melingkar) */}
            <button
              type="button"
              onClick={startCamera}
              disabled={isScanning}
              className="h-10 px-5 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer hover:bg-slate-800 transition-colors shadow-xs flex items-center justify-center disabled:opacity-60"
            >
              <span>{isScanning ? "Connecting..." : "Try Camera Again"}</span>
            </button>

            {/* Tombol Switch to Manual Search */}
            <button
              type="button"
              onClick={onSwitchToManual}
              className="h-10 px-5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 cursor-pointer transition-colors flex items-center justify-center"
            >
              <span>Switch to Manual Search</span>
            </button>
          </div>
        </div>
      )}

      {/* Kasus 2: Kamera Aktif dan Siap Scan */}
      {hasPermission === true && (
        <div className="w-full flex flex-col items-center">
          <div className="relative w-full aspect-square max-h-[340px] rounded-2xl overflow-hidden border border-slate-300 bg-slate-950 flex items-center justify-center shadow-inner">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Target Reticle Frame Kotak Pemindai */}
            <div className="absolute inset-10 border-2 border-emerald-500 rounded-xl pointer-events-none flex items-center justify-center">
              <span className="text-[11px] font-mono text-emerald-300 bg-slate-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                Align QR Code
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-3 text-center">
            Point camera directly at attendee QR ticket for instant validation.
          </p>
        </div>
      )}
    </div>
  );
}
export default CameraScanner;
