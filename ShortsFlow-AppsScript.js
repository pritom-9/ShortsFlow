// ============================================================
// SHORTSFLOW — Google Apps Script Backend v5
// ============================================================
// INSTALL:
// 1. Google Sheet → Extensions → Apps Script
// 2. Delete all code → paste this → Save (Ctrl+S)
// 3. Select setupExtraColumns → click ▶ Run → authorize
// 4. Deploy → New Deployment → Web App
//    Execute as: Me | Who has access: Anyone
// 5. Copy Web App URL → paste into ShortsFlow
// 6. Triggers → Add Trigger → onEdit → On edit
// ============================================================

const SHEET_NAME     = "Sheet1"; // ← change to match your tab name exactly
const DATA_START_ROW = 11;       // your data starts at row 11

const COL = {
  SHORT_NO:    1,   // A
  TEAM_NAME:   2,   // B
  HOOK_SEO:    3,   // C
  CREATIVE:    4,   // D
  READY:       5,   // E  ← checkbox
  VPS_COMMENT: 6,   // F
  SPACER:      7,   // G
  INTERNAL:    8,   // H
  STATUS:      9,   // I  auto-managed
  ASSIGNED_TO: 10,  // J  auto-managed
  CLAIMED_AT:  11,  // K  auto-managed
};

// ── JSONP response (works from local file and Google Drive) ────
function jsonpResponse(data, callback) {
  var json = JSON.stringify(data);
  var output;
  if (callback) {
    output = ContentService
      .createTextOutput(callback + "(" + json + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    output = ContentService
      .createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  }
  return output;
}

// ── GET — handles ALL actions ──────────────────────────────────
function doGet(e) {
  var callback = e.parameter.callback || null;
  try {
    var action = e.parameter.action || "";
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (action === "ping") {
      return jsonpResponse({ ok: true, message: "Connected!" }, callback);
    }

    if (!sheet) {
      return jsonpResponse({ error: 'Sheet tab "' + SHEET_NAME + '" not found. Update SHEET_NAME in the script.' }, callback);
    }

    // ── getShorts ──────────────────────────────────────────────
    if (action === "getShorts") {
      var lastRow = sheet.getLastRow();
      if (lastRow < DATA_START_ROW) return jsonpResponse({ shorts: [] }, callback);
      var numRows = lastRow - DATA_START_ROW + 1;
      var data = sheet.getRange(DATA_START_ROW, 1, numRows, 11).getValues();
      var shorts = [];
      for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var shortNo    = row[COL.SHORT_NO - 1];
        var teamName   = row[COL.TEAM_NAME - 1];
        var hookSeo    = row[COL.HOOK_SEO - 1];
        var creative   = row[COL.CREATIVE - 1];
        var isReady    = row[COL.READY - 1] === true;
        var vpsComment = row[COL.VPS_COMMENT - 1];
        var internal   = row[COL.INTERNAL - 1];
        var status     = row[COL.STATUS - 1] || "";
        var assignedTo = row[COL.ASSIGNED_TO - 1] || "";
        var claimedAt  = row[COL.CLAIMED_AT - 1];
        var actualRow  = DATA_START_ROW + i;
        if (!shortNo && !hookSeo) continue;
        if (isReady && !status) {
          sheet.getRange(actualRow, COL.STATUS).setValue("Available");
          status = "Available";
        }
        shorts.push({
          id:          String(shortNo).replace(/\s+/g,"").toLowerCase(),
          shortNo:     String(shortNo),
          teamName:    String(teamName || ""),
          hookSeo:     String(hookSeo || ""),
          creative:    String(creative || ""),
          vpsComment:  String(vpsComment || ""),
          internal:    String(internal || ""),
          ready:       isReady,
          status:      status || "Available",
          assignedTo:  String(assignedTo),
          createdAt:   claimedAt ? new Date(claimedAt).toISOString() : new Date().toISOString(),
          rowIndex:    actualRow,
        });
      }
      return jsonpResponse({ shorts: shorts }, callback);
    }

    // ── claimShort ─────────────────────────────────────────────
    if (action === "claimShort") {
      var rowIndex   = parseInt(e.parameter.rowIndex);
      var editorName = e.parameter.editorName;
      if (!rowIndex || !editorName) return jsonpResponse({ error: "Missing rowIndex or editorName." }, callback);
      var cur = sheet.getRange(rowIndex, COL.STATUS).getValue();
      if (cur === "In Progress" || cur === "Done") return jsonpResponse({ error: "Already claimed. Please refresh." }, callback);
      sheet.getRange(rowIndex, COL.STATUS).setValue("In Progress");
      sheet.getRange(rowIndex, COL.ASSIGNED_TO).setValue(editorName);
      sheet.getRange(rowIndex, COL.CLAIMED_AT).setValue(new Date());
      return jsonpResponse({ success: true }, callback);
    }

    // ── markDone ───────────────────────────────────────────────
    if (action === "markDone") {
      var rowIndex = parseInt(e.parameter.rowIndex);
      if (!rowIndex) return jsonpResponse({ error: "Missing rowIndex." }, callback);
      sheet.getRange(rowIndex, COL.STATUS).setValue("Done");
      return jsonpResponse({ success: true }, callback);
    }

    // ── addShort (Creative Manager adds from web app) ──────────
    if (action === "addShort") {
      var newRow = sheet.getLastRow() + 1;
      var readyVal = e.parameter.ready === "TRUE";
      sheet.getRange(newRow, COL.SHORT_NO).setValue(e.parameter.shortNo || "SHORT NO." + (newRow - DATA_START_ROW + 1));
      sheet.getRange(newRow, COL.TEAM_NAME).setValue(e.parameter.teamName || "");
      sheet.getRange(newRow, COL.HOOK_SEO).setValue(e.parameter.hookSeo || "");
      sheet.getRange(newRow, COL.CREATIVE).setValue(e.parameter.creative || "");
      sheet.getRange(newRow, COL.READY).setValue(readyVal);
      sheet.getRange(newRow, COL.VPS_COMMENT).setValue(e.parameter.vpsComment || "");
      sheet.getRange(newRow, COL.INTERNAL).setValue(e.parameter.internal || "");
      if (readyVal) sheet.getRange(newRow, COL.STATUS).setValue("Available");
      return jsonpResponse({ success: true, rowIndex: newRow }, callback);
    }

    // ── updateShort (Creative Manager edits from web app) ──────
    if (action === "updateShort") {
      var rowIndex = parseInt(e.parameter.rowIndex);
      if (!rowIndex) return jsonpResponse({ error: "Missing rowIndex." }, callback);
      var readyVal = e.parameter.ready === "TRUE";
      sheet.getRange(rowIndex, COL.SHORT_NO).setValue(e.parameter.shortNo || "");
      sheet.getRange(rowIndex, COL.TEAM_NAME).setValue(e.parameter.teamName || "");
      sheet.getRange(rowIndex, COL.HOOK_SEO).setValue(e.parameter.hookSeo || "");
      sheet.getRange(rowIndex, COL.CREATIVE).setValue(e.parameter.creative || "");
      sheet.getRange(rowIndex, COL.READY).setValue(readyVal);
      sheet.getRange(rowIndex, COL.VPS_COMMENT).setValue(e.parameter.vpsComment || "");
      sheet.getRange(rowIndex, COL.INTERNAL).setValue(e.parameter.internal || "");
      var curStatus = sheet.getRange(rowIndex, COL.STATUS).getValue();
      if (readyVal && !curStatus) sheet.getRange(rowIndex, COL.STATUS).setValue("Available");
      if (!readyVal && curStatus === "Available") sheet.getRange(rowIndex, COL.STATUS).setValue("");
      return jsonpResponse({ success: true }, callback);
    }

    // ── setReady (toggle ready checkbox from web app) ──────────
    if (action === "setReady") {
      var rowIndex = parseInt(e.parameter.rowIndex);
      var readyVal = e.parameter.ready === "TRUE";
      if (!rowIndex) return jsonpResponse({ error: "Missing rowIndex." }, callback);
      sheet.getRange(rowIndex, COL.READY).setValue(readyVal);
      var curStatus = sheet.getRange(rowIndex, COL.STATUS).getValue();
      if (readyVal && !curStatus) sheet.getRange(rowIndex, COL.STATUS).setValue("Available");
      if (!readyVal && curStatus === "Available") sheet.getRange(rowIndex, COL.STATUS).setValue("");
      return jsonpResponse({ success: true }, callback);
    }

    return jsonpResponse({ error: 'Unknown action: "' + action + '"' }, callback);

  } catch (err) {
    return jsonpResponse({ error: "Script error: " + err.message }, callback);
  }
}

