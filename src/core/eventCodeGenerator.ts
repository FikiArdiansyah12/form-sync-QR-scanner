/**
 * FormSync Attendance System - Event Code Generator & Normalizer
 * Menghasilkan dan memvalidasi kode acara 8-digit terformat XXXX-YYYY
 * menggunakan karakter alfanumerik bebas ambiguitas (tanpa 0, O, 1, I, L).
 */

/**
 * Karakter aman (32 karakter) selaras dengan Google Apps Script backend
 * (bebas dari angka 0, 1 dan huruf O, I untuk mencegah kerancuan visual).
 */
export const SAFE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Menghasilkan kode acara 8-digit acak dengan format standar XXXX-YYYY.
 * Contoh output: "FS9K-7M2P"
 *
 * @returns Kode acara 8 karakter terformat
 */
export function generate8DigitEventCode(): string {
  let raw = "";
  for (let i = 0; i < 8; i++) {
    const randomIdx = Math.floor(Math.random() * SAFE_ALPHABET.length);
    raw += SAFE_ALPHABET[randomIdx];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/**
 * Membersihkan dan menormalisasi input kode acara menjadi huruf kapital tanpa tanda baca.
 * Contoh: "fs9k-7m2p" -> "FS9K7M2P"
 *
 * @param input - String kode acara dari pengguna atau URL
 * @returns Kode alfanumerik kapital bersih 8 karakter
 */
export function normalizeEventCode(input: string): string {
  if (!input) return "";
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

/**
 * Memformat string kode mentah menjadi format bertanda hubung XXXX-YYYY.
 *
 * @param input - String kode acara
 * @returns Kode terformat XXXX-YYYY
 */
export function formatEventCodeWithHyphen(input: string): string {
  const clean = normalizeEventCode(input);
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

/**
 * Memvalidasi apakah kode acara memenuhi format 8 karakter alfanumerik.
 * Mendukung seluruh karakter A-Z dan 0-9 yang dihasilkan oleh backend Google Apps Script.
 *
 * @param code - Kode acara yang akan divalidasi
 * @returns True jika valid, false jika format tidak sesuai
 */
export function isValidEventCode(code: string): boolean {
  if (!code) return false;
  const clean = normalizeEventCode(code);
  if (clean.length !== 8) return false;

  return /^[A-Z0-9]{8}$/.test(clean);
}

/**
 * Alias untuk isValidEventCode untuk konsistensi penamaan validator.
 */
export const validateEventCodeFormat = isValidEventCode;

