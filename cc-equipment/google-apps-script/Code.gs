/**
 * C&C Equipment — Google Apps Script backend
 *
 * Deploy this script as a Web App bound to a Google Sheet. The script
 * stores all inventory, expenses, sales, categories, and settings inside
 * the bound spreadsheet. Photos are uploaded to a Drive folder named
 * "C&C Equipment Photos" (auto-created), and the public URL is stored
 * with the inventory row.
 *
 * Sheet tabs expected (auto-created on first run):
 *   Inventory, Categories, Expenses, Sales, Settings
 *
 * Web app entry points:
 *   doGet()  -> serves Index.html (with Stylesheet.html and JavaScript.html includes)
 *   API functions invoked from client via google.script.run:
 *     getAllData()
 *     saveItem(item), deleteItem(id)
 *     saveExpense(expense), deleteExpense(id)
 *     markSold(saleData), undoSale(itemId)
 *     addCategory(name), deleteCategory(id)
 *     uploadPhoto(base64, filename) -> returns public URL
 *     exportInventoryCsv() / exportProfitLossCsv() -> returns CSV string
 *
 * Setup: see SETUP.md in this folder.
 */

// ===== Configuration ========================================================
var SHEETS = {
  INVENTORY:  'Inventory',
  CATEGORIES: 'Categories',
  EXPENSES:   'Expenses',
  SALES:      'Sales',
  SETTINGS:   'Settings'
};

var STARTING_CATEGORIES = ['Power Equipment', 'Implements', 'Misc. Equipment', 'Farm Equipment'];

var COLS = {
  INVENTORY:  ['Item ID','Item Name','Category','Brand','Model','Year','Serial Number','Date Purchased','Purchase Cost','Asking Price','Status','Photo URL','Notes','Date Created','Last Updated'],
  CATEGORIES: ['Category ID','Category Name','Active'],
  EXPENSES:   ['Expense ID','Item ID','Date','Expense Type','Description','Amount','Notes'],
  SALES:      ['Sale ID','Item ID','Date Sold','Final Sale Price','Buyer Name','Notes','Total Expenses','Profit/Loss','Days Held'],
  SETTINGS:   ['Setting Name','Setting Value']
};

var PHOTOS_FOLDER_NAME = 'C&C Equipment Photos';


// ===== Web app entry point ==================================================
function doGet(e) {
  ensureSheets_();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('C&C Equipment')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Used by Index.html to include CSS/JS partial templates. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


// ===== One-time sheet bootstrap ============================================
function ensureSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function(key){
    var name = SHEETS[key];
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, COLS[key].length).setValues([COLS[key]]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, COLS[key].length).setValues([COLS[key]]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });

  // Seed starting categories if Categories sheet is empty
  var cats = ss.getSheetByName(SHEETS.CATEGORIES);
  if (cats.getLastRow() < 2) {
    var rows = STARTING_CATEGORIES.map(function(name, i){
      return ['CAT-' + (i+1), name, true];
    });
    cats.getRange(2, 1, rows.length, 3).setValues(rows);
  }
}

/** Manual menu helper. Run once from the Apps Script editor. */
function setup() { ensureSheets_(); }


// ===== Helpers ==============================================================
function rowsToObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row.every(function(v){ return v === '' || v == null; })) continue;
    var o = { _row: r + 1 };
    headers.forEach(function(h, i){ o[h] = row[i]; });
    out.push(o);
  }
  return out;
}

function findRowById_(sheet, idColIndex /* 0-based */, id) {
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idColIndex]) === String(id)) return r + 1; // 1-based row index
  }
  return -1;
}

function newId_(prefix) {
  return prefix + '-' + (new Date()).getTime().toString(36) + '-' + Math.floor(Math.random()*1000);
}

function toIso_(d) {
  if (!d) return '';
  if (d instanceof Date) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(d);
}

function todayIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}


// ===== Reads ================================================================
/**
 * Returns all data the frontend needs in one batch.
 * Keeps round-trips to the sheet to a minimum (Apps Script calls are slow).
 */
