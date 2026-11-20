const SPREADSHEET_ID = '1vBk4eHERPAQcAe3OLCGtwk5PlGRy1YIi3JHyFPe9-3M';
const SHEET_DS = 'DanhSachNV';
const SHEET_CC = 'ChamCong';

// Xử lý request GET (Dò nhân viên)
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'lookup') {
    const res = traCuuNhanVien({
      maNV: e.parameter.maNV || '',
      maChamCong: e.parameter.maChamCong || '',
      hoTen: e.parameter.hoTen || '',
      rawText: e.parameter.rawText || ''
    });
    return jsonResponse(res);
  }
  return jsonResponse({ status: 'API Quet The Liwayway dang hoat dong' });
}

// Xử lý request POST (Ghi chấm công từ GitHub Pages)
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.action === 'save') {
      const res = ghiChamCong(payload);
      return jsonResponse(res);
    }
    return jsonResponse({ success: false, error: 'Action không hợp lệ' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function traCuuNhanVien(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_DS);
  if (!sheet) {
    return { found: false, error: 'Không tìm thấy sheet ' + SHEET_DS };
  }

  const data = sheet.getDataRange().getValues();
  const qMaNV = normalizeCode(payload.maNV);
  const qMaCC = normalizeCode(payload.maChamCong);
  const qHoTen = normalizeText(payload.hoTen);
  const qRaw = normalizeText(payload.rawText);

  for (let i = 1; i < data.length; i++) {
    const [maNV, hoTen, maCC, caLam] = data[i];
    const dbMaNV = normalizeCode(maNV);
    const dbMaCC = normalizeCode(maCC);
    const dbHoTen = normalizeText(hoTen);

    const matchByMaNV = qMaNV && dbMaNV && (qMaNV === dbMaNV);
    const matchByMaCC = qMaCC && dbMaCC && (qMaCC === dbMaCC);
    const matchByName = qHoTen && dbHoTen && (qHoTen === dbHoTen || dbHoTen.includes(qHoTen) || qHoTen.includes(dbHoTen));
    const matchInRaw = (dbMaNV && qRaw.includes(dbMaNV.toLowerCase())) || (dbHoTen && dbHoTen.length >= 6 && qRaw.includes(dbHoTen));

    if (matchByMaNV || matchByMaCC || matchByName || matchInRaw) {
      return {
        found: true,
        maNV: String(maNV || '').trim(),
        hoTen: String(hoTen || '').trim(),
        maChamCong: String(maCC || '').trim(),
        caLamViec: String(caLam || 'Chưa phân ca').trim()
      };
    }
  }
  return { found: false };
}

function ghiChamCong(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_CC);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CC);
    sheet.appendRow(['ThoiGian', 'MaNV', 'Hoten', 'Machamcong', 'CaLamViec', 'TrangThai']);
  }

  const now = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss');
  const trangThai = payload.foundInList
    ? 'Có trong danh sách'
    : 'Không có tên trong danh sách';

  sheet.appendRow([
    now,
    payload.maNV || '',
    payload.hoTen || '',
    payload.maChamCong || '',
    payload.caLamViec || '',
    trangThai
  ]);

  return { success: true, time: now, status: trangThai };
}

function normalizeCode(str) {
  return String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
