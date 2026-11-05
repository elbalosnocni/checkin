# checkin
Copy công thức dưới đây dán vào ô D2 trong Google Sheets (sau đó kéo xuống cho các nhân viên khác):
="https://googleapis.com"&ENCODEURL("https://elbalosnocni.github.io/checkin/?id="&A2)
="https://googleapis.com" & ENCODEURL("LINK_GITHUB_PAGES_CỦA_BẠN?id=" & A2)
(Ví dụ link github: https://github.io)

* Lưu ý: Thay chữ ĐƯỜNG_DẪN_WEB_APP_CỦA_BẠN bằng liên kết URL bạn nhận được sau khi bấm "Triển khai (Deploy)" trong Apps Script. Ký tự ?id= ở cuối cùng phải được giữ nguyên.
