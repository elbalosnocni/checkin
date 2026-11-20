const SPREADSHEET_ID = '1vBk4eHERPAQcAe3OLCGtwk5PlGRy1IYi3JHyFPe9-3M';
const SHEET_DS = 'DanhSachNV';
const SHEET_CC = 'ChamCong';
const DRIVE_FOLDER_ID = '19vAyddEQZtNlfjgQO2wR-1MtzxFCrSLt';
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const CACHE_SECONDS = 60;
const CACHE_KEY = 'CHECKIN_EMPLOYEE_INDEX_V2';

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'lookup') {
    return jsonResponse(traCuuNhanVien({
      maNV: p.maNV || '',
      maChamCong: p.maChamCong || '',
      hoTen: p.hoTen || '',
      rawText: p.rawText || ''
    }));
  }
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

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getEmployeeIndex_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_DS);
  if (!sheet) throw new Error('Không tìm thấy sheet ' + SHEET_DS);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { byMaNV: {}, byMaCC: {}, byName: {}, rows: [] };

  // Đọc đúng 4 cột đang được sử dụng, dùng display values để giữ số 0 đầu mã.
  const values = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
  const index = { byMaNV: {}, byMaCC: {}, byName: {}, rows: [] };

  values.forEach(r => {
    const item = {
      maNV: String(r[0] || '').trim(),
      hoTen: String(r[1] || '').trim(),
      maChamCong: String(r[2] || '').trim(),
      caLamViec: String(r[3] || 'Chưa phân ca').trim()
    };
    if (!item.maNV && !item.maChamCong && !item.hoTen) return;
    const nMaNV = normalizeCode(item.maNV);
    const nMaCC = normalizeCode(item.maChamCong);
    const nName = normalizeText(item.hoTen);
    if (nMaNV) index.byMaNV[nMaNV] = item;
    if (nMaCC) index.byMaCC[nMaCC] = item;
    if (nName) index.byName[nName] = item;
    index.rows.push({ item, nMaNV, nMaCC, nName });
  });

  // CacheService giới hạn kích thước mỗi key; nếu danh sách quá lớn thì bỏ cache an toàn.
  try {
    const json = JSON.stringify(index);
    if (json.length < 95000) cache.put(CACHE_KEY, json, CACHE_SECONDS);
  } catch (e) {}
  return index;
}

function traCuuNhanVien(payload) {
  try {
    const idx = getEmployeeIndex_();
    const qMaNV = normalizeCode(payload.maNV);
    const qMaCC = normalizeCode(payload.maChamCong);
    const qHoTen = normalizeText(payload.hoTen);
    const qRaw = normalizeText(payload.rawText);

    let found = (qMaNV && idx.byMaNV[qMaNV]) ||
                (qMaCC && idx.byMaCC[qMaCC]) ||
                (qHoTen && idx.byName[qHoTen]);
    if (!found && qHoTen) {
      found = idx.rows.find(x => x.nName &&
        (x.nName.includes(qHoTen) || qHoTen.includes(x.nName)))?.item;
    }
    if (!found && qRaw) {
      found = idx.rows.find(x =>
        (x.nMaNV && qRaw.includes(x.nMaNV.toLowerCase())) ||
        (x.nName && x.nName.length >= 6 && qRaw.includes(x.nName))
      )?.item;
    }
    return found ? { found: true, ...found } : { found: false };
  } catch (err) {
    return { found: false, error: err.message || String(err) };
  }
}

function ghiChamCong(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let imageUrl = '';
    if (payload.imageData) imageUrl = saveCapturedImage_(payload);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_CC);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_CC);
      sheet.getRange(1, 1, 1, 6).setValues([[
        'ThoiGian', 'MaNV', 'Hoten', 'Machamcong', 'CaLamViec', 'TrangThai'
      ]]);
    }
    // Tìm cột ảnh theo tên tiêu đề; nếu chưa có thì thêm cuối bảng, không ghi đè cột khác.
    const header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
    let imageCol = header.indexOf('AnhChupURL') + 1;
    if (!imageCol) {
      imageCol = header.length + 1;
      sheet.getRange(1, imageCol).setValue('AnhChupURL');
    }

    const now = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd HH:mm:ss');
    const trangThai = payload.foundInList ? 'Có trong danh sách' : 'Không có tên trong danh sách';
    const row = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(row, 1, 1, 6).setValues([[
      now,
      String(payload.maNV || ''),
      String(payload.hoTen || ''),
      String(payload.maChamCong || ''),
      String(payload.caLamViec || ''),
      trangThai
    ]]);
    sheet.getRange(row, imageCol).setValue(imageUrl);
    return { success: true, time: now, status: trangThai, imageUrl };
  } finally {
    lock.releaseLock();
  }
}

function saveCapturedImage_(payload) {
  const dataUrl = String(payload.imageData || '');
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Dữ liệu ảnh không hợp lệ.');
  const mimeType = match[1];
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Ảnh vượt quá 5 MB. Vui lòng chụp lại.');
  const ext = mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpg');
  const stamp = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyyMMdd_HHmmss');
  const safeCode = String(payload.maNV || payload.maChamCong || 'NhanVien')
    .replace(/[^A-Za-z0-9_-]/g, '').substring(0, 30);
  const blob = Utilities.newBlob(bytes, mimeType, `Checkin_${stamp}_${safeCode}.${ext}`);
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const file = folder.createFile(blob);
  return file.getUrl();
}

function normalizeCode(str) {
  return String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function normalizeText(str) {
  return String(str || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Chạy thủ công sau khi cập nhật danh sách nhân viên để dữ liệu tra cứu được làm mới ngay.
function lamMoiCacheNhanVien() {
  CacheService.getScriptCache().remove(CACHE_KEY);
  return 'Đã xóa cache danh sách nhân viên.';
}
