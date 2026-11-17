import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("CameraScanner WebRTC Lifecycle & DOM Stability Spec (/vitest-skill)", () => {
  const cameraScannerPath = path.resolve(__dirname, "../src/scanner/CameraScanner.tsx");
  const cameraScannerSource = fs.readFileSync(cameraScannerPath, "utf-8");

  it("elemen video harus selalu terpasang di DOM atau memiliki reaktif stream attachment hook", () => {
    // Memastikan ada reactive stream attacher atau video tetap di-render
    const hasReactiveStreamHook = /videoRef\.current\.srcObject\s*=\s*streamRef\.current/.test(cameraScannerSource) ||
                                  /\[\s*hasPermission\s*\]/.test(cameraScannerSource);
    expect(hasReactiveStreamHook).toBe(true);
  });

  it("elemen video wajib memiliki atribut autoPlay, playsInline, dan muted", () => {
    expect(cameraScannerSource).toMatch(/autoPlay/);
    expect(cameraScannerSource).toMatch(/playsInline/);
    expect(cameraScannerSource).toMatch(/muted/);
  });

  it("media constraints wajib menggunakan ideal facingMode untuk kompatibilitas smartphone & laptop", () => {
    // Harus menggunakan { ideal: "environment" } bukan string kaku "environment"
    expect(cameraScannerSource).toMatch(/facingMode:\s*\{\s*ideal:\s*["']environment["']\s*\}/);
  });

  it("tetap mematuhi aturan tanpa emoticon dan tanpa icon circular reload", () => {
    expect(cameraScannerSource).not.toMatch(/RefreshCw|RefreshCcw|RotateCw|RotateCcw/);
    expect(cameraScannerSource).not.toMatch(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/u);
  });

  it("mempertahankan teks UI 1:1 persis spesifikasi resmi", () => {
    expect(cameraScannerSource).toContain("Camera Permission Required");
    expect(cameraScannerSource).toContain("Try Camera Again");
    expect(cameraScannerSource).toContain("Switch to Manual Search");
    expect(cameraScannerSource).toContain("Align QR Code");
    expect(cameraScannerSource).toContain("Point camera directly at attendee QR ticket for instant validation.");
  });
});
