import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("GateScannerView Checkpoint Table & Trash Icon Spec (/vitest-skill, /ui-ux-pro-max)", () => {
  const gateScannerPath = path.resolve(__dirname, "../src/scanner/GateScannerView.tsx");
  const gateScannerSource = fs.readFileSync(gateScannerPath, "utf-8");

  it("harus merender area checkpoints sebagai tabel data yang terstruktur", () => {
    expect(gateScannerSource).toContain("<table");
    expect(gateScannerSource).toContain("<thead");
    expect(gateScannerSource).toContain("<tbody");
    expect(gateScannerSource).toContain("overflow-x-auto");
  });

  it("harus memuat kolom-kolom tabel data resmi", () => {
    expect(gateScannerSource).toContain("Checkpoint Name");
    expect(gateScannerSource).toContain("Type");
    expect(gateScannerSource).toContain("Status");
    expect(gateScannerSource).toContain("Scanner");
    expect(gateScannerSource).toContain("Action");
  });

  it("harus menggunakan ikon tong sampah (Trash2) untuk aksi hapus dan bukan ikon silang (X)", () => {
    expect(gateScannerSource).toContain("Trash2");
    expect(gateScannerSource).toContain("title=\"Delete Checkpoint\"");
  });

  it("memiliki konfirmasi hapus aman (Delete dan Cancel)", () => {
    expect(gateScannerSource).toContain("Delete");
    expect(gateScannerSource).toContain("Cancel");
  });

  it("mematuhi aturan zero-forbidden-icons dan zero-emoticon", () => {
    expect(gateScannerSource).not.toMatch(/RefreshCw|RefreshCcw|RotateCw|RotateCcw/);
    expect(gateScannerSource).not.toMatch(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/u);
  });
});
