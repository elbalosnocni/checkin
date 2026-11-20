GITHUB CHECK-IN – BẢN NÂNG CẤP V4 (TỐI ƯU NHẬN DIỆN THẺ)

Nội dung gói
- Code.gs: Google Apps Script backend (dò nhân viên + ghi chấm công).
- index.html: giao diện GitHub Pages, camera và OCR.
- README-HUONG-DAN.txt: file này.

CẤU HÌNH ĐANG GIỮ THEO BẢN CŨ
- SPREADSHEET_ID: 1vBk4eHERPAQcAe3OLCGtwk5PlGRy1YIi3JHyFPe9-3M
- Tab danh sách: DanhSachNV
- Tab chấm công: ChamCong
- DRIVE_FOLDER_ID: 19vAyddEQZtNlfjgQO2wR-1MtzxFCrSLt
- Múi giờ: Asia/Ho_Chi_Minh

LƯU Ý QUAN TRỌNG VỀ LỖI SPREADSHEET
Bạn chọn dùng lại Google Sheet cũ, vì vậy gói này giữ nguyên ID cũ. Tuy nhiên, ảnh chụp màn hình đã báo:
"Illegal spreadsheet id or key: 1vBk4eHERPAQcAe3OLCGtwk5PlGRy1YIi3JHyFPe9-3M"
Không thể khẳng định chỉ bằng mã nguồn rằng ID này hợp lệ hay tài khoản Apps Script có quyền. Nếu ID thực sự sai hoặc tài khoản triển khai không được chia sẻ quyền, ứng dụng vẫn không thể tra cứu/ghi vào Sheet. Hãy xác nhận ID từ URL Google Sheet và cấp quyền Editor cho tài khoản đang chạy Apps Script trước khi triển khai.

CẤU TRÚC GOOGLE SHEET
Tab DanhSachNV phải có dữ liệu từ dòng 2, đúng thứ tự:
A: MaNV
B: HoTen
C: MaChamCong
D: CaLamViec

Tab ChamCong sẽ được tạo tự động nếu chưa có. Các cột ghi:
ThoiGian, MaNV, Hoten, Machamcong, CaLamViec, TrangThai, AnhChupURL.
Nếu tab đã tồn tại, code tìm cột AnhChupURL theo tiêu đề; nếu chưa có sẽ thêm cột ở cuối.

NGUYÊN NHÂN "LÚC ĐỌC ĐƯỢC LÚC KHÔNG" (đã kiểm tra trên ảnh 3 loại thẻ PL / HR / PR)
1. Chữ TRẮNG trên dải đỏ đậm (mã PL1305, PR7155) và chữ ĐEN trên nền trắng (mã HR028) cần 2 cách xử lý ảnh ngược nhau. Bản cũ chỉ dùng 1 cách.
2. Bản cũ xử lý ảnh bằng ctx.filter: iPhone/Safari không hỗ trợ nên bị bỏ qua hoàn toàn.
3. Ảnh bị thu nhỏ còn 1280 px nên mã nhỏ trên thẻ bị mờ.
4. OCR hay nhầm O/0, I/1, S/5, B/8, hoặc đọc thiếu 1 ký tự (VD "HRO28 (542M)"); bản cũ đòi khớp tuyệt đối nên trượt.
5. Tên có dấu tiếng Việt bị đọc sai ("NGNEN WHAT AOC"); bản cũ chỉ lấy 1 dòng tên và so khớp gần như tuyệt đối.
6. Danh sách nhân viên quá lớn thì không vào được cache (giới hạn 95KB) nên mỗi lần quét phải đọc lại Sheet, chậm và dễ timeout.

