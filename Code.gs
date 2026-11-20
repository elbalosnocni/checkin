const SPREADSHEET_ID = '1vBk4eHERPAQcAe3OLCGtwk5PlGRy1YIi3JHyFPe9-3M';
const SHEET_DS = 'DanhSachNV';
const SHEET_CC = 'ChamCong';
const DRIVE_FOLDER_ID = '19vAyddEQZtNlfjgQO2wR-1MtzxFCrSLt';
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const CACHE_SECONDS = 300;                       // danh sách NV được nhớ 5 phút
const CACHE_KEY = 'CHECKIN_EMPLOYEES_V4';
const CACHE_CHUNK = 90000;                       // giới hạn 100KB / khóa cache

// Ngưỡng điểm khi dò OCR
const SCORE_CONFIDENT = 50;   // đủ tin cậy để tự điền
const SCORE_MARGIN = 15;      // phải hơn người đứng thứ 2 ít nhất ngần này
const SCORE_SUGGEST = 30;     // thấp hơn mức này thì không gợi ý

/* ===================== ENDPOINTS ===================== */

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
    if (payload.action === 'lookup') return jsonResponse(traCuuNhanVien(payload));
    if (payload.action === 'save') return jsonResponse(ghiChamCong(payload));
    return jsonResponse({ success: false, error: 'Action không hợp lệ' });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: err.message || String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
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
    if (result.sheetFound) {
      const rows = loadEmployees_(true).rows;
      result.soNhanVien = rows.length;
      result.duplicateWarnings = findDuplicates_(rows);
    }
    result.success = result.sheetFound && result.driveFolderFound;
  } catch (e) {
    result.error = e.message || String(e);
  }
  return result;
}

/* ===================== ĐỌC DANH SÁCH NHÂN VIÊN ===================== */

// Mỗi dòng: [maNV, hoTen, maChamCong, caLamViec]
function loadEmployees_(forceFresh) {
  const cache = CacheService.getScriptCache();
  if (!forceFresh) {
    const cached = cacheGetChunked_(cache);
    if (cached) return { rows: cached, fromCache: true };
  }
  let ss;
  try { ss = SpreadsheetApp.openById(SPREADSHEET_ID); }
  catch (e) { throw new Error('Không mở được Google Sheet. Kiểm tra SPREADSHEET_ID và quyền của tài khoản thực thi Apps Script. Chi tiết: ' + e.message); }
  const sheet = ss.getSheetByName(SHEET_DS);
  if (!sheet) throw new Error('Không tìm thấy tab "' + SHEET_DS + '" trong file "' + ss.getName() + '".');

  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), 4);
  const rows = [];
  if (lastRow >= 2) {
    const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
    const col = findColumns_(values[0]);
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      const maNV = String(r[col.maNV] || '').trim();
      const hoTen = String(r[col.hoTen] || '').trim();
      const maCC = String(r[col.maCC] || '').trim();
      const ca = String(r[col.ca] || '').trim() || 'Chưa phân ca';
      if (!maNV && !hoTen && !maCC) continue;
      rows.push([maNV, hoTen, maCC, ca]);
    }
  }
  cachePutChunked_(cache, rows);
  return { rows: rows, fromCache: false };
}

// Tìm cột theo tiêu đề; nếu không thấy thì dùng đúng thứ tự cũ A:MaNV B:HoTen C:MaChamCong D:CaLamViec
function findColumns_(header) {
  const col = { maNV: 0, hoTen: 1, maCC: 2, ca: 3 };
  const h = header.map(x => normalizeText(x).replace(/\s+/g, ''));
  const pick = (names, fallback) => {
    for (let i = 0; i < h.length; i++) if (names.indexOf(h[i]) >= 0) return i;
    return fallback;
  };
  col.maNV = pick(['manv', 'manhanvien'], 0);
  col.hoTen = pick(['hoten', 'tennhanvien', 'ten'], 1);
  col.maCC = pick(['machamcong', 'macc'], 2);
  col.ca = pick(['calamviec', 'ca'], 3);
  return col;
}

