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
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(code.length).toBe(9); // 8 chars + 1 hyphen
    expect(isValidEventCode(code)).toBe(true);
  });

  it("tidak boleh mengandung karakter ambigu (0, O, 1, I)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generate8DigitEventCode();
      expect(code).not.toMatch(/[01OIoi]/);
    }
  });

  it("harus menormalisasi kode huruf kecil dan tanda baca", () => {
    expect(normalizeEventCode("fs9k-7m2p")).toBe("FS9K7M2P");
    expect(normalizeEventCode("  fs9k 7m2p  ")).toBe("FS9K7M2P");
    expect(normalizeEventCode("q7vl-kt7y")).toBe("Q7VLKT7Y");
    expect(normalizeEventCode("")).toBe("");
  });

  it("harus memformat kode dengan tanda hubung secara rapi", () => {
    expect(formatEventCodeWithHyphen("FS9K7M2P")).toBe("FS9K-7M2P");
    expect(formatEventCodeWithHyphen("fs9k7m2p")).toBe("FS9K-7M2P");
    expect(formatEventCodeWithHyphen("Q7VLKT7Y")).toBe("Q7VL-KT7Y");
  });

  it("harus memvalidasi kode yang sah termasuk kode dengan huruf L dari spreadsheet (Q7VL-KT7Y)", () => {
    expect(isValidEventCode("FS9K-7M2P")).toBe(true);
    expect(isValidEventCode("FS9K7M2P")).toBe(true);
    expect(isValidEventCode("Q7VL-KT7Y")).toBe(true);
    expect(isValidEventCode("q7vl-kt7y")).toBe(true);
    expect(isValidEventCode("Q7VLKT7Y")).toBe(true);
    expect(isValidEventCode("SHORT")).toBe(false);
    expect(isValidEventCode("FS9K-7M2P-EXT")).toBe(false);
    expect(isValidEventCode("")).toBe(false);
  });
});