function getAllData() {
  ensureSheets_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    inventory:  rowsToObjects_(ss.getSheetByName(SHEETS.INVENTORY)).map(invFromRow_),
    expenses:   rowsToObjects_(ss.getSheetByName(SHEETS.EXPENSES)).map(expFromRow_),
    sales:      rowsToObjects_(ss.getSheetByName(SHEETS.SALES)).map(saleFromRow_),
    categories: rowsToObjects_(ss.getSheetByName(SHEETS.CATEGORIES)).map(catFromRow_),
    settings:   settingsToObject_()
  };
}

function invFromRow_(r) {
  return {
    id: r['Item ID'],
    name: r['Item Name'],
    category: r['Category'],
    brand: r['Brand'],
    model: r['Model'],
    year: r['Year'],
    serial: r['Serial Number'],
    datePurchased: toIso_(r['Date Purchased']),
    purchaseCost: Number(r['Purchase Cost']) || 0,
    askingPrice: Number(r['Asking Price']) || 0,
    status: r['Status'] || 'Available',
    photo: r['Photo URL'] || '',
    notes: r['Notes'] || '',
    createdAt: toIso_(r['Date Created']),
    updatedAt: toIso_(r['Last Updated'])
  };
}
function expFromRow_(r) {
  return {
    id: r['Expense ID'],
    itemId: r['Item ID'],
    date: toIso_(r['Date']),
    type: r['Expense Type'],
    description: r['Description'] || '',
    amount: Number(r['Amount']) || 0,
    notes: r['Notes'] || ''
  };
}
function saleFromRow_(r) {
  return {
    id: r['Sale ID'],
    itemId: r['Item ID'],
    dateSold: toIso_(r['Date Sold']),
    finalSalePrice: Number(r['Final Sale Price']) || 0,
    buyerName: r['Buyer Name'] || '',
    notes: r['Notes'] || '',
    totalExpenses: Number(r['Total Expenses']) || 0,
    profitLoss: Number(r['Profit/Loss']) || 0,
    daysHeld: Number(r['Days Held']) || 0
  };
}
function catFromRow_(r) {
  return {
    id: r['Category ID'],
    name: r['Category Name'],
    active: r['Active'] !== false && r['Active'] !== 'FALSE'
  };
}

function settingsToObject_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SETTINGS);
  var rows = sheet.getDataRange().getValues();
  var out = {};
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0]) out[rows[i][0]] = rows[i][1];
  }
  if (!out.currency) out.currency = '$';
  return out;
}


// ===== Inventory write ======================================================
/**
 * Saves an inventory item. If item.id matches an existing row, update;
 * otherwise append a new row.
 */
function saveItem(item) {
  ensureSheets_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.INVENTORY);
  var now = todayIso_();
  var id = item.id;

  var row = [
    id || newId_('INV'),
    item.name || '',
    item.category || '',
    item.brand || '',
    item.model || '',
    item.year || '',
    item.serial || '',
    item.datePurchased || '',
    Number(item.purchaseCost) || 0,
    Number(item.askingPrice) || 0,
    item.status || 'Available',
    item.photo || '',
    item.notes || '',
    item.createdAt || now,
    now
  ];

  if (id) {
    var rowNum = findRowById_(sheet, 0, id);
    if (rowNum > 0) {
      // Preserve original created date
      var existing = sheet.getRange(rowNum, 1, 1, COLS.INVENTORY.length).getValues()[0];
      row[13] = existing[13] || row[13];
      sheet.getRange(rowNum, 1, 1, COLS.INVENTORY.length).setValues([row]);
      return { ok: true, id: id };
    }
  }
  sheet.appendRow(row);
  return { ok: true, id: row[0] };
}

function deleteItem(id) {
  ensureSheets_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Delete inventory row
  var inv = ss.getSheetByName(SHEETS.INVENTORY);
  var rowNum = findRowById_(inv, 0, id);
  if (rowNum > 0) inv.deleteRow(rowNum);

  // Cascade delete expenses
  var exp = ss.getSheetByName(SHEETS.EXPENSES);
  deleteRowsWhere_(exp, 1 /* Item ID column index */, id);

  // Cascade delete sales
  var sales = ss.getSheetByName(SHEETS.SALES);
  deleteRowsWhere_(sales, 1, id);

  return { ok: true };
}

