const SPREADSHEET_ID = '1vBk4eHERPAQcAe3OLCGtwk5PlGRy1YIi3JHyFPe9-3M';
const SHEET_DS = 'DanhSachNV';
const SHEET_CC = 'ChamCong';
const DRIVE_FOLDER_ID = '19vAyddEQZtNlfjgQO2wR-1MtzxFCrSLt';
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const CACHE_SECONDS = 60;
const CACHE_KEY = 'CHECKIN_EMPLOYEE_INDEX_V3';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'lookup') {
    return jsonResponse(traCuuNhanVien({
      maNV: p.maNV || '', maChamCong: p.maChamCong || '',
      hoTen: p.hoTen || '', rawText: p.rawText || ''
    }));
  }
  if (p.action === 'health') return jsonResponse(kiemTraCauHinh());
  return jsonResponse({ success: true, status: 'API Quet The Liwayway dang hoat dong' });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (payload.action === 'save') return jsonResponse(ghiChamCong(payload));
    return jsonResponse({ success: false, error: 'Action không hợp lệ' });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: err.message || String(err) });
  }
}

function kiemTraCauHinh() {
  const result = { success: false, spreadsheetIdConfigured: !!SPREADSHEET_ID, sheetFound: false, driveFolderFound: false };
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    result.spreadsheetName = ss.getName();
    result.sheetFound = !!ss.getSheetByName(SHEET_DS);
    if (!result.sheetFound) result.error = 'Không tìm thấy tab ' + SHEET_DS;
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    result.driveFolderFound = !!folder;
    result.success = result.sheetFound && result.driveFolderFound;
  } catch (e) {
    result.error = e.message || String(e);
  }
  return result;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getEmployeeIndex_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY);
  if (cached) { try { return JSON.parse(cached); } catch (e) {} }

  // Fail with a useful diagnostic if the ID is wrong or the executing account lacks access.
  let ss;
  try { ss = SpreadsheetApp.openById(SPREADSHEET_ID); }
  catch (e) { throw new Error('Không mở được Google Sheet. Kiểm tra SPREADSHEET_ID và quyền của tài khoản thực thi Apps Script. Chi tiết: ' + e.message); }
  const sheet = ss.getSheetByName(SHEET_DS);
  if (!sheet) throw new Error('Không tìm thấy tab "' + SHEET_DS + '" trong file "' + ss.getName() + '".');

  const lastRow = sheet.getLastRow();
  const index = { byMaNV: {}, byMaCC: {}, byName: {}, rows: [], duplicates: [] };
  if (lastRow < 2) return index;
  const values = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();

  values.forEach((r, i) => {
    const item = {
      maNV: String(r[0] || '').trim(), hoTen: String(r[1] || '').trim(),
      maChamCong: String(r[2] || '').trim(), caLamViec: String(r[3] || 'Chưa phân ca').trim()
    };
    if (!item.maNV && !item.maChamCong && !item.hoTen) return;
    const nMaNV = normalizeCode(item.maNV), nMaCC = normalizeCode(item.maChamCong), nName = normalizeText(item.hoTen);
    if (nMaNV && index.byMaNV[nMaNV]) index.duplicates.push('Mã nhân viên ' + item.maNV + ' (dòng ' + (i + 2) + ')');
    if (nMaCC && index.byMaCC[nMaCC]) index.duplicates.push('Mã chấm công ' + item.maChamCong + ' (dòng ' + (i + 2) + ')');
    if (nMaNV && !index.byMaNV[nMaNV]) index.byMaNV[nMaNV] = item;
    if (nMaCC && !index.byMaCC[nMaCC]) index.byMaCC[nMaCC] = item;
    if (nName && !index.byName[nName]) index.byName[nName] = item;
    index.rows.push({ item, nMaNV, nMaCC, nName });
  });
  try {
    const json = JSON.stringify(index);
    if (json.length < 95000) cache.put(CACHE_KEY, json, CACHE_SECONDS);
  } catch (e) {}
  return index;
}