function cacheGetChunked_(cache) {
  try {
    const meta = cache.get(CACHE_KEY + '_N');
    if (!meta) return null;
    const n = parseInt(meta, 10);
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(CACHE_KEY + '_' + i);
    const got = cache.getAll(keys);
    let json = '';
    for (let i = 0; i < n; i++) { if (got[keys[i]] == null) return null; json += got[keys[i]]; }
    return JSON.parse(json);
  } catch (e) { return null; }
}

function cachePutChunked_(cache, rows) {
  try {
    const json = JSON.stringify(rows);
    const n = Math.ceil(json.length / CACHE_CHUNK) || 1;
    const obj = {};
    for (let i = 0; i < n; i++) obj[CACHE_KEY + '_' + i] = json.substr(i * CACHE_CHUNK, CACHE_CHUNK);
    obj[CACHE_KEY + '_N'] = String(n);
    cache.putAll(obj, CACHE_SECONDS);
  } catch (e) { /* bỏ qua: không cache được thì lần sau đọc lại Sheet */ }
}

function lamMoiCacheNhanVien() {
  const cache = CacheService.getScriptCache();
  const n = parseInt(cache.get(CACHE_KEY + '_N') || '0', 10);
  const keys = [CACHE_KEY + '_N'];
  for (let i = 0; i < Math.max(n, 5); i++) keys.push(CACHE_KEY + '_' + i);
  cache.removeAll(keys);
  return 'Đã xóa cache danh sách nhân viên.';
}

function findDuplicates_(rows) {
  const seenNV = {}, seenCC = {}, out = [];
  rows.forEach((r, i) => {
    const a = normalizeCode(r[0]), b = normalizeCode(r[2]);
    if (a) { if (seenNV[a]) out.push('Mã nhân viên ' + r[0] + ' (dòng ' + (i + 2) + ')'); else seenNV[a] = 1; }
    if (b) { if (seenCC[b]) out.push('Mã chấm công ' + r[2] + ' (dòng ' + (i + 2) + ')'); else seenCC[b] = 1; }
  });
  return out;
}

/* ===================== TRA CỨU TỪ VĂN BẢN OCR ===================== */

function traCuuNhanVien(payload) {
  try {
    // Gộp mọi bằng chứng: văn bản OCR + các ô người dùng đã gõ/sửa
    const raw = [payload.rawText, payload.hoTen,
      [payload.maNV, payload.maChamCong ? '(' + payload.maChamCong + ')' : ''].join(' ')].join('\n');
    let data = loadEmployees_(false);
    let res = matchEmployees_(data.rows, raw);
    // Không chắc chắn mà đang dùng cache -> đọc lại Sheet mới nhất rồi dò lần nữa (nhân viên mới thêm)
    if (!res.confident && data.fromCache) {
      data = loadEmployees_(true);
      res = matchEmployees_(data.rows, raw);
    }
    return res;
  } catch (err) {
    return { found: false, confident: false, error: err.message || String(err) };
  }
}

