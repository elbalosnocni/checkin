# Github Check-in – bản tối ưu

## File
- `Code.gs`: Google Apps Script backend.
- `index.html`: giao diện GitHub Pages, camera và OCR.

## Cấu hình trước khi chạy
1. Mở Apps Script đang dùng cho web chấm công.
2. Thay toàn bộ nội dung `Code.gs` bằng file mới trong gói này.
3. Kiểm tra `SPREADSHEET_ID` đúng Google Sheet hiện tại.
4. Kiểm tra `DRIVE_FOLDER_ID` đang là `19vAyddEQZtNlfjgQO2wR-1MtzxFCrSLt` (thư mục Drive bạn cung cấp).
5. Lưu dự án. Chạy thủ công hàm `lamMoiCacheNhanVien` một lần (nếu được yêu cầu cấp quyền, chấp thuận quyền Google Sheets và Google Drive).
6. Vào **Deploy > Manage deployments > Edit** deployment Web app hiện tại, chọn **New version** rồi Deploy. Nếu Apps Script hỏi quyền Drive, cấp quyền cho đúng tài khoản sở hữu/chạy web app.
7. Thay `index.html` trên GitHub Pages bằng file mới. Đợi GitHub Pages cập nhật rồi tải lại trình duyệt (Ctrl+F5).

## Cách hoạt động
- Danh sách nhân viên được đọc theo 4 cột A:D của tab `DanhSachNV`; cache tối đa 60 giây để giảm truy cập Sheet.
- Ảnh camera được chụp ở kích thước tối đa 1280 px và nén JPEG trước khi gửi.
- Khi bấm **Xác nhận & Ghi chấm công**, Apps Script lưu ảnh vào thư mục Drive đã cấu hình và ghi URL ảnh vào cột có tiêu đề `AnhChupURL` của tab `ChamCong`. Nếu chưa có cột này, hệ thống thêm ở cuối bảng, không ghi đè cột đang có.
- Ảnh trong Drive kế thừa quyền chia sẻ của thư mục. Gói code không tự bật chia sẻ công khai.
- OCR dùng Tesseract.js tiếng Việt + tiếng Anh; worker được tái sử dụng trong phiên trang để tránh khởi tạo lại mỗi lần quét.

## Lưu ý
- Tài khoản thực thi Apps Script phải có quyền **Editor** đối với thư mục Drive đích.
- Chạy camera trên HTTPS (GitHub Pages đáp ứng điều kiện này).
- Lần OCR đầu tiên có thể lâu hơn vì trình duyệt phải tải mô hình ngôn ngữ; các lần sau trong cùng phiên thường nhanh hơn.
- Nếu không thấy ảnh trên Drive, kiểm tra quyền truy cập thư mục của tài khoản đang thực thi Web App và xem lỗi tại Apps Script > Executions.
- Cache danh sách nhân viên tự hết hạn sau 60 giây. Khi cần cập nhật ngay, chạy `lamMoiCacheNhanVien`.
