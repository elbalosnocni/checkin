# HE THONG CHECK-IN TIEC - GitHub Pages + Google Apps Script

## 1. Chuc nang
- QR mo trang GitHub Pages voi tham so `?id=MA_NHAN_VIEN`.
- Trang yeu cau quyen camera, chup selfie va nen anh JPEG.
- Gui anh den Google Apps Script, luu anh vao Google Drive.
- Ghi thoi gian va URL anh vao cot E/F cua sheet danh sach.
- Tao tab `CHECKIN_LOG` de luu lich su giao dich va ma yeu cau.
- Kiem tra trang thai tu may chu bang JSONP; khong hien thi thanh cong chi dua tren fetch `no-cors`.
- Chan diem danh trung trong cung ngay (co the thay doi trong CONFIG).

## 2. Cau truc Google Sheets
Tab danh sach nhan vien (mac dinh la tab dang active khi chay setup):
- Cot A: Ma nhan vien
- Cot B: Ho ten
- Cot E: Thoi gian diem danh
- Cot F: Link anh selfie
- Dong 1 la tieu de, du lieu tu dong 2.

Neu tab danh sach co ten co dinh, dien `EMPLOYEE_SHEET_NAME` trong `Code.gs`.

## 3. Cai dat Apps Script
1. Mo Google Sheet danh sach nhan vien > Extensions > Apps Script.
2. Thay toan bo `Code.gs` bang file trong goi nay.
3. Kiem tra `SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, `EMPLOYEE_SHEET_NAME`.
4. Chay ham `setupCheckin` mot lan va cap quyen truy cap Sheets/Drive.
5. Deploy > New deployment > Web app.
6. Execute as: Me. Who has access: Anyone (hoac Anyone trong pham vi Workspace neu to chuc gioi han).
7. Deploy va cap nhat URL `/exec` trong `index.html`.
8. Moi lan sua Apps Script, tao version deployment moi (Deploy > Manage deployments > Edit > New version).

## 4. Cai dat GitHub Pages va QR
- Dua `index.html` len repository GitHub Pages.
- Link QR cho moi nhan vien: `https://TEN_TAI_KHOAN.github.io/TEN_REPO/?id=MA_NV`.
- Cong thuc Google Sheets (doi URL GitHub Pages va cot ma nhan vien A2):

`=HYPERLINK("https://TEN_TAI_KHOAN.github.io/TEN_REPO/?id="&ENCODEURL(A2),"Mở check-in")`

Dung URL trang GitHub Pages truc tiep trong QR; khong can ghep them `googleapis.com`.

## 5. Luu y van hanh va bao mat
- Ban nay tuong thich voi QR chua ma nhan vien (`id`). Ma nhan vien tren URL co the bi sua/chia se, nen day chua phai xac thuc danh tinh manh. Neu can chong diem danh ho, can nang cap QR co token rieng/ma mot lan va quy trinh xac thuc bo sung.
- Web app `Anyone` cho phep truy cap endpoint cong khai; khong dua thong tin nhay cam vao URL. Nen gioi han dung luong anh va thu nghiem tai khoan Drive/Sheet truoc su kien.
- Chuc nang chan trung dua tren cot E: neu cot E da co thoi gian trong ngay hien tai, nhan vien se bi tu choi diem danh tiep. Neu cot E duoc dung cho muc dich khac, can doi cot cau hinh.
- `CHECKIN_LOG` ghi lich su cac lan duoc xu ly thanh cong; anh duoc luu trong thu muc Drive da cau hinh. Link Drive khong tu dong cong khai; nguoi xem can co quyen truy cap Drive.
- Kiem tra lai timezone cua Apps Script (Project Settings) theo mui gio su dung tai su kien.