function matchEmployees_(rows, rawText) {
  const ev = extractEvidence_(rawText);
  const parsed = guessParsed_(ev);
  const scored = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const e = { maNV: r[0], hoTen: r[1], maChamCong: r[2], caLamViec: r[3] };
    const cNV = canonCode(r[0]), cCC = canonCode(r[2]);
    let score = 0; const reasons = [];

    if (cNV.length >= 4) {
      if (cNV.length >= 5 && ev.squash.indexOf(cNV) >= 0) { score += 60; reasons.push('maNV'); }
      else if (ev.codeTokens.indexOf(cNV) >= 0) { score += 60; reasons.push('maNV'); }
      else if (cNV.length >= 5 && ev.codeTokens.some(t => within_(t, cNV, 1))) { score += 40; reasons.push('maNV~'); }
    }
    if (cCC.length >= 3) {
      if (ev.bracketNums.indexOf(cCC) >= 0) { score += 30; reasons.push('maCC'); }
      else if (cCC.length >= 4 && ev.bracketNums.some(n => within_(n, cCC, 1))) { score += 15; reasons.push('maCC~'); }
      else if (ev.plainNums.indexOf(cCC) >= 0) { score += 12; reasons.push('maCC?'); }
    }
    const ns = nameScore_(ev, r[1]);
    if (ns > 0) { score += ns; reasons.push('hoTen'); }

    if (score >= SCORE_SUGGEST) scored.push({ e: e, score: score, reasons: reasons });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0], second = scored[1];
  const candidates = scored.slice(0, 3).map(s => Object.assign({}, s.e, { score: s.score, reasons: s.reasons }));

  // Xung đột: mã NV khớp người A nhưng mã chấm công (trong ngoặc) khớp người B
  const exNV = scored.find(s => s.reasons.indexOf('maNV') >= 0);
  const exCC = scored.find(s => s.reasons.indexOf('maCC') >= 0);
  if (exNV && exCC && exNV.e.maNV !== exCC.e.maNV &&
      exNV.reasons.indexOf('maCC') < 0 && exCC.reasons.indexOf('maNV') < 0) {
    return { found: false, confident: false, conflict: true, parsed: parsed,
      candidates: [exNV, exCC].map(s => Object.assign({}, s.e, { score: s.score, reasons: s.reasons })),
      error: 'Mã nhân viên và mã chấm công đang trỏ đến hai nhân viên khác nhau. Vui lòng chọn đúng người hoặc kiểm tra lại.' };
  }
  if (best && best.score >= SCORE_CONFIDENT && (!second || best.score - second.score >= SCORE_MARGIN)) {
    return Object.assign({ found: true, confident: true, score: best.score, reasons: best.reasons, parsed: parsed, candidates: candidates }, best.e);
  }
  return { found: false, confident: false, parsed: parsed, candidates: candidates };
}

/* ---------- Trích bằng chứng từ văn bản OCR ---------- */