// ── onEdit trigger ─────────────────────────────────────────────
function onEdit(e) {
  try {
    var sheet     = e.range.getSheet();
    var editedRow = e.range.getRow();
    var editedCol = e.range.getColumn();
    if (sheet.getName() !== SHEET_NAME) return;
    if (editedRow < DATA_START_ROW) return;

    // Auto-fill SHORT NO. when Team Name is typed
    if (editedCol === COL.TEAM_NAME) {
      var idCell = sheet.getRange(editedRow, COL.SHORT_NO);
      if (!idCell.getValue()) {
        var existingIds = sheet
          .getRange(DATA_START_ROW, COL.SHORT_NO, editedRow - DATA_START_ROW + 1, 1)
          .getValues().flat()
          .filter(function(v) { return v !== ""; });
        idCell.setValue("SHORT NO." + existingIds.length);
      }
    }
    // Auto-set Status when READY is ticked
    if (editedCol === COL.READY && e.value === "TRUE") {
      var statusCell = sheet.getRange(editedRow, COL.STATUS);
      if (!statusCell.getValue()) statusCell.setValue("Available");
    }
    if (editedCol === COL.READY && e.value === "FALSE") {
      var statusCell = sheet.getRange(editedRow, COL.STATUS);
      if (statusCell.getValue() === "Available") statusCell.setValue("");
    }
  } catch (err) {
    console.log("onEdit error: " + err.message);
  }
}

// ── Run once after install ─────────────────────────────────────
function setupExtraColumns() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { SpreadsheetApp.getUi().alert('Sheet "' + SHEET_NAME + '" not found!'); return; }
  var h = DATA_START_ROW - 1;
  sheet.getRange(h, COL.STATUS).setValue("Status").setFontWeight("bold").setBackground("#404040").setFontColor("#FFFFFF");
  sheet.getRange(h, COL.ASSIGNED_TO).setValue("Assigned To").setFontWeight("bold").setBackground("#404040").setFontColor("#FFFFFF");
  sheet.getRange(h, COL.CLAIMED_AT).setValue("Claimed At").setFontWeight("bold").setBackground("#404040").setFontColor("#FFFFFF");
  sheet.setColumnWidth(COL.STATUS, 120);
  sheet.setColumnWidth(COL.ASSIGNED_TO, 130);
  sheet.setColumnWidth(COL.CLAIMED_AT, 150);
  SpreadsheetApp.getUi().alert("✅ Setup complete! Columns I, J, K are ready.");
}
