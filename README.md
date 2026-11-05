# CHECK-IN TIỆC V3 — QR Token + Quản trị

Kiến trúc giữ nguyên: **GitHub Pages (giao diện) + Google Apps Script (API) + Google Sheets (danh sách/log) + Google Drive (ảnh selfie)**.

## 1. Chức năng
- Mỗi nhân viên có một QR riêng chứa token ngẫu nhiên 48 ký tự; URL không chứa mã nhân viên.
- Token được tra cứu tại máy chủ. Token có thể khóa hoặc cấp lại từ trang quản trị; cấp lại làm QR cũ mất hiệu lực.
- Điểm danh bằng selfie từ camera trước điện thoại, nén JPEG và lưu Drive.
- Chống điểm danh trùng trong cùng ngày; `LockService` tuần tự hóa các lượt gửi đồng thời.
- Chỉ hiển thị thành công sau khi Apps Script xác nhận đã lưu ảnh và ghi Sheet.
- Quản trị: đăng nhập PIN, thống kê, tìm kiếm/lọc, xem ảnh, tạo/tải QR, khóa/mở QR, cấp lại token, xuất CSV.
- Lưu lịch sử thành công trong `CHECKIN_LOG`; cột E/F của danh sách tiếp tục chứa thời gian và link ảnh lần điểm danh mới nhất.

## 2. Cấu trúc Google Sheets
Tab danh sách nhân viên hiện có:
- A: Mã nhân viên (giữ dạng văn bản nếu có số 0 đầu)
- B: Họ tên
- E: Thời gian điểm danh gần nhất
- F: Link ảnh selfie gần nhất

Tab tự tạo `QR_TOKENS`: MaNV, HoTen, QR_TOKEN, TRANG_THAI_QR (`ACTIVE` hoặc `LOCKED`). Tab này được ẩn cột token/trạng thái và bảo vệ vùng dữ liệu; danh sách nhân viên gốc không bị chèn/ghi đè thêm cột.

Tab tự tạo `CHECKIN_LOG`: RequestID, MaNV, HoTen, ThoiGian, DriveFileID, AnhURL, TrangThai, GhiChu. Cấu trúc này tương thích với log của bản V2 trước đó.

**Quan trọng:** Trong `Code.gs`, nên điền chính xác tên tab danh sách vào `EMPLOYEE_SHEET_NAME`. Nếu để trống, hệ thống chọn tab đầu tiên không phải `QR_TOKENS` hoặc `CHECKIN_LOG`; nếu file có nhiều tab nghiệp vụ, hãy điền tên chính xác để tránh chọn nhầm.

## 3. Cài đặt Apps Script
1. Mở đúng Google Sheet danh sách nhân viên → Extensions → Apps Script.
2. Thay toàn bộ `Code.gs` bằng file trong ZIP.
3. Kiểm tra `SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, `EMPLOYEE_SHEET_NAME`.
4. Trong Apps Script → **Project Settings** → **Script Properties**, thêm:
   - Property: `CHECKIN_ADMIN_PIN`
   - Value: PIN quản trị ngẫu nhiên, tối thiểu 6 ký tự (khuyến nghị 10–16 ký tự).
   Không ghi PIN vào `index.html`, GitHub hoặc source code.
5. Chạy `setupCheckinV3()` bằng tài khoản chủ sở hữu và cấp quyền Sheets/Drive. Hàm tạo tab `QR_TOKENS`, cấp token cho nhân viên chưa có token, đặt trạng thái ACTIVE, tạo log, ẩn và bảo vệ cột C:D trong tab token. Chạy lại không đổi token đã có.
6. Kiểm tra múi giờ Apps Script là `Asia/Ho_Chi_Minh`.
7. Deploy → Manage deployments → Edit deployment hiện có → chọn **New version** để giữ nguyên URL `/exec` đã có trong `index.html`. Nếu tạo deployment hoàn toàn mới và URL thay đổi, phải cập nhật `API_URL` trong `index.html`. Cấu hình Web app:
   - Execute as: **Me**
   - Who has access: **Anyone** (hoặc phạm vi Workspace nếu mọi nhân viên đều đăng nhập Workspace được phép).
8. Copy URL Web App kết thúc bằng `/exec`.

## 4. Cài đặt GitHub Pages
1. `index.html` đã điền sẵn URL Web App cũ lấy từ bộ gốc. Nếu bạn giữ nguyên deployment ID và chỉ cập nhật New version, không cần sửa. Nếu URL `/exec` thay đổi, cập nhật `API_URL` bằng URL mới.
2. `PUBLIC_PAGE_URL` trong `Code.gs` đã đặt theo địa chỉ cũ `https://elbalosnocni.github.io/checkin/`; nếu repo Pages thực tế khác, hãy sửa lại đúng URL và có dấu `/` cuối.
3. Deploy Apps Script **version mới** sau khi cập nhật `PUBLIC_PAGE_URL`.
4. Đưa `index.html` lên GitHub Pages.
5. Mở trang công khai và bấm liên kết **Dành cho quản trị viên** ở đầu trang; hệ thống yêu cầu nhập PIN. Có thể mở trực tiếp `https://TEN-ACCOUNT.github.io/TEN-REPO/?admin=1&login=1` khi cần.
6. Đăng nhập PIN. Trang quản trị đọc danh sách token và tạo QR riêng cho từng nhân viên. Có thể bấm **QR** để tải ảnh từng người hoặc **Xuất CSV** để trộn/in hàng loạt bằng phần mềm QR phù hợp.

