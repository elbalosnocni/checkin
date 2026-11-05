/**
 * CHECK-IN TIEC V3 - GitHub Pages + Google Apps Script + Sheets + Drive
 * Danh sach nhan vien: A MaNV, B HoTen, E ThoiGian, F AnhURL. Token duoc quan ly rieng trong tab QR_TOKENS.
 * Script Properties bat buoc: CHECKIN_ADMIN_PIN (PIN quan tri rieng, khong dat trong source code).
 */
const CONFIG = Object.freeze({
  SPREADSHEET_ID: '1vBk4eHERPAQcAe3OLCGtwk5PlGRy1YIi3JHyFPe9-3M',
  EMPLOYEE_SHEET_NAME: '', // De trong = sheet dang active khi setup; nen dien ten tab co dinh.
  DRIVE_FOLDER_ID: '19vAyddEQZtNlfjgQO2wR-1MtzxFCrSLt',
  LOG_SHEET_NAME: 'CHECKIN_LOG',
  FIRST_DATA_ROW: 2,
  CODE_COL: 1,
  NAME_COL: 2,
  TIME_COL: 5,
  PHOTO_COL: 6,
  TOKEN_SHEET_NAME: 'QR_TOKENS',
  TOKEN_CODE_COL: 1,
  TOKEN_NAME_COL: 2,
  TOKEN_VALUE_COL: 3,
  TOKEN_ACTIVE_COL: 4,
  MAX_IMAGE_BYTES: 4 * 1024 * 1024,
  SESSION_TTL_SECONDS: 21600,
  STATUS_TTL_SECONDS: 21600,
  PUBLIC_PAGE_URL: 'https://elbalosnocni.github.io/checkin/'
});

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = String(p.action || '');
  const cb = safeCallback_(p.callback);
  try {
    if (action === 'status') {
      const id = validRequestId_(p.requestId);
      return jsonp_(getCachedResult_(id) || { status: 'PENDING' }, cb);
    }
    if (action === 'lookup') {
      const found = findEmployeeByToken_(String(p.token || ''));
      return jsonp_(found ? { status: 'OK', name: found.name } : { status: 'INVALID', message: 'QR khong hop le hoac da bi khoa.' }, cb);
    }
    if (action === 'adminData') {
      requireAdminSession_(p.session);
      return jsonp_(getAdminData_(), cb);
    }
    return ContentService.createTextOutput('He thong check-in V3 dang hoat dong.').setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return jsonp_({ status: 'ERROR', message: safeMessage_(err) }, cb);
  }
}

function doPost(e) {
  let payload = {};
  let requestId = '';
  try {
    const raw = e && e.parameter && e.parameter.payload;
    if (!raw) throw new Error('Thieu payload.');
    payload = JSON.parse(raw);
    requestId = validRequestId_(payload.requestId);
    const cached = getCachedResult_(requestId);
    if (cached && cached.status !== 'PENDING') return json_(cached);

    let result;
    if (payload.action === 'checkin') result = processCheckin_(payload);
    else if (payload.action === 'adminLogin') result = processAdminLogin_(payload);
    else if (payload.action === 'adminRotateToken') result = processAdminMutation_(payload, rotateEmployeeToken_);
    else if (payload.action === 'adminSetActive') result = processAdminMutation_(payload, setEmployeeActive_);
    else throw new Error('Lenh khong duoc ho tro.');

    putCachedResult_(requestId, result);
    return json_({ status: 'accepted', requestId: requestId });
  } catch (err) {
    const result = { status: 'ERROR', message: safeMessage_(err) };
    if (requestId) putCachedResult_(requestId, result);
    return json_(result);
  }
}

