import { describe, it, expect } from "vitest";
import {
  generate8DigitEventCode,
  normalizeEventCode,
  formatEventCodeWithHyphen,
  isValidEventCode,
  SAFE_ALPHABET,
} from "../src/core/eventCodeGenerator";

describe("eventCodeGenerator", () => {
  it("harus menghasilkan kode 8 karakter dengan format XXXX-YYYY", () => {
    const code = generate8DigitEventCode();
    expect(code).toMatch(/^[2-9A-HJ-KM-NP-Z]{4}-[2-9A-HJ-KM-NP-Z]{4}$/);
    expect(code.length).toBe(9); // 8 chars + 1 hyphen
  });

  it("tidak boleh mengandung karakter ambigu (0, O, 1, I, L)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generate8DigitEventCode();
      expect(code).not.toMatch(/[01OILoil]/);
    }
  });

  it("harus menormalisasi kode huruf kecil dan tanda baca", () => {
    expect(normalizeEventCode("fs9k-7m2p")).toBe("FS9K7M2P");
    expect(normalizeEventCode("  fs9k 7m2p  ")).toBe("FS9K7M2P");
    expect(normalizeEventCode("")).toBe("");
  });

  it("harus memformat kode dengan tanda hubung secara rapi", () => {
    expect(formatEventCodeWithHyphen("FS9K7M2P")).toBe("FS9K-7M2P");
    expect(formatEventCodeWithHyphen("fs9k7m2p")).toBe("FS9K-7M2P");
  });

  it("harus memvalidasi kode yang sah dan menolak karakter salah", () => {
    expect(isValidEventCode("FS9K-7M2P")).toBe(true);
    expect(isValidEventCode("FS9K7M2P")).toBe(true);
    expect(isValidEventCode("SHORT")).toBe(false);
    expect(isValidEventCode("FS9K-7M2P-EXT")).toBe(false);
    expect(isValidEventCode("FS90-7M1P")).toBe(false); // Mengandung 0 dan 1
  });
});
