var BASE_SITE_URL = "https://isabelxviii.pages.dev";

var ENTOURAGE_DATA = {
  "🌹 18 ROSES": [
    "Helmar Returan",
    "Lenmar Returan",
    "Martin Returan Jr.",
    "Julius Salazar",
    "Gabriel Cainglet",
    "Romar Returan",
    "Charles Emmanuel Soloriano",
    "Kyle Urbanozo",
    "Wacky Loumar Solomon",
    "Sandy Carl Templo",
    "Philip Abdon",
    "Kelly Abdon",
    "Jeros Andre Salazar",
    "Andrew Trovillas",
    "Leo Trovillas",
    "Loccio Miguel Trovillas",
    "Jemar Gabriel Trovillas",
    "Jerry Trovillas",
  ],
  "🕯️ 18 CANDLES": [
    "Sharon Templo",
    "Sol Maigue",
    "Ma. Carmen Regala",
    "Nariza B. Zayco",
    "Mary Mar Returan",
    "Lara Española",
    "Cris Joy Sencil",
    "Ghian Reign Siason",
    "Zendy Shar Templo",
    "Stiffany Dyann Templo",
    "Ashleigh Gwyneth Rodriguez",
    "Kenichi Metchell Gaudia",
    "Alyzza Faith Mojana",
    "Luxlyn Lei Badajos",
    "Johnezza Veronic Tolentino",
    "Marvi Aiah Solomon",
    "Nicole Grace Recaido",
    "Jamila Kate Degala",
  ],
  "💎 18 TREASURES": [
    "Michelle Dela Paz",
    "Ma. Roxanne Eniceno",
    "Judelyn Solidarios",
    "Dabe Maravilla",
    "Suelin Villanueva",
    "Reynalyn Estoquia",
    "Kate Andrea Salazar",
    "Diana Elizabeth Elarmo",
    "Rona Returan",
    "Arlene Trovillas",
    "Diosa Trovillas",
    "Melmia Cyann Noguid",
    "Bing Campo",
    "Anabrenda Gierza",
    "Evelyn Gerongani",
    "Danilo Bacolod",
    "JV Esoy",
    "Lee Villaflor",
  ],
  "💙 18 BLUE BILLS": [
    "Roselle Returan",
    "Angel Baluran",
    "Aurelio Baluran Jr.",
    "Noel Mospa",
    "Andrew Gallego",
    "Leo Gallego",
    "Lenev Sorrosa",
    "Ma. Socorro Veloso",
    "Josephine Angolo",
    "Freda Recaido",
    "Lou Martha Solomon",
    "Jennifer Gallego",
    "Jessa Gallego",
    "Cherry Mae Millan",
    "Marjolan Returan",
    "Amalia Dioman",
    "Brenda Talaman",
    "Terrence Granada",
  ],
  "✨ HONORED GUESTS": ["Honored Guest"],
};