function processCheckin_(payload) {
  const token = String(payload.token || '').trim();
  if (!/^[a-f0-9]{48,80}$/i.test(token)) throw new Error('QR khong hop le.');
  const image = String(payload.image || '');
  const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Anh selfie khong dung dinh dang.');
  const bytes = Utilities.base64Decode(match[2]);
  if (!bytes.length || bytes.length > CONFIG.MAX_IMAGE_BYTES) throw new Error('Anh rong hoac vuot qua 4 MB.');

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  let createdFile = null;
  let employee = null;
  let previousTime = null;
  let previousPhoto = null;
  let employeeSheet = null;
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = getEmployeeSheet_(ss);
    employeeSheet = sheet;
    employee = findEmployeeByTokenInSheets_(sheet, getTokenSheet_(ss), token);
    if (!employee) throw new Error('QR khong hop le hoac da bi thu hoi.');
    if (!isActive_(employee.active)) throw new Error('QR cua nhan vien dang bi khoa. Vui long lien he ban to chuc.');

    const now = new Date();
    previousTime = sheet.getRange(employee.row, CONFIG.TIME_COL).getValue();
    previousPhoto = sheet.getRange(employee.row, CONFIG.PHOTO_COL).getValue();
    if (previousTime instanceof Date && sameDay_(previousTime, now)) {
      throw new Error('Ban da diem danh hom nay. Moi nhan vien chi duoc diem danh mot lan.');
    }

    const mime = match[1];
    const ext = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
    const safeCode = employee.code.replace(/[^a-zA-Z0-9_-]/g, '_');
    const stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
    const blob = Utilities.newBlob(bytes, mime, safeCode + '_' + stamp + '.' + ext);
    createdFile = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID).createFile(blob);

    // Ghi cot E:F cung mot lan. Log giu lich su bat bien theo tung lan thanh cong.
    sheet.getRange(employee.row, CONFIG.TIME_COL, 1, 2).setValues([[now, createdFile.getUrl()]]);
    const log = getLogSheet_(ss);
    SpreadsheetApp.flush();
    log.appendRow([String(payload.requestId || ''), employee.code, employee.name, now, createdFile.getId(), createdFile.getUrl(), 'SUCCESS', 'QR_TOKEN']);
    return { status: 'SUCCESS', name: employee.name, time: now.toISOString() };
  } catch (err) {
    if (createdFile && employeeSheet && employee) {
      try { employeeSheet.getRange(employee.row, CONFIG.TIME_COL, 1, 2).setValues([[previousTime || '', previousPhoto || '']]); } catch (_) {}
    }
    if (createdFile) {
      try { createdFile.setTrashed(true); } catch (_) {}
    }
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function processAdminLogin_(payload) {
  const cache = CacheService.getScriptCache();
  const failures = Number(cache.get('admin_login_failures') || 0);
  if (failures >= 8) throw new Error('Dang nhap quan tri tam thoi bi khoa do nhap sai qua nhieu lan. Thu lai sau 10 phut.');
  const pin = String(payload.pin || '');
  const expected = PropertiesService.getScriptProperties().getProperty('CHECKIN_ADMIN_PIN');
  if (!expected || expected.length < 6) throw new Error('Chua cau hinh CHECKIN_ADMIN_PIN trong Script Properties.');
  if (!constantTimeEquals_(pin, expected)) {
    cache.put('admin_login_failures', String(failures + 1), 600);
    throw new Error('PIN quan tri khong dung.');
  }
  cache.remove('admin_login_failures');
  const session = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  CacheService.getScriptCache().put('admin_' + session, '1', CONFIG.SESSION_TTL_SECONDS);
  return { status: 'SUCCESS', session: session, expiresIn: CONFIG.SESSION_TTL_SECONDS };
}

function processAdminMutation_(payload, handler) {
  requireAdminSession_(payload.session);
  return handler(String(payload.code || ''), payload.value);
}

function rotateEmployeeToken_(code) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const row = findTokenRowByCode_(getTokenSheet_(ss), code);
    if (!row) throw new Error('Khong tim thay ma nhan vien trong bang QR.');
    const token = newToken_();
    getTokenSheet_(ss).getRange(row, CONFIG.TOKEN_VALUE_COL).setValue(token);
    return { status: 'SUCCESS', message: 'Da cap QR token moi.', token: token };
  } finally { lock.releaseLock(); }
}

function setEmployeeActive_(code, value) {
  const active = String(value) === 'true';
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = getTokenSheet_(SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID));
    const row = findTokenRowByCode_(sh, code);
    if (!row) throw new Error('Khong tim thay ma nhan vien trong bang QR.');
    sh.getRange(row, CONFIG.TOKEN_ACTIVE_COL).setValue(active ? 'ACTIVE' : 'LOCKED');
    return { status: 'SUCCESS', message: active ? 'Da mo khoa QR.' : 'Da khoa QR.' };
  } finally { lock.releaseLock(); }
}