CÁC THAY ĐỔI CHÍNH
Giao diện (index.html)
- Chụp ở độ phân giải camera (tối đa 1920 px), bật lấy nét liên tục nếu máy hỗ trợ.
- Tự xử lý ảnh bằng cân bằng tương phản cục bộ trên kênh xanh lá (chạy được trên mọi trình duyệt), mỗi hướng đọc 2 lần: chữ tối và chữ sáng.
- Thử hướng 0° -> 90° -> 270° -> 180°; DỪNG NGAY khi server dò ra nhân viên chắc chắn (trường hợp thường chỉ mất 1 hướng, nhanh hơn bản cũ luôn đọc đủ 4 hướng).
- Chỉ dùng OCR tiếng Anh (nhanh hơn, ít nhầm hơn vie+eng; tên được so khớp không dấu).
- Khi chưa chắc chắn: hiện tối đa 3 gợi ý nhân viên để bấm chọn, không bắt gõ tay.
Máy chủ (Code.gs)
- Dò theo ĐIỂM từ cả 3 thông tin: mã nhân viên (khớp hoàn toàn 60đ, lệch 1 ký tự 40đ), mã chấm công trong ngoặc (30đ), họ tên (tối đa 50đ, chịu được sai chính tả/mất dấu). Chịu nhầm O/0, I/L/1, S/5, B/8, Z/2, G/6.
- Chỉ tự điền khi đủ điểm VÀ hơn người thứ hai rõ ràng; ngược lại trả về danh sách gợi ý. Mã NV và mã chấm công trỏ về 2 người khác nhau thì báo xung đột như cũ.
- Đọc cột theo TIÊU ĐỀ (MaNV, HoTen, MaChamCong, CaLamViec); không thấy tiêu đề thì dùng đúng thứ tự cột A-D như cũ.
- Cache danh sách nhân viên theo từng khúc (không còn giới hạn 95KB), giữ 5 phút; nếu không dò chắc chắn thì tự đọc lại Sheet mới nhất rồi dò lần nữa (nhân viên mới thêm).
- Khi ghi chấm công: đối chiếu CHÍNH XÁC theo mã/tên trên form, và ghi tên/mã/ca đúng theo Google Sheet. Bản ghi chọn từ gợi ý có trạng thái "Đã đối chiếu Google Sheet (chọn từ gợi ý OCR)".
- Tra cứu chuyển sang POST (văn bản OCR dài không còn vướng giới hạn độ dài URL). GET ?action=lookup vẫn dùng được.
- ?action=health giờ trả thêm số nhân viên và cảnh báo mã trùng.

CÁCH TRIỂN KHAI
1. Mở đúng dự án Google Apps Script đang gắn với Web App.
2. Thay toàn bộ Code.gs bằng Code.gs trong gói này, lưu lại.
3. Chạy hàm lamMoiCacheNhanVien một lần (chấp thuận quyền nếu được hỏi), rồi chạy kiemTraCauHinh.
4. Deploy > Manage deployments > Edit > New version > Deploy (giữ nguyên URL Web App).
5. Thay index.html trên GitHub Pages bằng file trong gói, commit/push và chờ Pages cập nhật.
6. Mở URL Web App thêm ?action=health, cần thấy success:true.
7. Tải lại trang (Ctrl+F5 / xóa cache trình duyệt), thử lần lượt 3 loại thẻ.

MẸO KHI QUÉT
- Đưa thẻ lại gần để mã nhân viên và tên chiếm rõ trong khung, giữ thẻ phẳng, tránh bóng lóa của vỏ nhựa (thẻ HR trong bao nhựa dễ bị lóa).
- Nếu hiện danh sách gợi ý: chọn đúng người hoặc chụp lại.

GIỚI HẠN
- OCR vẫn có thể sai khi ảnh mờ hoặc lóa nặng; luôn kiểm tra tên, mã trước khi bấm ghi.
- Xác nhận thủ công là cơ chế ngoại lệ, không có nghĩa là danh tính đã được xác thực.
- Các ngưỡng điểm có thể chỉnh ở đầu Code.gs: SCORE_CONFIDENT (50), SCORE_MARGIN (15), SCORE_SUGGEST (30).