function toHyphenatedSlug_(text) {
  return String(text == null ? "" : text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-");
}

function isFuzzyMatch_(str1, str2) {
  str1 = String(str1 == null ? "" : str1);
  str2 = String(str2 == null ? "" : str2);
  if (Math.abs(str1.length - str2.length) > 2) return false;
  let diff = 0,
    i = 0,
    j = 0;
  while (i < str1.length && j < str2.length) {
    if (str1[i] !== str2[j]) {
      diff++;
      if (diff > 2) return false;
      if (str1.length > str2.length) i++;
      else if (str2.length > str1.length) j++;
      else {
        i++;
        j++;
      }
    } else {
      i++;
      j++;
    }
  }
  diff += str1.length - i + (str2.length - j);
  return diff <= 2;
}

// 🚀 RUN THIS FUNCTION ONCE IN APPS SCRIPT TO PRE-POPULATE CLEAN LAYOUT
function setupGuestList() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.clear();

  // 1. Primary Header Row
  sheet.appendRow([
    "Guest Name",
    "Entourage Role",
    "Personal Invitation Link",
    "Splash Invitation Opened",
    "RSVP Attendance",
    "Personal Message",
    "Last Updated",
  ]);

  sheet
    .getRange(1, 1, 1, 7)
    .setFontWeight("bold")
    .setBackground("#0B132B")
    .setFontColor("#EECE5A")
    .setFontSize(11)
    .setHorizontalAlignment("center");

  sheet.setRowHeight(1, 35);

  // 2. Pre-populate all 5 categories with separators & guest rows below them
  for (var category in ENTOURAGE_DATA) {
    var categoryName = category;
    var guests = ENTOURAGE_DATA[category];
    var cleanRole = categoryName.replace(/[^\w\s]/gi, "").trim();

    // Section Category Separator Row (Navy background)
    sheet.appendRow([categoryName, "", "", "", "", "", ""]);
    var lastRow = sheet.getLastRow();

    sheet
      .getRange(lastRow, 1, 1, 7)
      .setFontWeight("bold")
      .setBackground("#1A2647")
      .setFontColor("#FFF5D6")
      .setFontSize(11);

    // Guest Rows BELOW section header
    for (var i = 0; i < guests.length; i++) {
      var guestName = guests[i];
      var slug = toHyphenatedSlug_(guestName);
      var link =
        guestName === "Honored Guest"
          ? BASE_SITE_URL
          : BASE_SITE_URL + "/" + slug;

      sheet.appendRow([
        guestName,
        cleanRole,
        link,
        "No",
        "Pending RSVP",
        "",
        "",
      ]);
    }
  }

  sheet.setColumnWidth(1, 240); // Guest Name
  sheet.setColumnWidth(2, 160); // Entourage Role
  sheet.setColumnWidth(3, 380); // Personal Link
  sheet.setColumnWidth(4, 180); // Splash Opened
  sheet.setColumnWidth(5, 180); // RSVP Attendance
  sheet.setColumnWidth(6, 320); // Message
  sheet.setColumnWidth(7, 180); // Last Updated

  sheet.setFrozenRows(1);
}

// RUN THIS ONCE AFTER REPLACING AN EXISTING ROSTER.
// It rebuilds the category rows from ENTOURAGE_DATA while preserving Columns D-G
// (opened status, RSVP, message, and timestamp) for guests who remain on the list.
function syncGuestListPreservingResponses() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  var preservedRows = [];

  if (lastRow > 1) {
    var existingRows = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    for (var i = 0; i < existingRows.length; i++) {
      var existingName = String(existingRows[i][0]).trim();
      var existingRole = String(existingRows[i][1]).trim();
      if (!existingName || !existingRole) continue; // Skip category separators.

      preservedRows.push({
        key: normalizeGuestKey_(existingName),
        name: existingName,
        role: existingRole,
        values: existingRows[i],
        restored: false,
      });
    }
  }

  setupGuestList();

  var rebuiltLastRow = sheet.getLastRow();
  var rebuiltRows = sheet.getRange(2, 1, rebuiltLastRow - 1, 2).getValues();
  var renamedGuests = {
    michelledelapaz: "michelledlapaz",
  };

  for (var rowOffset = 0; rowOffset < rebuiltRows.length; rowOffset++) {
    var rebuiltName = String(rebuiltRows[rowOffset][0]).trim();
    var rebuiltRole = String(rebuiltRows[rowOffset][1]).trim();
    if (!rebuiltName || !rebuiltRole) continue;

    var rebuiltKey = normalizeGuestKey_(rebuiltName);
    var previousKey = renamedGuests[rebuiltKey] || rebuiltKey;

    for (var recordIdx = 0; recordIdx < preservedRows.length; recordIdx++) {
      var record = preservedRows[recordIdx];
      if (record.restored || record.key !== previousKey) continue;

      sheet
        .getRange(rowOffset + 2, 4, 1, 4)
        .setValues([[record.values[3], record.values[4], record.values[5], record.values[6]]]);
      record.restored = true;
      break;
    }
  }

  // Restore custom honored guests that are not part of the canonical entourage.
  var honoredHeaderRow = findHonoredHeaderRow_(sheet);
  var insertAfterRow = honoredHeaderRow;
  for (var customIdx = 0; customIdx < preservedRows.length; customIdx++) {
    var customRecord = preservedRows[customIdx];
    if (
      customRecord.restored ||
      customRecord.role.toUpperCase().indexOf("HONORED GUEST") === -1 ||
      insertAfterRow < 1
    ) continue;

    sheet.insertRowAfter(insertAfterRow);
    insertAfterRow++;
    sheet.getRange(insertAfterRow, 1, 1, 7).setValues([customRecord.values]);
  }
}