function extractEvidence_(rawText) {
  const text = String(rawText || '').toUpperCase().slice(0, 12000);
  const lines = text.split(/\r?\n/);
  const codeTokens = [], bracketNums = [], plainNums = [], nameLines = [];
  const add = (arr, v) => { if (v && arr.indexOf(v) < 0) arr.push(v); };

  lines.forEach(line => {
    const toks = line.split(/[\s()\[\]{}<>|,;:!?"'`~*_=+\\\/]+/).filter(t => t.length >= 2);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i].replace(/[^A-Z0-9]/g, '');
      if (!t) continue;
      if (/^[A-Z0-9]{4,9}$/.test(t) && (/[0-9].*[0-9]/.test(t) || /^[A-Z]{2}[0-9OISBZGQDL]{3,5}$/.test(t))) add(codeTokens, canonCode(t));
      // mã bị tách: "HR 028", "PL 1305"
      const next = (toks[i + 1] || '').replace(/[^A-Z0-9]/g, '');
      if (/^[A-Z0-9]{1,3}$/.test(t) && /^[0-9OISBZGQDL]{3,5}$/.test(next)) add(codeTokens, canonCode(t + next));
      if (/^[0-9OISBZGQDL]{3,6}$/.test(t) && /[0-9]/.test(t)) add(plainNums, canonCode(t));
    }
    const re = /[(\[{<]\s*([0-9OISBZGQDL]{3,6})\s*[)\]}>]?/g;
    let m;
    while ((m = re.exec(line)) !== null) add(bracketNums, canonCode(m[1]));
    const f = foldText(line);
    const words = f.split(' ').filter(w => w.length >= 2);
    if (words.length >= 2) nameLines.push({ words: words, folded: f, raw: line });
  });
  // Các "bể từ" để dò tên: từng dòng, và 2 dòng ngắn liền nhau (tên bị xuống dòng)
  const pools = [];
  for (let i = 0; i < nameLines.length; i++) {
    pools.push(nameLines[i].words);
  }
  return { squash: canonCode(text), codeTokens: codeTokens.slice(0, 60), bracketNums: bracketNums.slice(0, 30),
    plainNums: plainNums.slice(0, 60), nameLines: nameLines, pools: pools, memo: pools.map(() => ({})) };
}

// Điểm tên: so từng từ của tên trong Sheet với từng dòng OCR (có nhớ kết quả theo từ để chạy nhanh)
function nameScore_(ev, hoTen) {
  const nw = foldText(hoTen).split(' ').filter(w => w.length >= 2);
  if (nw.length < 2) return 0;
  const total = nw.reduce((s, w) => s + w.length, 0);
  let best = 0;
  for (let pi = 0; pi < ev.pools.length; pi++) {
    const pool = ev.pools[pi], memo = ev.memo[pi];
    let matched = 0, cnt = 0;
    for (const w of nw) {
      let ok = memo[w];
      if (ok === undefined) {
        const tol = w.length >= 6 ? 2 : (w.length >= 4 ? 1 : 0);
        ok = pool.some(p => within_(p, w, tol));
        memo[w] = ok;
      }
      if (ok) { matched += w.length; cnt++; }
    }
    const cov = matched / total;
    if (cnt >= 2 && cov > best) best = cov;
  }
  if (best < 0.6) return 0;
  return best >= 0.99 ? 50 : Math.round(40 * best);
}

// Đoán nội dung để điền sẵn vào form khi chưa xác minh được
function guessParsed_(ev) {
  let maNV = '', maChamCong = '', hoTen = '';
  for (const t of ev.codeTokens) { const f = repairCode_(t); if (f) { maNV = f; break; } }
  if (ev.bracketNums.length) maChamCong = repairDigits_(ev.bracketNums[0]);
  const ignore = ['CONG TY', 'CO PHAN', 'LIWAYWAY', 'VIET NAM', 'CONG NHAN', 'SAN XUAT', 'VAN HANH', 'BAO BI',
    'NHAN VIEN', 'OFFICE', 'STAFF', 'NHAN SU', 'CAP LAN', 'SENIOR', 'MAY'];
  let bestLine = null, bestLen = 0;
  ev.nameLines.forEach(l => {
    const clean = l.raw.replace(/[^A-ZÀ-Ỹ\s]/gi, ' ').replace(/\s+/g, ' ').trim();
    const words = clean.split(' ').filter(w => w.length >= 2);
    if (words.length < 2 || words.length > 5) return;
    if (words.some(w => w.length > 7 || !/[AEIOUYÀ-Ỹ]/i.test(w))) return;
    if (ignore.some(k => l.folded.indexOf(k.toLowerCase()) >= 0)) return;
    const joined = words.join(' ');
    if (joined.length > bestLen) { bestLen = joined.length; bestLine = joined; }
  });
  if (bestLine) hoTen = bestLine;
  return { maNV: maNV, maChamCong: maChamCong, hoTen: hoTen };
}

const TO_LETTER = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z', '6': 'G' };
const TO_DIGIT = { 'O': '0', 'Q': '0', 'D': '0', 'I': '1', 'L': '1', 'S': '5', 'B': '8', 'Z': '2', 'G': '6' };
// Mã NV dạng 2 chữ + 3-5 số (VD PR7155, HR028, PL1305)
function repairCode_(t) {
  const s = String(t).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 5 || s.length > 7) return '';
  const head = s.substr(0, 2).split('').map(c => TO_LETTER[c] || c).join('');
  const tail = s.substr(2).split('').map(c => TO_DIGIT[c] || c).join('');
  return /^[A-Z]{2}$/.test(head) && /^\d{3,5}$/.test(tail) ? head + tail : '';
}
function repairDigits_(t) {
  const d = String(t).split('').map(c => TO_DIGIT[c] || c).join('');
  return /^\d{3,6}$/.test(d) ? d : '';
}

