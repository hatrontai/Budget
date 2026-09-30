# Sổ chi tiêu trên GitHub Pages và Google Drive

Ứng dụng web tĩnh để ghi khoản chi VND, xem thống kê theo tháng, biểu đồ theo nhóm và theo ngày. Dữ liệu nằm trong một Google Sheets tên **Sổ chi tiêu** trên Drive của tài khoản Google bạn chọn. Trang web được phát hành bằng GitHub Pages.

## 1. Tạo Google OAuth Client ID

1. Vào [Google Cloud Console](https://console.cloud.google.com/), tạo một project.
2. Bật **Google Drive API** và **Google Sheets API** trong **APIs & Services**.
3. Cấu hình **OAuth consent screen**. Với tài khoản Google cá nhân, chọn ứng dụng **External**. Nếu ứng dụng ở chế độ Testing, thêm email Google của bạn vào **Test users**.
4. Tạo **OAuth client ID** loại **Web application**. Trong **Authorized JavaScript origins**, thêm:
   - https://TEN_GITHUB_CUA_BAN.github.io
   - http://localhost:5173 (để thử trên máy)

   Origin chỉ gồm giao thức và tên miền, không thêm đường dẫn repository.
5. Sao chép **Client ID** (đuôi .apps.googleusercontent.com). Không dùng Client Secret trong web.

Ứng dụng xin quyền drive.file để chỉ quản lý các tệp Drive được tạo bằng ứng dụng này. Lần đầu kết nối sẽ tự tạo bảng tính; những lần sau sẽ tìm lại bảng đó. Hãy dùng cùng một tài khoản Google trên mọi thiết bị.

Tài liệu chính thức: [Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [phạm vi drive.file](https://developers.google.com/workspace/sheets/api/scopes), [tạo OAuth Client ID](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid).

## 2. Thử trên máy

Yêu cầu Node.js 20 trở lên.

1. Chạy npm install.
2. Sao chép .env.example thành .env.local; thay VITE_GOOGLE_CLIENT_ID bằng Client ID ở bước 1.
3. Chạy npm run dev và mở http://localhost:5173.
4. Bấm **Kết nối Google Drive**, chọn tài khoản Google và cấp quyền.

Chạy npm test để kiểm tra dữ liệu và npm run build để tạo bản web tĩnh trong thư mục dist.

## 3. Đưa lên GitHub Pages

1. Tạo một repository mới trên GitHub, ví dụ quan_ly_chi_tieu. Repository công khai dùng được với GitHub Pages trên gói miễn phí; mã nguồn này không chứa khóa bí mật.
2. Trong repository, vào **Settings → Secrets and variables → Actions → Variables**, tạo biến **GOOGLE_CLIENT_ID** với Client ID ở bước 1.
3. Vào **Settings → Pages → Build and deployment → Source**, chọn **GitHub Actions**.
4. Dự án đã có commit trên nhánh main. Trong thư mục dự án trên máy, chạy các lệnh sau (thay TEN_GITHUB_CUA_BAN):

       git remote add origin https://github.com/TEN_GITHUB_CUA_BAN/quan_ly_chi_tieu.git
       git push -u origin main

5. Workflow trong .github/workflows/pages.yml sẽ tự kiểm tra, build và phát hành trang. Mở tab **Actions** để xem kết quả; URL thường là https://TEN_GITHUB_CUA_BAN.github.io/quan_ly_chi_tieu/.

Nếu GitHub yêu cầu xác thực khi đẩy mã, hãy đăng nhập GitHub trong trình quản lý thông tin đăng nhập Git trên máy.

Tài liệu chính thức: [GitHub Pages với Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Sử dụng và dữ liệu

- Thêm khoản chi bằng ngày, số tiền nguyên VND, nội dung và nhóm. Có thể nhập nhóm mới.
- Sửa, xóa và xem biểu đồ trong tháng đã chọn. Nút làm mới hoặc quay lại tab sẽ tải các thay đổi từ thiết bị khác.
- Nút **Mở Drive** mở bảng tính gốc. Nút **Xuất CSV** tải toàn bộ khoản chi còn hiệu lực.
- Xóa khoản chi trong web sẽ đánh dấu xóa ở cột deleted_at để tránh lệch dòng khi nhiều thiết bị cùng dùng; dữ liệu cũ vẫn nằm trong Sheets nếu bạn cần khôi phục thủ công.
- Mỗi lần mở lại trang, bạn có thể cần bấm kết nối Google vì mã truy cập Google chỉ được giữ tạm trong bộ nhớ trình duyệt. Ứng dụng không lưu mật khẩu hay token lên GitHub.
- Nếu ứng dụng tạo hơn một bảng do nhiều thiết bị kết nối lần đầu cùng lúc, nó dùng bảng được tạo sớm nhất. Hãy giữ một bản và chỉ xóa bản còn lại sau khi kiểm tra dữ liệu.

Ứng dụng chưa được phát hành trực tuyến trong workspace này vì chưa có repository và Google Client ID của bạn.