function normalizeGuestKey_(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function findHonoredHeaderRow_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var values = sheet.getRange(1, 1, lastRow, 2).getValues();
  for (var i = 0; i < values.length; i++) {
    if (
      String(values[i][0]).indexOf("HONORED GUESTS") !== -1 &&
      String(values[i][1]).trim() === ""
    ) return i + 1;
  }
  return -1;
}

// POST HANDLER - UPDATES GUEST ROWS BELOW HEADERS & INSERTS NEW HONORED GUESTS UNDER THE HONORED HEADER
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var lastRow = sheet.getLastRow();

    if (lastRow === 0) {
      setupGuestList();
      lastRow = sheet.getLastRow();
    }

    var data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      data = e.parameter;
    }

    var timestamp = new Date();
    var guestName = (data.guestName || "Honored Guest").trim();
    var action = data.action || "rsvp_submit";
    var role = data.role || "Honored Guest";
    var message = data.message || "";
    var rsvpAttendance =
      action === "accept_splash"
        ? "Pending RSVP"
        : data.attendance || "Joyfully Accept";

    // Search for guest row in Column A (Guest Name)
    var foundRow = -1;
    var honoredHeaderRow = -1;

    if (lastRow > 1) {
      var rowsData = sheet.getRange(1, 1, lastRow, 2).getValues();
      var compactInput = guestName.toLowerCase().replace(/[^a-z0-9]/g, "");

      for (var i = 0; i < rowsData.length; i++) {
        var colA = String(rowsData[i][0]).trim();
        var colB = String(rowsData[i][1]).trim();

        // Track the row of the "✨ HONORED GUESTS" separator header
        if (colA.indexOf("HONORED GUESTS") !== -1 && colB === "") {
          honoredHeaderRow = i + 1;
          continue; // Skip header row!
        }

        // Skip searching any separator header row (Column B is empty)
        if (colB === "") continue;

        var compactExisting = colA.toLowerCase().replace(/[^a-z0-9]/g, "");

        if (
          compactExisting &&
          (compactExisting === compactInput ||
            isFuzzyMatch_(compactExisting, compactInput))
        ) {
          foundRow = i + 1;
          break;
        }
      }
    }

    if (foundRow > 1) {
      // UPDATE MATCHED GUEST ROW IN-PLACE BELOW HEADER
      sheet.getRange(foundRow, 4).setValue("Yes"); // Column 4: Splash Opened

      if (action === "rsvp_submit") {
        sheet.getRange(foundRow, 5).setValue(rsvpAttendance); // Column 5: RSVP Attendance
        sheet.getRange(foundRow, 6).setValue(message); // Column 6: Message
      } else {
        var currentAtt = sheet.getRange(foundRow, 5).getValue();
        if (!currentAtt || currentAtt === "Pending" || currentAtt === "No") {
          sheet.getRange(foundRow, 5).setValue("Pending RSVP");
        }
      }

      sheet.getRange(foundRow, 7).setValue(timestamp); // Column 7: Last Updated
      if (role && role !== "Honored Guest") {
        sheet.getRange(foundRow, 2).setValue(role);
      }
    } else {
      // INSERT NEW CUSTOM GUEST ROW BELOW THE ✨ HONORED GUESTS HEADER
      var slug = toHyphenatedSlug_(guestName);
      var link = BASE_SITE_URL + "/" + slug;
      var newRowIdx =
        honoredHeaderRow > 1 ? honoredHeaderRow + 1 : sheet.getLastRow() + 1;

      if (honoredHeaderRow > 1) {
        sheet.insertRowAfter(honoredHeaderRow);
      }

      sheet
        .getRange(newRowIdx, 1, 1, 7)
        .setValues([
          [guestName, role, link, "Yes", rsvpAttendance, message, timestamp],
        ]);

      // Clear header styling for inserted guest row
      sheet
        .getRange(newRowIdx, 1, 1, 7)
        .setFontWeight("normal")
        .setBackground(null)
        .setFontColor("#000000")
        .setFontSize(10);

      foundRow = newRowIdx;
    }

    return ContentService.createTextOutput(
      JSON.stringify({ result: "success", name: guestName, row: foundRow }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ result: "error", error: error.toString() }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