function deleteRowsWhere_(sheet, colIndex /* 0-based */, value) {
  var values = sheet.getDataRange().getValues();
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][colIndex]) === String(value)) sheet.deleteRow(r + 1);
  }
}


// ===== Expenses =============================================================
function saveExpense(expense) {
  ensureSheets_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.EXPENSES);
  var id = expense.id || newId_('EXP');
  var row = [
    id,
    expense.itemId || '',
    expense.date || todayIso_(),
    expense.type || 'Other',
    expense.description || '',
    Number(expense.amount) || 0,
    expense.notes || ''
  ];
  if (expense.id) {
    var rowNum = findRowById_(sheet, 0, id);
    if (rowNum > 0) {
      sheet.getRange(rowNum, 1, 1, COLS.EXPENSES.length).setValues([row]);
      return { ok: true, id: id };
    }
  }
  sheet.appendRow(row);
  return { ok: true, id: id };
}

function deleteExpense(id) {
  ensureSheets_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.EXPENSES);
  var rowNum = findRowById_(sheet, 0, id);
  if (rowNum > 0) sheet.deleteRow(rowNum);
  return { ok: true };
}


// ===== Sales (Mark Sold / Undo) ============================================
/**
 * Marks an item sold and writes the sale row.
 * saleData: { itemId, dateSold, finalSalePrice, buyerName, notes }
 */
function markSold(saleData) {
  ensureSheets_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var inv = ss.getSheetByName(SHEETS.INVENTORY);
  var rowNum = findRowById_(inv, 0, saleData.itemId);
  if (rowNum < 0) throw new Error('Item not found');

  var existing = inv.getRange(rowNum, 1, 1, COLS.INVENTORY.length).getValues()[0];
  var purchaseCost = Number(existing[8]) || 0;
  var datePurchased = toIso_(existing[7]);

  // Total expenses for this item
  var expRows = ss.getSheetByName(SHEETS.EXPENSES).getDataRange().getValues();
  var expTotal = 0;
  for (var r = 1; r < expRows.length; r++) {
    if (String(expRows[r][1]) === String(saleData.itemId)) {
      expTotal += Number(expRows[r][5]) || 0;
    }
  }

  var price = Number(saleData.finalSalePrice) || 0;
  var profit = price - purchaseCost - expTotal;
  var daysHeld = daysBetween_(datePurchased, saleData.dateSold);

  // Remove any prior sale row for this item
  var sales = ss.getSheetByName(SHEETS.SALES);
  deleteRowsWhere_(sales, 1, saleData.itemId);

  sales.appendRow([
    newId_('SALE'),
    saleData.itemId,
    saleData.dateSold || todayIso_(),
    price,
    saleData.buyerName || '',
    saleData.notes || '',
    expTotal,
    profit,
    daysHeld
  ]);

  // Set item status to Sold and update timestamp
  inv.getRange(rowNum, 11).setValue('Sold');     // Status column
  inv.getRange(rowNum, 15).setValue(todayIso_()); // Last Updated

  return { ok: true, profit: profit, daysHeld: daysHeld };
}

function undoSale(itemId) {
  ensureSheets_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  deleteRowsWhere_(ss.getSheetByName(SHEETS.SALES), 1, itemId);
  var inv = ss.getSheetByName(SHEETS.INVENTORY);
  var rowNum = findRowById_(inv, 0, itemId);
  if (rowNum > 0) {
    inv.getRange(rowNum, 11).setValue('Available');
    inv.getRange(rowNum, 15).setValue(todayIso_());
  }
  return { ok: true };
}

function daysBetween_(aIso, bIso) {
  if (!aIso) return 0;
  var a = new Date(aIso).getTime();
  var b = (bIso ? new Date(bIso).getTime() : new Date().getTime());
  return Math.max(0, Math.floor((b - a) / (1000*60*60*24)));
}


// ===== Categories ===========================================================
function addCategory(name) {
  ensureSheets_();
  if (!name) return { ok: false, error: 'Enter a category name.' };
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.CATEGORIES);
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][1]).toLowerCase() === String(name).toLowerCase()) {
      return { ok: false, error: 'Category already exists.' };
    }
  }
  var id = newId_('CAT');
  sheet.appendRow([id, name, true]);
  return { ok: true, id: id };
}