/* ---------- Tiện ích so khớp ---------- */

// Chuẩn hóa để chịu nhầm O/0, I/L/1, S/5, B/8, Z/2, G/6 (áp dụng cho cả Sheet lẫn OCR)
function canonCode(str) {
  return String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    .replace(/[OQD]/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5')
    .replace(/B/g, '8').replace(/Z/g, '2').replace(/G/g, '6');
}
function normalizeCode(str) { return String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim(); }
function normalizeText(str) {
  return String(str || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function foldText(str) { return normalizeText(str); }

// true nếu khoảng cách chỉnh sửa (Levenshtein) giữa a và b <= k
function within_(a, b, k) {
  if (a === b) return true;
  if (k <= 0) return false;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > k) return false;
  let prev = [], cur = [];
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i; let rowMin = cur[0];
    for (let j = 1; j <= lb; j++) {
      const c = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > k) return false;
    const t = prev; prev = cur; cur = t;
  }
  return prev[lb] <= k;
}

/* ===================== GHI CHẤM CÔNG ===================== */

// Tra cứu CHÍNH XÁC theo giá trị trên form (không dùng dò mờ) trước khi ghi
function lookupExact_(rows, maNV, maCC, hoTen) {
  const nNV = normalizeCode(maNV), nCC = normalizeCode(maCC), nName = foldText(hoTen);
  const toItem = r => ({ maNV: r[0], hoTen: r[1], maChamCong: r[2], caLamViec: r[3] });
  const byNV = nNV ? rows.find(r => normalizeCode(r[0]) === nNV) : null;
  const byCC = nCC ? rows.find(r => normalizeCode(r[2]) === nCC) : null;
  if (byNV && byCC && normalizeCode(byNV[0]) !== normalizeCode(byCC[0])) {
    return { found: false, conflict: true, error: 'Mã nhân viên và mã chấm công đang trỏ đến hai nhân viên khác nhau. Vui lòng kiểm tra lại.' };
  }
  let hit = byNV || byCC;
  if (!hit && !nNV && !nCC && nName) {
    const m = rows.filter(r => foldText(r[1]) === nName);
    if (m.length === 1) hit = m[0];
  }
  return hit ? Object.assign({ found: true }, toItem(hit)) : { found: false };
}

function ghiChamCong(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const maNV = String(payload.maNV || '').trim();
    const maCC = String(payload.maChamCong || '').trim();
    const hoTen = String(payload.hoTen || '').trim();
    if (!maNV && !maCC && !hoTen) throw new Error('Thiếu thông tin nhân viên.');
    // Luôn đối chiếu lại trên server; không tin cờ do trình duyệt gửi.
    let data = loadEmployees_(false);
    let lookup = lookupExact_(data.rows, maNV, maCC, hoTen);
    if (!lookup.found && !lookup.conflict && data.fromCache) {
      data = loadEmployees_(true);
      lookup = lookupExact_(data.rows, maNV, maCC, hoTen);
    }
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
      sheet.getRange(1, 1, 1, 7).setValues([['ThoiGian', 'MaNV', 'Hoten', 'Machamcong', 'CaLamViec', 'TrangThai', 'AnhChupURL']]);
    }
    const header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
    let imageCol = header.indexOf('AnhChupURL') + 1;
    if (!imageCol) { imageCol = header.length + 1; sheet.getRange(1, imageCol).setValue('AnhChupURL'); }
    const now = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd HH:mm:ss');
    const status = verified
      ? (String(payload.picked) === 'true' ? 'Đã đối chiếu Google Sheet (chọn từ gợi ý OCR)' : 'Đã đối chiếu Google Sheet')
      : 'XÁC NHẬN THỦ CÔNG - CHƯA XÁC MINH';
    const row = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(row, 1, 1, 6).setValues([[
      now, verified ? lookup.maNV : maNV, verified ? lookup.hoTen : hoTen, verified ? lookup.maChamCong : maCC,
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
