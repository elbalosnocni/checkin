/**
 * HE THONG CHECK-IN TIEC - Google Apps Script
 * Sheet danh sach: cot A = Ma nhan vien, cot B = Ho ten,
 * cot E = Thoi gian diem danh, cot F = Link anh selfie.
 */
const CONFIG = {
  SPREADSHEET_ID: '1vBk4eHERPAQcAe3OLCGtwk5PlGRy1YIi3JHyFPe9-3M',
  EMPLOYEE_SHEET_NAME: '', // De trong de dung sheet dang active; hoac nhap ten tab danh sach
  DRIVE_FOLDER_ID: '19vAyddEQZtNlfjgQO2wR-1MtzxFCrSLt',
  LOG_SHEET_NAME: 'CHECKIN_LOG',
  FIRST_DATA_ROW: 2,
  EMPLOYEE_CODE_COL: 1,
  EMPLOYEE_NAME_COL: 2,
  CHECKIN_TIME_COL: 5,
  PHOTO_URL_COL: 6,
  MAX_IMAGE_BYTES: 5 * 1024 * 1024,
  ALLOW_RECHECK_SAME_DAY: false
};

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'status' && p.requestId) return jsonpStatus_(p.requestId, p.callback);
  return ContentService.createTextOutput('He thong diem danh dang hoat dong.').setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  let requestId = '';
  try {
    const raw = e && e.parameter && e.parameter.payload;
    if (!raw) throw new Error('Thieu du lieu gui len.');
    const payload = JSON.parse(raw);
    requestId = String(payload.requestId || '').trim();
    if (!/^[a-zA-Z0-9_-]{12,80}$/.test(requestId)) throw new Error('Ma yeu cau khong hop le.');
    const code = String(payload.msnv || '').trim();
    if (!code || code.length > 50) throw new Error('Ma nhan vien khong hop le.');
    const image = String(payload.image || '');
    const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error('Anh khong dung dinh dang JPEG, PNG hoac WEBP.');
    const bytes = Utilities.base64Decode(match[2]);
    if (!bytes.length || bytes.length > CONFIG.MAX_IMAGE_BYTES) throw new Error('Anh rong hoac vuot qua dung luong 5 MB.');

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const sheet = getEmployeeSheet_(ss);
      const values = sheet.getDataRange().getDisplayValues();
      let row = 0, name = '';
      for (let i = CONFIG.FIRST_DATA_ROW - 1; i < values.length; i++) {
        if (String(values[i][CONFIG.EMPLOYEE_CODE_COL - 1]).trim() === code) {
          row = i + 1;
          name = String(values[i][CONFIG.EMPLOYEE_NAME_COL - 1] || '').trim();
          break;
        }
      }
      if (!row) throw new Error('Khong tim thay ma nhan vien trong danh sach.');

      const log = getLogSheet_(ss);
      const existing = findRequest_(log, requestId);
      if (existing) {
        if (existing.status === 'SUCCESS') return accepted_();
        throw new Error('Yeu cau nay da duoc tiep nhan. Vui long kiem tra trang thai.');
      }

      const oldTime = sheet.getRange(row, CONFIG.CHECKIN_TIME_COL).getValue();
      if (!CONFIG.ALLOW_RECHECK_SAME_DAY && oldTime instanceof Date && sameDay_(oldTime, new Date())) {
        throw new Error('Nhan vien nay da diem danh hom nay. Vui long lien he ban to chuc neu can dieu chinh.');
      }

      const mime = match[1];
      const ext = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
      const safeCode = code.replace(/[^a-zA-Z0-9_-]/g, '_');
      const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
      const blob = Utilities.newBlob(bytes, mime, safeCode + '_' + stamp + '.' + ext);
      const file = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID).createFile(blob);
      const now = new Date();
      sheet.getRange(row, CONFIG.CHECKIN_TIME_COL, 1, 2).setValues([[now, file.getUrl()]]);
      log.appendRow([requestId, code, name, now, file.getId(), file.getUrl(), 'SUCCESS', '']);
      CacheService.getScriptCache().put('status_' + requestId, JSON.stringify({status:'SUCCESS', name:name}), 21600);
    } finally {
      lock.releaseLock();
    }
    return accepted_();
  } catch (err) {
    if (requestId) {
      try {
        CacheService.getScriptCache().put('status_' + requestId, JSON.stringify({status:'ERROR', message:String(err.message || err)}), 21600);
      } catch (_) {}
    }
    return ContentService.createTextOutput(JSON.stringify({status:'error', message:String(err.message || err)})).setMimeType(ContentService.MimeType.JSON);
  }
}

function getEmployeeSheet_(ss) {
  const sheet = CONFIG.EMPLOYEE_SHEET_NAME ? ss.getSheetByName(CONFIG.EMPLOYEE_SHEET_NAME) : ss.getActiveSheet();
  if (!sheet) throw new Error('Khong tim thay tab danh sach nhan vien.');
  return sheet;
}

function getLogSheet_(ss) {
  let sh = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.LOG_SHEET_NAME);
    sh.appendRow(['RequestID','MaNV','HoTen','ThoiGian','DriveFileID','AnhURL','TrangThai','GhiChu']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function findRequest_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return null;
  const found = sh.getRange(2, 1, last - 1, 7).getValues();
  for (let i = found.length - 1; i >= 0; i--) {
    if (String(found[i][0]) === id) return {status:String(found[i][6] || '')};
  }
  return null;
}

function jsonpStatus_(id, callback) {
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(String(id))) return jsonp_({status:'ERROR', message:'Ma yeu cau khong hop le.'}, callback);
  const cached = CacheService.getScriptCache().get('status_' + id);
  if (cached) return jsonp_(JSON.parse(cached), callback);
  return jsonp_({status:'PENDING'}, callback);
}

function jsonp_(obj, callback) {
  const cb = /^[a-zA-Z_$][0-9a-zA-Z_$\.]{0,80}$/.test(String(callback || '')) ? callback : 'checkinStatusCallback';
  return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function accepted_() {
  return ContentService.createTextOutput(JSON.stringify({status:'accepted'})).setMimeType(ContentService.MimeType.JSON);
}
function sameDay_(a, b) {
  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(a, tz, 'yyyyMMdd') === Utilities.formatDate(b, tz, 'yyyyMMdd');
}

/** Chay mot lan tu Apps Script de cap quyen va kiem tra cau hinh. */
function setupCheckin() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sh = getEmployeeSheet_(ss);
  getLogSheet_(ss);
  DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID).getName();
  if (sh.getLastColumn() < CONFIG.PHOTO_URL_COL) sh.insertColumnsAfter(sh.getLastColumn(), CONFIG.PHOTO_URL_COL - sh.getLastColumn());
  SpreadsheetApp.flush();
  Logger.log('Setup OK. Sheet: ' + sh.getName());
}