function getAdminData_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = getEmployeeSheet_(ss);
  const tokenSheet = getTokenSheet_(ss);
  const last = sh.getLastRow();
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const rows = last >= CONFIG.FIRST_DATA_ROW
    ? sh.getRange(CONFIG.FIRST_DATA_ROW, 1, last - CONFIG.FIRST_DATA_ROW + 1, Math.max(CONFIG.CODE_COL, CONFIG.NAME_COL)).getDisplayValues() : [];
  const rawTimes = last >= CONFIG.FIRST_DATA_ROW
    ? sh.getRange(CONFIG.FIRST_DATA_ROW, CONFIG.TIME_COL, last - CONFIG.FIRST_DATA_ROW + 1, 1).getValues() : [];
  const photoValues = last >= CONFIG.FIRST_DATA_ROW
    ? sh.getRange(CONFIG.FIRST_DATA_ROW, CONFIG.PHOTO_COL, last - CONFIG.FIRST_DATA_ROW + 1, 1).getDisplayValues() : [];
  const tokenLast = tokenSheet.getLastRow();
  const tokenRows = tokenLast >= 2 ? tokenSheet.getRange(2, 1, tokenLast - 1, 4).getDisplayValues() : [];
  const tokenMap = {};
  tokenRows.forEach(r => { if (r[0]) tokenMap[String(r[0]).trim()] = { token: String(r[2] || ''), active: isActive_(r[3]) }; });
  const employees = [];
  let attended = 0, activeCount = 0;
  rows.forEach((r, i) => {
    const code = String(r[CONFIG.CODE_COL - 1] || '').trim();
    if (!code) return;
    const qr = tokenMap[code] || { token: '', active: false };
    const checkinValue = rawTimes[i][0];
    const checkedIn = checkinValue instanceof Date && Utilities.formatDate(checkinValue, tz, 'yyyy-MM-dd') === today;
    if (checkedIn) attended++;
    if (qr.active) activeCount++;
    employees.push({
      code: code,
      name: String(r[CONFIG.NAME_COL - 1] || ''),
      token: qr.token,
      active: qr.active,
      checkedIn: checkedIn,
      time: checkinValue instanceof Date ? Utilities.formatDate(checkinValue, tz, 'dd/MM/yyyy HH:mm:ss') : '',
      photoUrl: String(photoValues[i][0] || '')
    });
  });
  return { status: 'SUCCESS', today: today, stats: { total: employees.length, active: activeCount, attended: attended, absent: employees.length - attended }, employees: employees, pageUrl: CONFIG.PUBLIC_PAGE_URL };
}

function findEmployeeByToken_(token) {
  if (!token) return null;
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const emp = findEmployeeByTokenInSheets_(getEmployeeSheet_(ss), getTokenSheet_(ss), token);
  return emp && isActive_(emp.active) ? { name: emp.name } : null;
}

function findEmployeeByTokenInSheets_(employeeSheet, tokenSheet, token) {
  const last = tokenSheet.getLastRow();
  if (last < 2) return null;
  const rows = tokenSheet.getRange(2, 1, last - 1, 4).getDisplayValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][CONFIG.TOKEN_VALUE_COL - 1] || '') !== token) continue;
    const code = String(rows[i][CONFIG.TOKEN_CODE_COL - 1] || '').trim();
    const row = findEmployeeRowByCode_(employeeSheet, code);
    if (!row) return null;
    const name = employeeSheet.getRange(row, CONFIG.NAME_COL).getDisplayValue();
    return { row: row, code: code, name: String(name || rows[i][CONFIG.TOKEN_NAME_COL - 1] || '').trim(), active: rows[i][CONFIG.TOKEN_ACTIVE_COL - 1] };
  }
  return null;
}

function findTokenRowByCode_(sh, code) {
  const last = sh.getLastRow(); if (last < 2) return 0;
  const vals = sh.getRange(2, CONFIG.TOKEN_CODE_COL, last - 1, 1).getDisplayValues();
  for (let i = 0; i < vals.length; i++) if (String(vals[i][0]).trim() === code.trim()) return i + 2;
  return 0;
}

function findEmployeeRowByCode_(sh, code) {
  const last = sh.getLastRow(); if (last < CONFIG.FIRST_DATA_ROW) return 0;
  const vals = sh.getRange(CONFIG.FIRST_DATA_ROW, CONFIG.CODE_COL, last - CONFIG.FIRST_DATA_ROW + 1, 1).getDisplayValues();
  for (let i = 0; i < vals.length; i++) if (String(vals[i][0]).trim() === code.trim()) return CONFIG.FIRST_DATA_ROW + i;
  return 0;
}

function getEmployeeSheet_(ss) {
  let sh;
  if (CONFIG.EMPLOYEE_SHEET_NAME) sh = ss.getSheetByName(CONFIG.EMPLOYEE_SHEET_NAME);
  else sh = ss.getSheets().find(x => ![CONFIG.TOKEN_SHEET_NAME, CONFIG.LOG_SHEET_NAME].includes(x.getName()));
  if (!sh) throw new Error('Khong tim thay tab danh sach nhan vien. Hay dien EMPLOYEE_SHEET_NAME.');
  return sh;
}

function getLogSheet_(ss) {
  let sh = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.LOG_SHEET_NAME);
    sh.appendRow(['RequestID', 'MaNV', 'HoTen', 'ThoiGian', 'DriveFileID', 'AnhURL', 'TrangThai', 'GhiChu']);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Chay mot lan: tao cot token/trang thai va cap token rieng cho nhan vien chua co. */