## 5. Quy trình vận hành
- QR cũ dạng `?id=MA_NV` không còn được chấp nhận; phải tạo QR mới từ trang quản trị với tham số `?t=TOKEN`.
- In và phát QR cá nhân cho đúng nhân viên. Không đăng CSV hoặc ảnh QR lên nơi công khai.
- Nhân viên dùng camera điện thoại quét QR, trang mở bằng HTTPS, cho phép camera, chụp selfie và xác nhận.
- Quản trị theo dõi số đã đến/chưa đến; ảnh mở qua quyền Drive của tài khoản được cấp quyền.
- Nếu QR bị lộ: vào quản trị → Cấp lại. Token cũ lập tức mất hiệu lực.
- Nếu nhân viên nghỉ/không được tham dự: Khóa QR. Mở lại khi cần.

## 6. Lưu ý bảo mật và giới hạn
- QR token là **mã bí mật dạng bearer**: ai giữ QR có thể mở check-in. Token chống sửa mã nhân viên nhưng không tự chứng minh người cầm điện thoại là đúng nhân viên. Để chống điểm danh hộ ở mức cao hơn, cần thêm đối chiếu danh tính tại cổng hoặc xác minh thủ công ảnh với người đến.
- Tab `QR_TOKENS` được ẩn cột C:D và bảo vệ vùng đó, nhưng người có quyền Editor vẫn có thể có cách truy cập/hiện dữ liệu. Chỉ cấp quyền Editor Google Sheet cho người tin cậy; không xem ẩn cột là biện pháp bảo mật tuyệt đối.
- Apps Script Web App công khai cần được bảo vệ bằng token và giới hạn dung lượng ảnh. PIN quản trị không được đặt trong URL.
- `once` hiện được hiểu là **một lần/ngày** theo ngày của múi giờ Apps Script. Nếu cần một lần duy nhất cho toàn bộ sự kiện nhiều ngày, cần đổi quy tắc sang event-level.
- Ảnh Drive giữ quyền chia sẻ hiện tại của thư mục; không tự bật “Anyone with link”. Quản trị viên phải có quyền xem thư mục Drive.
- Thư viện QR được tải từ cdnjs; giao diện tạo QR cần Internet. Check-in vẫn cần Internet để gọi Apps Script.
- CSV chứa QR token, phải lưu/chia sẻ như tài liệu mật. Xóa file CSV sau khi in/phát QR.

## 7. Kiểm thử trước ngày tiệc
1. Dùng 2 nhân viên thử nghiệm và 2 điện thoại khác nhau.
2. Thử QR hợp lệ, QR sai, QR đã khóa, token vừa cấp lại.
3. Thử cùng nhân viên gửi 2 lần liên tiếp và 2 thiết bị gửi gần như đồng thời: chỉ một lượt thành công.
4. Thử từ chối quyền camera, mất mạng, ảnh quá lớn, Drive hết quyền.
5. Xác nhận ảnh thực sự có trong Drive, cột E/F được ghi, `CHECKIN_LOG` có đúng một dòng thành công.
6. Kiểm tra CSV, QR tải về và quyền xem ảnh từ tài khoản quản trị.


## 8. Các cập nhật bổ sung trong bản nâng cấp

### Đồng bộ nhân viên mới
- Mỗi lần admin mở/tải lại bảng điều khiển, máy chủ đối chiếu danh sách nhân viên với `QR_TOKENS`.
- Mã nhân viên chưa có token sẽ được tự cấp token mới và trạng thái `ACTIVE`.
- Token và trạng thái QR của nhân viên đã tồn tại được giữ nguyên. Tên được cập nhật theo danh sách nhân viên.

### Giới hạn giờ điểm danh
Trong Apps Script → Project Settings → Script Properties, cấu hình:
- `CHECKIN_START_TIME` = giờ bắt đầu, định dạng `HH:mm`.
- `CHECKIN_END_TIME` = giờ kết thúc, định dạng `HH:mm`.