function traCuuNhanVien(payload) {
  try {
    const idx = getEmployeeIndex_();
    const qMaNV = normalizeCode(payload.maNV), qMaCC = normalizeCode(payload.maChamCong);
    const qHoTen = normalizeText(payload.hoTen), qRaw = normalizeText(payload.rawText);
    const byNV = qMaNV ? idx.byMaNV[qMaNV] : null;
    const byCC = qMaCC ? idx.byMaCC[qMaCC] : null;
    if (byNV && byCC && (normalizeCode(byNV.maNV) !== normalizeCode(byCC.maNV))) {
      return { found: false, conflict: true, error: 'Mã nhân viên và mã chấm công đang trỏ đến hai nhân viên khác nhau. Vui lòng kiểm tra lại.' };
    }
    let found = byNV || byCC || ((!qMaNV && !qMaCC && qHoTen) ? idx.byName[qHoTen] : null);
    // Name/raw OCR is only a fallback, never allowed to override a conflicting code.
    if (!found && !qMaNV && !qMaCC && qHoTen) {
      const matches = idx.rows.filter(x => x.nName && (x.nName === qHoTen || x.nName.includes(qHoTen) || qHoTen.includes(x.nName)));
      if (matches.length === 1) found = matches[0].item;
    }
    if (!found && !qMaNV && !qMaCC && qRaw) {
      const matches = idx.rows.filter(x => x.nMaNV && qRaw.includes(x.nMaNV.toLowerCase()));
      if (matches.length === 1) found = matches[0].item;
    }
    return found ? { found: true, ...found, duplicateWarnings: idx.duplicates } : { found: false, duplicateWarnings: idx.duplicates };
  } catch (err) {
    return { found: false, error: err.message || String(err) };
  }
}

function ghiChamCong(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const maNV = String(payload.maNV || '').trim();
    const maCC = String(payload.maChamCong || '').trim();
    const hoTen = String(payload.hoTen || '').trim();
    if (!maNV && !maCC && !hoTen) throw new Error('Thiếu thông tin nhân viên.');
    // Always re-check on server; never trust a browser-supplied foundInList flag.
    const lookup = traCuuNhanVien({ maNV: maNV, maChamCong: maCC, hoTen: hoTen });
    if (lookup.conflict) throw new Error(lookup.error);
    const verified = !!lookup.found;
    const manual = !verified;
    if (manual && String(payload.manualConfirmed) !== 'true') {
      throw new Error('Nhân viên chưa xác minh. Cần xác nhận thủ công trên giao diện.');
    }

    let imageUrl = '';
    if (payload.imageData) imageUrl = saveCapturedImage_(payload);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_CC);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_CC);
      sheet.getRange(1, 1, 1, 7).setValues([['ThoiGian','MaNV','Hoten','Machamcong','CaLamViec','TrangThai','AnhChupURL']]);
    }
    const header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
    let imageCol = header.indexOf('AnhChupURL') + 1;
    if (!imageCol) { imageCol = header.length + 1; sheet.getRange(1, imageCol).setValue('AnhChupURL'); }
    const now = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd HH:mm:ss');
    const status = verified ? 'Đã đối chiếu Google Sheet' : 'XÁC NHẬN THỦ CÔNG - CHƯA XÁC MINH';
    const row = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(row, 1, 1, 6).setValues([[
      now, maNV, hoTen, maCC,
      verified ? lookup.caLamViec : String(payload.caLamViec || 'Chưa xác minh'),
      status
    ]]);
    sheet.getRange(row, imageCol).setValue(imageUrl);
    return { success: true, time: now, status: status, imageUrl: imageUrl, verified: verified };
  } finally { lock.releaseLock(); }
}

function saveCapturedImage_(payload) {
  const dataUrl = String(payload.imageData || '');
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Dữ liệu ảnh không hợp lệ.');
  const mimeType = match[1], bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Ảnh vượt quá 5 MB. Vui lòng chụp lại.');
  const ext = mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpg');
  const stamp = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyyMMdd_HHmmss');
  const safeCode = String(payload.maNV || payload.maChamCong || 'NhanVien').replace(/[^A-Za-z0-9_-]/g, '').substring(0, 30);
  const blob = Utilities.newBlob(bytes, mimeType, `Checkin_${stamp}_${safeCode}.${ext}`);
  return DriveApp.getFolderById(DRIVE_FOLDER_ID).createFile(blob).getUrl();
}

function normalizeCode(str) { return String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim(); }
function normalizeText(str) {
  return String(str || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function lamMoiCacheNhanVien() {
  CacheService.getScriptCache().remove(CACHE_KEY);
  return 'Đã xóa cache danh sách nhân viên.';
}