function deleteCategory(id) {
  ensureSheets_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cats = ss.getSheetByName(SHEETS.CATEGORIES);
  var rowNum = findRowById_(cats, 0, id);
  if (rowNum < 0) return { ok: false, error: 'Category not found.' };
  var name = cats.getRange(rowNum, 2).getValue();

  // Move items in this category to "Misc. Equipment"
  var inv = ss.getSheetByName(SHEETS.INVENTORY);
  var invVals = inv.getDataRange().getValues();
  for (var r = 1; r < invVals.length; r++) {
    if (String(invVals[r][2]) === String(name)) {
      inv.getRange(r + 1, 3).setValue('Misc. Equipment');
    }
  }
  // Make sure "Misc. Equipment" exists
  var catVals = cats.getDataRange().getValues();
  var miscFound = false;
  for (var i = 1; i < catVals.length; i++) {
    if (String(catVals[i][1]) === 'Misc. Equipment') { miscFound = true; break; }
  }
  if (!miscFound) cats.appendRow([newId_('CAT'), 'Misc. Equipment', true]);

  cats.deleteRow(rowNum);
  return { ok: true };
}


// ===== Photo upload to Drive ================================================
/**
 * Accepts a base64 data URL ("data:image/jpeg;base64,XXXX") from the client,
 * stores it in the "C&C Equipment Photos" Drive folder, and returns the
 * publicly-shareable image URL to embed in the inventory sheet.
 */
function uploadPhoto(base64DataUrl, filename) {
  if (!base64DataUrl) throw new Error('No photo data.');
  var match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data.');
  var contentType = match[1];
  var bytes = Utilities.base64Decode(match[2]);
  var blob = Utilities.newBlob(bytes, contentType, filename || ('photo-' + Date.now() + '.jpg'));

  var folder = getOrCreatePhotosFolder_();
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  // Embeddable image URL pattern that displays inline in HTML
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

function getOrCreatePhotosFolder_() {
  var folders = DriveApp.getFoldersByName(PHOTOS_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(PHOTOS_FOLDER_NAME);
}


// ===== CSV exports ==========================================================
/**
 * Builds a CSV string for the inventory list (with computed totals).
 * The frontend turns this into a downloadable Blob in the browser.
 */
function exportInventoryCsv() {
  var data = getAllData();
  var rows = [['Item name','Category','Brand','Model','Year','Serial #','Date purchased','Purchase cost','Asking price','Status','Total expenses','Estimated profit','Date sold','Final sale price','Actual profit/loss']];
  data.inventory.forEach(function(it){
    var exp = data.expenses.filter(function(e){ return e.itemId === it.id; })
      .reduce(function(t,e){ return t + (Number(e.amount)||0); }, 0);
    var sale = data.sales.find(function(s){ return s.itemId === it.id; });
    var est = (Number(it.askingPrice)||0) - (Number(it.purchaseCost)||0) - exp;
    rows.push([
      it.name, it.category, it.brand, it.model, it.year, it.serial,
      it.datePurchased, it.purchaseCost, it.askingPrice, it.status,
      exp, sale ? '' : est,
      sale ? sale.dateSold : '', sale ? sale.finalSalePrice : '', sale ? sale.profitLoss : ''
    ]);
  });
  return rowsToCsv_(rows);
}

function exportProfitLossCsv() {
  var data = getAllData();
  var rows = [['Item name','Category','Date purchased','Date sold','Purchase cost','Total expenses','Final sale price','Profit/loss','Days held']];
  data.sales.forEach(function(s){
    var it = data.inventory.find(function(i){ return i.id === s.itemId; }) || {};
    rows.push([
      it.name || '', it.category || '', it.datePurchased || '', s.dateSold,
      it.purchaseCost || 0, s.totalExpenses, s.finalSalePrice, s.profitLoss, s.daysHeld
    ]);
  });
  return rowsToCsv_(rows);
}

function rowsToCsv_(rows) {
  return rows.map(function(cells){
    return cells.map(function(c){
      var s = (c == null) ? '' : String(c);
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }).join(',');
  }).join('\n');
}