function getTokenSheet_(ss) {
  let sh = ss.getSheetByName(CONFIG.TOKEN_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(CONFIG.TOKEN_SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['MaNV', 'HoTen', 'QR_TOKEN', 'TRANG_THAI_QR']);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Chay mot lan: tao tab QR_TOKENS rieng va cap token cho nhan vien chua co. */
function setupCheckinV3() {
  const adminPin = PropertiesService.getScriptProperties().getProperty('CHECKIN_ADMIN_PIN');
  if (!adminPin || adminPin.length < 6) throw new Error('Hay tao Script Property CHECKIN_ADMIN_PIN (toi thieu 6 ky tu) truoc khi setup.');
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = getEmployeeSheet_(ss);
  if (sh.getMaxColumns() < CONFIG.PHOTO_COL) sh.insertColumnsAfter(sh.getMaxColumns(), CONFIG.PHOTO_COL - sh.getMaxColumns());
  DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID).getName();
  const tokenSheet = getTokenSheet_(ss);
  const last = sh.getLastRow();
  const roster = last >= CONFIG.FIRST_DATA_ROW
    ? sh.getRange(CONFIG.FIRST_DATA_ROW, 1, last - CONFIG.FIRST_DATA_ROW + 1, Math.max(CONFIG.CODE_COL, CONFIG.NAME_COL)).getDisplayValues() : [];
  const oldLast = tokenSheet.getLastRow();
  const oldRows = oldLast >= 2 ? tokenSheet.getRange(2, 1, oldLast - 1, 4).getDisplayValues() : [];
  const oldMap = {};
  oldRows.forEach(r => { if (r[0]) oldMap[String(r[0]).trim()] = { token: String(r[2] || ''), active: String(r[3] || 'ACTIVE') }; });
  const seen = {};
  const output = [];
  roster.forEach(r => {
    const code = String(r[CONFIG.CODE_COL - 1] || '').trim();
    if (!code) return;
    const name = String(r[CONFIG.NAME_COL - 1] || '').trim();
    const old = oldMap[code] || {};
    let token = old.token;
    if (!token || seen[token]) token = newToken_();
    seen[token] = true;
    output.push([code, name, token, old.active || 'ACTIVE']);
  });
  if (tokenSheet.getLastRow() > 1) tokenSheet.getRange(2, 1, tokenSheet.getLastRow() - 1, 4).clearContent();
  if (output.length) {
    tokenSheet.getRange(2, 1, output.length, 4).setValues(output);
    tokenSheet.getRange(2, CONFIG.TOKEN_VALUE_COL, output.length, 1).setNumberFormat('@');
  }
  getLogSheet_(ss);
  tokenSheet.hideColumns(CONFIG.TOKEN_VALUE_COL, 2);
  const existingProtection = tokenSheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).some(p => p.getDescription() === 'CHECKIN_V3_PROTECTED_QR_COLUMNS');
  if (!existingProtection) {
    const protection = tokenSheet.getRange(1, CONFIG.TOKEN_VALUE_COL, tokenSheet.getMaxRows(), 2).protect();
    protection.setDescription('CHECKIN_V3_PROTECTED_QR_COLUMNS');
    protection.setWarningOnly(false);
  }
  SpreadsheetApp.flush();
  Logger.log('Setup V3 OK. Roster=' + sh.getName() + ', employees=' + output.length + ', token sheet=' + tokenSheet.getName());
}

function newToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').substring(0, 16);
}
function isActive_(v) { return !['LOCKED', 'FALSE', '0', 'INACTIVE', 'NO'].includes(String(v || '').trim().toUpperCase()); }
function sameDay_(a, b) { const tz = Session.getScriptTimeZone(); return Utilities.formatDate(a, tz, 'yyyyMMdd') === Utilities.formatDate(b, tz, 'yyyyMMdd'); }
function requireAdminSession_(session) {
  const s = String(session || '');
  if (!/^[a-f0-9]{48,80}$/i.test(s) || CacheService.getScriptCache().get('admin_' + s) !== '1') throw new Error('Phien quan tri het han. Vui long dang nhap lai.');
}
function validRequestId_(id) { const s = String(id || ''); if (!/^[a-zA-Z0-9_-]{12,80}$/.test(s)) throw new Error('Request ID khong hop le.'); return s; }
function putCachedResult_(id, result) { CacheService.getScriptCache().put('req_' + id, JSON.stringify(result), CONFIG.STATUS_TTL_SECONDS); }
function getCachedResult_(id) { const s = CacheService.getScriptCache().get('req_' + id); return s ? JSON.parse(s) : null; }
function safeCallback_(cb) { const s = String(cb || 'cb'); return /^[A-Za-z_$][0-9A-Za-z_$]{0,60}$/.test(s) ? s : 'cb'; }
function jsonp_(obj, cb) { return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function safeMessage_(e) { return String(e && e.message ? e.message : e).substring(0, 300); }
function constantTimeEquals_(a, b) { a = String(a); b = String(b); let diff = a.length ^ b.length; const n = Math.max(a.length, b.length); for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return diff === 0; }
