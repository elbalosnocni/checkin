const SPREADSHEET_ID = '1vBk4eHERPAQcAe3OLCGtwk5PlGRy1YIi3JHyFPe9-3M';
const SHEET_DS = 'DanhSachNV';
const SHEET_CC = 'ChamCong';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Quét Thẻ Nhân Viên - Liwayway')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Dò nhân viên trong sheet DanhSachNV
 * Cấu trúc cột DanhSachNV:
 * Cột A: MaNV (VD: PR7155, PL1305, HR028)
 * Cột B: HoTen (VD: NGUYỄN NHẬT HÀO C)
 * Cột C: MaChamCong (VD: 7000, 7235, 5420)
 * Cột D: CaLamViec (VD: Ca 1, Ca 2, Ca 3, Hành chính...)
 */
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

/**
 * Ghi dữ liệu vào sheet ChamCong
 * Cột A: ThoiGian | B: MaNV | C: HoTen | D: MaChamCong | E: CaLamViec | F: TrangThai
 */
function ghiChamCong(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_CC);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CC);
    sheet.appendRow(['ThoiGian', 'MaNV', 'HoTen', 'MaChamCong', 'CaLamViec', 'TrangThai']);
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
  return String(str || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
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