Mặc định nếu chưa cấu hình: `08:00` đến `22:00` (giờ máy chủ Apps Script, cần đặt timezone `Asia/Ho_Chi_Minh`). Hỗ trợ khung giờ qua đêm, ví dụ `20:00` đến `02:00`. Giao diện đọc khung giờ từ máy chủ để thông báo/chặn thao tác; máy chủ tự kiểm tra lại trước khi lưu nên không thể bỏ qua bằng cách sửa JavaScript trên trình duyệt.

### Admin chụp ảnh thay nhân viên
- Trong bảng nhân viên, chọn **Chụp thay**.
- Cho phép camera, chụp và xác nhận. Yêu cầu gửi lên máy chủ gồm session admin và mã nhân viên đang chọn.
- Ảnh lưu Drive; cột E:F và `CHECKIN_LOG` ghi đúng mã nhân viên.
- Áp dụng giới hạn giờ và chống điểm danh trùng trong ngày giống lượt tự điểm danh.

### Hủy lượt điểm danh nhưng giữ lịch sử
- Chọn **Hủy lượt** ở dòng nhân viên đã điểm danh.
- Máy chủ chuyển `CHECKIN_LOG.TrangThai` từ `SUCCESS` sang `VOIDED`, ghi chú `ADMIN_VOIDED`.
- Không xóa dòng log và không xóa file ảnh trên Drive. Cột E:F chỉ được xóa nếu lượt bị hủy vẫn là lượt mới nhất đang hiển thị trên danh sách.
- Nếu cần điểm danh lại trong ngày, admin hủy lượt cũ rồi thực hiện chụp thay; nhân viên cũng có thể điểm danh lại nếu còn trong khung giờ và QR hợp lệ.

### Loading và đường dẫn
- Trang admin có overlay loading khi tải dữ liệu, đăng nhập và thực hiện thao tác cập nhật.
- Dashboard chỉ còn liên kết mở trang điểm danh công khai; không hiển thị URL quản trị.
- Trang công khai có liên kết **Dành cho quản trị viên**; liên kết này buộc đăng nhập lại PIN kể cả khi trình duyệt còn phiên cũ.
- Đường dẫn trang công khai vẫn lấy từ `PUBLIC_PAGE_URL` trong `Code.gs`.

### Cập nhật triển khai
1. Thay `Code.gs` trong Apps Script bằng bản mới và lưu.
2. Thêm Script Properties khung giờ nếu muốn dùng khung giờ khác mặc định.
3. Deploy → Manage deployments → Edit → New version.
4. Đưa `index.html` mới lên GitHub Pages.
5. Kiểm tra admin tự đồng bộ nhân viên mới, thử ngoài/trong khung giờ, chụp thay, hủy lượt và kiểm tra `CHECKIN_LOG`/Drive.


### Cấu hình giới hạn ngày ngay trong Dashboard Admin
- Dashboard có mục **Cấu hình thời gian điểm danh** với ngày bắt đầu, ngày kết thúc, giờ bắt đầu và giờ kết thúc.
- Ngày bắt đầu/kết thúc là tùy chọn; để trống một phía nghĩa là không giới hạn phía đó. Nếu cả hai để trống thì chỉ áp dụng giới hạn giờ.
- Ngày bắt đầu và ngày kết thúc đều được tính bao gồm. Ví dụ 2026-12-01 đến 2026-12-03 cho phép điểm danh trong cả ba ngày.
- Nhấn **Lưu giới hạn**. Cấu hình được lưu trong Script Properties và được máy chủ kiểm tra lại mỗi lần nhận điểm danh (cả nhân viên tự điểm danh và admin chụp thay).
- Có thể xóa một giới hạn ngày bằng cách xóa giá trị ngày tương ứng rồi nhấn Lưu giới hạn.
- Không cần sửa Script Properties thủ công cho ngày nữa. Giờ cũng có thể thay đổi ngay tại dashboard.

### Sửa lỗi định dạng ngày và truy cập quản trị
- Ngày bắt đầu/kết thúc nhập bằng văn bản theo đúng `YYYY-MM-DD`; để trống nếu không giới hạn.
- Giao diện và máy chủ kiểm tra cả định dạng lẫn ngày lịch hợp lệ (bao gồm năm nhuận), đồng thời không cho ngày bắt đầu sau ngày kết thúc.
- Sửa regex ở `getCheckinWindow_()` vốn khiến ngày ISO đã lưu bị nhận nhầm là sai định dạng khi tải lại cấu hình.
- Liên kết quản trị được chuyển khỏi Dashboard sang trang công khai và luôn yêu cầu nhập lại PIN.
