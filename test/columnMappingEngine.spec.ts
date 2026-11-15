import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const {
  scoreColumnRoles,
  scoreHeader,
  contentRatioOf,
  verifyColumnMappingReadiness,
  validateCellContent,
  getVerifiedIndex,
  pickParticipantFromRow,
  claimPendingSeeds,
  pruneExpiredPendingSeeds,
  normalizeHeaderString,
  MIN_SAMPLE_FOR_CONTRADICTION
} = require("../../ColumnMappingEngine.js");

describe("FormSync Column Mapping Engine v12", () => {
  it("MIN_SAMPLE_FOR_CONTRADICTION: 2 sampel dengan 1 email salah ketik tetap verified (tidak memblokir acara)", () => {
    const headers = ["Email"];
    // 2 sampel: 1 valid, 1 salah ketik (rasio 50%). Karena nonBlank (2) < 5, header tetap dipercaya!
    const sampleRows = [["peserta1@gmail.com"], ["bukan-email"]];
    const result = scoreColumnRoles(headers, sampleRows, {});
    expect(result.assignment.email.status).toBe("verified");
  });

  it("MIN_SAMPLE_FOR_CONTRADICTION: 8 sampel dengan 5 tidak valid menjadi needs_review", () => {
    const headers = ["Email"];
    // 8 sampel: 3 valid, 5 tidak valid (rasio 37.5%). nonBlank (8) >= 5 -> kontradiksi terdeteksi!
    const sampleRows = [
      ["peserta1@gmail.com"],
      ["bukan-email-1"],
      ["peserta2@gmail.com"],
      ["bukan-email-2"],
      ["bukan-email-3"],
      ["bukan-email-4"],
      ["bukan-email-5"],
      ["peserta3@gmail.com"]
    ];
    const result = scoreColumnRoles(headers, sampleRows, {});
    expect(result.assignment.email.status).toBe("needs_review");
    expect(result.dirty.length).toBe(0);
  });

  it("pickParticipantFromRow tidak pernah membocorkan email wali atau kewarganegaraan", () => {
    const rowValues = ["Budi Santoso", "WNI", "wali@gmail.com", "budi@gmail.com", "081234567890"];
    const resolvedRoles = {
      name: { index: 1, status: "verified" },
      email: { index: 4, status: "verified" },
      whatsapp: { index: 5, status: "verified" }
    };
    const namedValues = {
      "Kewarganegaraan": ["WNI"],
      "Email Wali": ["wali@gmail.com"]
    };
    const res = pickParticipantFromRow(rowValues, resolvedRoles, namedValues);
    expect(res.email).toBe("budi@gmail.com"); // Bukan wali@gmail.com!
    expect(res.whatsapp).toBe("081234567890"); // Bukan WNI!
    expect(res.nama).toBe("Budi Santoso");
  });

  it("claimPendingSeeds mengklaim seed berdasarkan linkedFormId tanpa menghapus sheet lain", () => {
    const pendingSeeds = {
      form_123: { roles: { name: { header: "Nama Lengkap" } } },
      form_456: { roles: { name: { header: "Nama Peserta" } } }
    };
    const res = claimPendingSeeds(pendingSeeds, "form_123");
    expect(res.claimed).toBeDefined();
    expect(res.claimed.name.header).toBe("Nama Lengkap");
    expect(res.remaining.form_123).toBeUndefined();
    expect(res.remaining.form_456).toBeDefined();
  });

  it("pruneExpiredPendingSeeds membersihkan seed yang lebih tua dari 30 hari", () => {
    const now = Date.now();
    const pendingSeeds = {
      oldForm: { roles: {}, createdAt: now - (35 * 24 * 60 * 60 * 1000) },
      newForm: { roles: {}, createdAt: now - (5 * 24 * 60 * 60 * 1000) }
    };
    const pruned = pruneExpiredPendingSeeds(pendingSeeds);
    expect(pruned.oldForm).toBeUndefined();
    expect(pruned.newForm).toBeDefined();
  });

  it("menolak actionType yang tidak dikenal pada verifyColumnMappingReadiness (fail-closed)", () => {
    const res = verifyColumnMappingReadiness({}, "e-mail");
    expect(res.ready).toBe(false);
    expect(res.errors[0]).toContain("Jenis aksi tidak dikenal: e-mail");
  });

  it("mendeteksi bentrok indeks ganda di seluruh role", () => {
    const assignments = {
      email: { index: 2, status: "verified" },
      name: { index: 2, status: "verified" }
    };
    const res = verifyColumnMappingReadiness(assignments, "email");
    expect(res.ready).toBe(false);
    expect(res.errors[0]).toContain("Konflik");
  });

  it("getVerifiedIndex hanya mengembalikan index untuk role yang verified", () => {
    const assignments = {
      email: { index: 3, status: "verified" },
      name: { index: 2, status: "needs_review" },
      whatsapp: { index: 4, status: "ambiguous" }
    };
    expect(getVerifiedIndex(assignments, "email")).toBe(3);
    expect(getVerifiedIndex(assignments, "name")).toBeNull();
    expect(getVerifiedIndex(assignments, "whatsapp")).toBeNull();
  });

  it("normalisasi cerdas mengenali tanda baca dan sinonim (E-mail, Surel, No. HP, No Telp)", () => {
    expect(normalizeHeaderString("No. HP")).toBe("no hp");
    expect(normalizeHeaderString("Instansi / Organisasi")).toBe("instansi organisasi");
    expect(normalizeHeaderString("E-mail")).toBe("e mail");

    const headers = ["Timestamp", "Nama Lengkap", "E-mail", "No. HP", "Instansi / Organisasi", "Invoice ID"];
    const result = scoreColumnRoles(headers, [], {});
    expect(result.assignment.email.index).toBe(3);
    expect(result.assignment.whatsapp.index).toBe(4);
    expect(result.assignment.organization.index).toBe(5);
  });

  it("sel placeholder (-, n/a, tidak ada) diabaikan sebagai data kosong di contentRatioOf", () => {
    const def = {
      contentValidator: (val: any) => /^08[0-9]{8,11}$/.test(String(val))
    };
    const sampleRows = [
      ["081234567890"],
      ["-"],
      ["n/a"],
      ["081234567891"],
      ["tidak ada"]
    ];
    const stats = contentRatioOf(def, sampleRows, 1);
    expect(stats.ratio).toBe(1.0);
    expect(stats.nonBlank).toBe(2);
  });

  it("header yang terkena penalti anti-pattern DILARANG mendapat bonus skor data", () => {
    const headers = ["Email Wali"];
    const sampleRows = [["wali@gmail.com"], ["wali2@gmail.com"]];
    const result = scoreColumnRoles(headers, sampleRows, {});
    expect(result.assignment.email).toBeUndefined();
  });

  it("skor seimbang antara Alamat Email dan Email Address tanpa seed menghasilkan ambiguous", () => {
    const headers = ["Alamat Email", "Email Address"];
    const result = scoreColumnRoles(headers, [], {});
    expect(result.assignment.email.status).toBe("ambiguous");
    expect(result.dirty.length).toBe(0);
  });

  it("auto-seed mengunci header yang tepat dan mengabaikan ambiguitas", () => {
    const headers = ["Alamat Email", "Email Address"];
    const saved = {
      email: { header: "Alamat Email", source: "auto_seed", status: "pending_index" }
    };
    const result = scoreColumnRoles(headers, [], saved);
    expect(result.assignment.email.index).toBe(1);
    expect(result.assignment.email.status).toBe("verified");
  });

  it("seed usang saat pertanyaan Form di-rename: tidak macet, menghasilkan status needs_review dan kandidat tersedia", () => {
    const headers = ["Timestamp", "Nama Lengkap", "Asal Sekolah"];
    const saved = {
      organization: { header: "Instansi", source: "auto_seed", status: "pending_index" }
    };
    const result = scoreColumnRoles(headers, [], saved);
    expect(result.assignment.organization).toBeDefined();
    expect(result.assignment.organization.index).toBe(3);
    expect(result.assignment.organization.status).toBe("needs_review");
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("post-pass menurunkan status mapping tersimpan non-manual jika isi datanya berganti menjadi bertentangan (sampel >= 5)", () => {
    const headers = ["Alamat Email"];
    const saved = {
      email: { index: 1, header: "Alamat Email", source: "heuristic", status: "verified" }
    };
    const sampleRows = [["Bukan Email"], ["12345"], ["Salah"], ["Gagal"], ["Error"]];
    const result = scoreColumnRoles(headers, sampleRows, saved);
    expect(result.assignment.email.status).toBe("needs_review");
    expect(result.dirty.length).toBe(0);
  });

  it("self-healing mapping manual: posisi tergeser masuk dirty dengan source manual", () => {
    const headers = ["Timestamp", "Nama Peserta", "Email"];
    const saved = {
      email: { index: 2, header: "Email", source: "manual", status: "verified" }
    };
    const result = scoreColumnRoles(headers, [], saved);
    expect(result.assignment.email.index).toBe(3);
    expect(result.assignment.email.source).toBe("manual");
    expect(result.dirty.some((d: any) => d.role === "email" && d.source === "manual" && d.index === 3)).toBe(true);
  });

  it("validator nomor WhatsApp seluler akurat (menolak telepon rumah atau format aneh)", () => {
    expect(validateCellContent("whatsapp", "081234567890")).toBe(true);
    expect(validateCellContent("whatsapp", "+6281234567890")).toBe(true);
    expect(validateCellContent("whatsapp", "6285709110466")).toBe(true);
    expect(validateCellContent("whatsapp", "0217654321")).toBe(false);
    expect(validateCellContent("whatsapp", "12345")).toBe(false);
  });

  it("kolom tanpa header berisi email valid lolos sebagai kandidat dengan skor 60", () => {
    const headers = [""];
    const sampleRows = [["user1@gmail.com"], ["user2@yahoo.com"], ["user3@corp.id"]];
    const result = scoreColumnRoles(headers, sampleRows, {});
    expect(result.assignment.email).toBeDefined();
    expect(result.assignment.email.index).toBe(1);
    expect(result.assignment.email.status).toBe("verified");
  });

  it("kolom tergeser ke index > lastCol tetap terdeteksi oleh Skenario C", () => {
    const headers = ["Nama", "Email"];
    const saved = {
      email: { index: 5, header: "Email", source: "manual", status: "verified" }
    };
    const result = scoreColumnRoles(headers, [], saved);
    expect(result.assignment.email.index).toBe(2);
    expect(result.assignment.email.source).toBe("manual");
  });
});
