import { describe, it, expect } from "vitest";
import { generateAppsScriptCode } from "../src/bridge/googleAppsScriptBridge";

describe("Google Apps Script Bridge Generator", () => {
  const eventCode = "FS9K-7M2P";
  const securitySecret = "demo-security-secret-key";

  it("should generate complete Apps Script code with exact event code embedded", () => {
    const script = generateAppsScriptCode(eventCode, securitySecret);

    expect(script).toContain("FS9K-7M2P");
    expect(script).toContain("demo-security-secret-key");
    expect(script).toContain("function doGet(e)");
    expect(script).toContain("function doPost(e)");
  });

  it("should include security validation for incoming POST requests", () => {
    const script = generateAppsScriptCode(eventCode, securitySecret);

    expect(script).toContain("CONFIG.SECURITY_SECRET");
    expect(script).toContain("CONFIG.EVENT_CODE");
    expect(script).toContain("Invalid workspace security secret");
  });

  it("should parse spreadsheet rows properly and return JSON response", () => {
    const script = generateAppsScriptCode(eventCode, securitySecret);

    expect(script).toContain("ContentService.MimeType.JSON");
    expect(script).toContain("SpreadsheetApp.getActiveSpreadsheet()");
  });
});
