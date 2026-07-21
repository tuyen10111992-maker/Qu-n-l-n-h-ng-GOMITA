# Thiết lập tài liệu đơn hàng trên Google Drive

## 1. Nâng cấp Supabase

1. Mở Supabase Dashboard của phần mềm.
2. Vào **SQL Editor**.
3. Dán và chạy toàn bộ file `supabase_migration_documents_sales.sql`.
4. Vào **Tài khoản** trong phần mềm, cập nhật email Google chính xác và không trùng cho từng tài khoản.

## 2. Tạo dịch vụ Google Drive

1. Mở [Google Apps Script](https://script.google.com) bằng tài khoản Google sở hữu Drive.
2. Tạo dự án mới, dán toàn bộ nội dung file `GoogleAppsScript_Documents.js`.
3. Mở **Project Settings > Script Properties**.
4. Thêm thuộc tính:
   - Tên: `GOMITA_DOCUMENT_TOKEN`
   - Giá trị: một chuỗi bí mật dài, tự đặt và không chia sẻ.
5. Chọn **Deploy > New deployment > Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Cấp quyền Drive khi Google yêu cầu và sao chép URL kết thúc bằng `/exec`.

## 3. Nối vào Gomita Flow

1. Đăng nhập tài khoản Admin.
2. Vào **Tài khoản > Tài liệu đơn hàng trên Google Drive**.
3. Nhập URL `/exec` và đúng mã bí mật ở bước trên.
4. Nhấn **Lưu cấu hình** rồi **Đồng bộ quyền Drive**.
5. Mở một đơn hàng > **Thông tin** và thử tải một file PDF.

Google Drive tự tạo thư mục `GOMITA_DON_HANG`, mỗi đơn có một thư mục con. Mỗi loại Báo giá, Hợp đồng, Bản vẽ chỉ giữ file mới nhất; file cũ được chuyển vào Thùng rác sau khi file mới tạo thành công.

Người xem phải đăng nhập Google bằng đúng email đã khai báo trong tài khoản Gomita. Khi khóa tài khoản, đổi email hoặc đổi Sale phụ trách, bấm **Đồng bộ quyền Drive** để áp lại toàn bộ quyền ngay lập tức.
