import { describe, it, expect } from "vitest";
import { generateAppsScriptCode } from "../src/bridge/googleAppsScriptBridge";
import fs from "fs";
import path from "path";

describe("FormSync - Attendance Scanner Modal & Dialog Spec", () => {
  it("harus menghasilkan kode Google Apps Script dengan fungsi onOpen dan openAttendanceScannerModal", () => {
    const code = generateAppsScriptCode("FS9K-7M2P", "SECRET_123");
    expect(code).toContain("function onOpen()");
    expect(code).toContain("function openAttendanceScannerModal()");
    expect(code).toContain("Open Attendance Scanner");
    expect(code).toContain("SpreadsheetApp.getUi().showModalDialog");
    expect(code).toContain("FS9K-7M2P");
    expect(code).toContain("SECRET_123");
  });

  it("AttendanceScannerModal dan CameraScanner harus memuat copy teks 1:1 persis screenshot resmi", () => {
    const modalPath = path.resolve(__dirname, "../src/scanner/AttendanceScannerModal.tsx");
    const cameraPath = path.resolve(__dirname, "../src/scanner/CameraScanner.tsx");

    const modalContent = fs.readFileSync(modalPath, "utf-8");
    const cameraContent = fs.readFileSync(cameraPath, "utf-8");

    // Verifikasi judul modal dan subjudul
    expect(modalContent).toContain("FormSync — Attendance Scanner");
    expect(modalContent).toContain("FormSync Scanner");
    expect(modalContent).toContain("Event Attendance Validation");

    // Verifikasi teks instruksi dan tombol di tab Camera Scanner
    expect(cameraContent).toContain("Camera Permission Required");
    expect(cameraContent).toContain(
      "To scan QR tickets, allow browser camera permissions, or use Manual Search to check in attendees instantly."
    );
    expect(cameraContent).toContain("Try Camera Again");
    expect(cameraContent).toContain("Switch to Manual Search");
  });

  it("harus mematuhi Zero-Dot Policy (tidak ada bullet dot • pada status badge)", () => {
    const modalPath = path.resolve(__dirname, "../src/scanner/AttendanceScannerModal.tsx");
    const modalContent = fs.readFileSync(modalPath, "utf-8");

    // Dilarang ada karakter bullet dot '•'
    expect(modalContent).not.toContain("•");
  });

  it("harus mematuhi Zero-Forbidden-Icons (tidak ada icon reload / panah melingkar)", () => {
    const scannerDir = path.resolve(__dirname, "../src/scanner");
    const files = fs.readdirSync(scannerDir);

    for (const file of files) {
      if (!file.endsWith(".tsx") && !file.endsWith(".ts")) continue;
      const content = fs.readFileSync(path.join(scannerDir, file), "utf-8");
      expect(content).not.toMatch(/RefreshCw|RefreshCcw|RotateCw|RotateCcw/);
    }
  });
});
