/**
 * FormSync Attendance System - Google Apps Script Bridge Template
 * Script resmi untuk dipasang pada Google Sheets (Extensions -> Apps Script).
 * Mengizinkan sinkronisasi dua arah secara aman antara Google Sheets dan web formsync.my.id,
 * serta memunculkan menu resmi 'FormSync > Open Attendance Scanner' di Google Sheets.
 */

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `/**
 * FormSync - Google Sheets Attendance Webhook & Modal Bridge
 * Pasang skrip ini di Google Sheets: Extensions -> Apps Script
 * Lalu klik Deploy -> New Deployment -> Web app -> Anyone can access.
 */

const CONFIG = {
  // Kode acara 8-digit terisolasi Anda (misal: "{{EVENT_CODE}}")
  EVENT_CODE: "{{EVENT_CODE}}",
  // Token otorisasi workspace Anda
  SECURITY_SECRET: "{{SECURITY_SECRET}}",
  // URL Portal FormSync
  PORTAL_URL: "https://formsync.my.id",
  // Nama sheet/tab tempat data peserta berada
  SHEET_NAME: "Attendees",
  // Mapping kolom (indeks berbasis 1: A=1, B=2, dst.)
  COL_TICKET_CODE: 1, // Kolom A: Ticket Code (misal: {{EVENT_CODE}}:TKT-101)
  COL_NAME: 2,        // Kolom B: Nama Lengkap
  COL_ORG: 3,         // Kolom C: Organisasi / Instansi
  COL_EMAIL: 4,       // Kolom D: Email
  COL_PHONE: 5,       // Kolom E: Nomor Telepon / WA
  COL_STATUS: 6,      // Kolom F: Status Kehadiran (Pending / Present)
  COL_CHECKIN_TIME: 7,// Kolom G: Waktu Hadir (HH:MM:SS)
};

/**
 * Otomatis menambahkan menu 'FormSync' di Google Sheets saat file dibuka.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("FormSync")
    .addItem("Open Attendance Scanner", "openAttendanceScannerModal")
    .addItem("Open Web Portal (formsync.my.id)", "openPortalInNewTab")
    .addSeparator()
    .addItem("Sync Status with FormSync", "syncStatusSummary")
    .addToUi();
}

/**
 * Membuka Modal Dialog Scanner 1:1 langsung di atas antarmuka Google Sheets.
 */
function openAttendanceScannerModal() {
  const iframeUrl = CONFIG.PORTAL_URL + "/?event=" + encodeURIComponent(CONFIG.EVENT_CODE) + "&modal=true";
  const htmlContent = '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
      '<base target="_top">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<style>' +
        'body { margin: 0; padding: 0; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; }' +
        'iframe { width: 100%; height: 100vh; border: none; display: block; }' +
      '</style>' +
    '</head>' +
    '<body>' +
      '<iframe src="' + iframeUrl + '" allow="camera; microphone" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"></iframe>' +
    '</body>' +
    '</html>';

  const html = HtmlService.createHtmlOutput(htmlContent)
    .setWidth(500)
    .setHeight(650);

  SpreadsheetApp.getUi().showModalDialog(html, "FormSync — Attendance Scanner");
}

/**
 * Membuka halaman web portal FormSync di tab baru.
 */
function openPortalInNewTab() {
  const portalUrl = CONFIG.PORTAL_URL + "/?event=" + encodeURIComponent(CONFIG.EVENT_CODE);
  const html = HtmlService.createHtmlOutput(
    '<script>window.open("' + portalUrl + '", "_blank");google.script.host.close();</script>'
  ).setWidth(200).setHeight(50);
  SpreadsheetApp.getUi().showModalDialog(html, "Opening FormSync Portal...");
}

/**
 * Menampilkan ringkasan sinkronisasi kehadiran peserta saat ini.
 */
function syncStatusSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.getActiveSheet();
  const data = sheet.getDataRange().getValues();

  let total = 0;
  let present = 0;

  for (let i = 1; i < data.length; i++) {
    const ticket = String(data[i][CONFIG.COL_TICKET_CODE - 1] || "").trim();
    if (!ticket) continue;
    total++;
    const status = String(data[i][CONFIG.COL_STATUS - 1] || "").trim().toLowerCase();
    if (status === "present") present++;
  }

  const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
  SpreadsheetApp.getUi().alert(
    "FormSync Status Summary",
    "Event Code: " + CONFIG.EVENT_CODE + "\\n" +
    "Present: " + present + " / " + total + " (" + percentage + "%)\\n" +
    "Spreadsheet is in sync with FormSync.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Endpoint GET: Mengembalikan konfigurasi acara dan daftar peserta
 */
function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const reqEventCode = (params.event || "").trim().toUpperCase();

    // Verifikasi isolasi kode acara
    if (reqEventCode !== CONFIG.EVENT_CODE.replace(/-/g, "").toUpperCase() &&
        reqEventCode !== CONFIG.EVENT_CODE.toUpperCase()) {
      return respondJson({ success: false, error: "Unauthorized: Event code mismatch." });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.getActiveSheet();
    const data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      return respondJson({ success: true, eventCode: CONFIG.EVENT_CODE, attendees: [] });
    }

    const attendees = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const ticketCode = String(row[CONFIG.COL_TICKET_CODE - 1] || "").trim();
      const name = String(row[CONFIG.COL_NAME - 1] || "").trim();

      if (!ticketCode && !name) continue;

      attendees.push({
        id: "sheet-row-" + (i + 1),
        ticketCode: ticketCode,
        name: name,
        organization: String(row[CONFIG.COL_ORG - 1] || ""),
        email: String(row[CONFIG.COL_EMAIL - 1] || ""),
        phone: String(row[CONFIG.COL_PHONE - 1] || ""),
        status: String(row[CONFIG.COL_STATUS - 1] || "pending").toLowerCase() === "present" ? "present" : "pending",
        checkInTime: String(row[CONFIG.COL_CHECKIN_TIME - 1] || ""),
      });
    }

    return respondJson({
      success: true,
      eventCode: CONFIG.EVENT_CODE,
      attendees: attendees,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    return respondJson({ success: false, error: err.toString() });
  }
}

/**
 * Endpoint POST: Memperbarui status kehadiran peserta di Google Sheets secara real-time
 */
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents || "{}");
    const { eventCode, ticketCode, securitySecret, checkInTime, action } = postData;

    // 1. Verifikasi keamanan token workspace
    if (securitySecret !== CONFIG.SECURITY_SECRET) {
      return respondJson({ success: false, error: "Invalid workspace security secret." });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.getActiveSheet();
    const data = sheet.getDataRange().getValues();

    let foundRow = -1;
    let attendeeName = "";

    for (let i = 1; i < data.length; i++) {
      const rowTicket = String(data[i][CONFIG.COL_TICKET_CODE - 1] || "").trim().toLowerCase();
      const targetTicket = String(ticketCode || "").trim().toLowerCase();

      // Cocokkan tiket dengan atau tanpa prefix event
      if (rowTicket === targetTicket || rowTicket.endsWith(":" + targetTicket)) {
        foundRow = i + 1;
        attendeeName = data[i][CONFIG.COL_NAME - 1];
        break;
      }
    }

    if (foundRow === -1) {
      return respondJson({ success: false, error: "Ticket not found in spreadsheet." });
    }

    // 2. Aksi Revert vs Present
    if (action === "revert") {
      sheet.getRange(foundRow, CONFIG.COL_STATUS).setValue("Pending");
      sheet.getRange(foundRow, CONFIG.COL_CHECKIN_TIME).setValue("");
      return respondJson({
        success: true,
        message: "Check-in reverted for " + attendeeName,
        name: attendeeName,
        status: "pending"
      });
    }

    // Tuliskan status 'Present' dan jam check-in ke sheet
    const timeFormatted = checkInTime || Utilities.formatDate(new Date(), "Asia/Jakarta", "HH:mm:ss");
    sheet.getRange(foundRow, CONFIG.COL_STATUS).setValue("Present");
    sheet.getRange(foundRow, CONFIG.COL_CHECKIN_TIME).setValue(timeFormatted);

    return respondJson({
      success: true,
      message: "Check-in recorded successfully for " + attendeeName,
      name: attendeeName,
      checkInTime: timeFormatted,
      status: "present"
    });
  } catch (err) {
    return respondJson({ success: false, error: err.toString() });
  }
}

function respondJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

/**
 * Menghasilkan kode Google Apps Script dengan eventCode dan securitySecret yang sudah terisi.
 */
export function generateAppsScriptCode(eventCode: string, securitySecret: string): string {
  return GOOGLE_APPS_SCRIPT_TEMPLATE
    .replace(/\{\{EVENT_CODE\}\}/g, eventCode)
    .replace(/\{\{SECURITY_SECRET\}\}/g, securitySecret);
}
