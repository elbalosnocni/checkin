GITHUB CHECK-IN – BẢN NÂNG CẤP

Nội dung gói
- Code.gs: Google Apps Script backend.
- index.html: giao diện GitHub Pages, camera và OCR.
- README-HUONG-DAN.txt: hướng dẫn cấu hình và triển khai.

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

CÁC THAY ĐỔI CHÍNH
1. Bỏ nút xoay thủ công. Khi quét, trình duyệt OCR lần lượt cả bốn hướng 0°, 90°, 180°, 270°; chọn kết quả có điểm nhận diện cao nhất, không dừng ngay khi vừa tìm thấy một mã.
2. Đối chiếu mã nhân viên và mã chấm công. Nếu hai mã khớp với hai người khác nhau, hệ thống báo xung đột và không tự chọn một người.
3. Nếu có mã nhưng không tìm thấy trong Sheet, không dùng tên OCR để ghi đè kết quả mã.
4. Cho phép xác nhận thủ công khi không tìm thấy nhân viên. Giao diện hiển thị cảnh báo và yêu cầu người dùng xác nhận. Backend tự tra cứu lại; bản ghi được gắn trạng thái "XÁC NHẬN THỦ CÔNG - CHƯA XÁC MINH".
5. Backend không tin cậy cờ foundInList từ trình duyệt; tự đối chiếu lại trước khi ghi.
6. Thêm endpoint kiểm tra cấu hình: mở URL Web App với ?action=health để xem Apps Script có mở được Spreadsheet, tab DanhSachNV và thư mục Drive hay không.
7. Phát hiện và trả cảnh báo mã nhân viên/mã chấm công trùng trong danh sách.

CÁCH TRIỂN KHAI
1. Mở đúng dự án Google Apps Script đang gắn với Web App.
2. Thay toàn bộ Code.gs bằng Code.gs trong gói này, lưu lại.
3. Trong Apps Script, chọn hàm lamMoiCacheNhanVien và chạy một lần. Chấp thuận quyền Sheets và Drive nếu được hỏi.
4. Chọn hàm kiemTraCauHinh và chạy để kiểm tra. Nếu báo lỗi openById, xác minh ID và quyền truy cập.
5. Deploy > Manage deployments > Edit > chọn New version > Deploy. Nếu dùng URL deployment cũ, giữ nguyên URL Web App hiện tại.
6. Thay index.html trên GitHub Pages bằng file trong gói, commit/push và chờ Pages cập nhật.
7. Mở URL Web App thêm ?action=health (hoặc &action=health nếu URL đã có tham số). Kết quả success:true là điều kiện cần trước khi kiểm thử toàn bộ luồng.
8. Tải lại GitHub Pages, cấp quyền camera, thử các thẻ mẫu và kiểm tra bản ghi trong ChamCong cùng ảnh trong thư mục Drive.

QUY TRÌNH SỬ DỤNG
- Bấm Bật Camera.
- Đặt thẻ trong khung và bấm Chụp & Đọc Thẻ.
- Hệ thống thử 4 hướng ảnh, hiển thị thông tin OCR và kết quả tra cứu.
- Nếu tra cứu được nhân viên, kiểm tra lại tên, mã và ca trước khi xác nhận.
- Nếu không tìm thấy, người dùng có thể sửa thông tin. Khi bấm xác nhận, ứng dụng hỏi xác nhận thủ công và ghi trạng thái CHƯA XÁC MINH.
- Nếu mã nhân viên và mã chấm công mâu thuẫn, backend từ chối ghi để tránh ghi nhầm người.

GIỚI HẠN / KIỂM THỬ
- OCR vẫn có thể đọc sai do ảnh mờ, lóa, thẻ nhỏ hoặc font in; cần kiểm tra thông tin trước khi chấm công.
- Xác nhận thủ công là cơ chế ngoại lệ, không có nghĩa là danh tính đã được xác thực.
- Bốn hướng OCR tăng khả năng đọc thẻ xoay ngang/dọc nhưng có thể làm thời gian quét lâu hơn.
- Gói mã nguồn không thể tự sửa quyền Google Sheet/Drive hoặc xác minh ID khi chưa có quyền truy cập file thực tế.
- Nên thử trước với bản sao dữ liệu hoặc một số bản ghi kiểm thử.


CẢI TIẾN ỔN ĐỊNH OCR
- So sánh kết quả 4 hướng bằng confidence của Tesseract, cộng điểm có kiểm soát cho các trường mã và tên.
- Không chỉ chọn góc đầu tiên có chuỗi giống mã.
- Chấp nhận một số khoảng trắng/dấu chấm/dấu gạch OCR chèn giữa mã.
- Nếu không đọc được mã ở cả bốn hướng, yêu cầu chụp lại thay vì đoán.
- OCR vẫn phụ thuộc độ nét, ánh sáng, lóa và kích thước thẻ; cần thử nghiệm với thẻ thực tế.
