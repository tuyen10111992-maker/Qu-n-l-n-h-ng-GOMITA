# Gomita Flow

MVP quản lý vòng đời đơn hàng nội thất bằng tiếng Việt, responsive và chạy ngay không cần cài Node/Python.

## Chạy thử

Nhấp đúp `Chay Gomita.bat`, trình duyệt tự mở tại `http://localhost:8900`. Nếu cổng bận, đổi `$port` trong `Start-Gomita.ps1`. Dữ liệu vận hành lưu trong LocalStorage của trình duyệt.

Lần đầu hệ thống có một tài khoản quản trị: tên đăng nhập `admin`, mật khẩu `123456`. Hãy vào **Tài khoản**, sửa thông tin và đổi mật khẩu trước khi sử dụng. Phiên bản local cho phép Admin chuyển nhanh người dùng ở góc phải để kiểm tra quyền; khi triển khai Supabase, thay bằng Supabase Auth.

## Chức năng đã có

- Kanban 8 bước, kéo thả, tìm kiếm và lọc; cảnh báo hạn, thu tiền chờ xác nhận, công chưa chốt.
- Hồ sơ đơn không khóa theo tiến độ; phát sinh, thu nhiều lần, chi phí, nhân sự và công thực hiện.
- Tính tức thì doanh thu, đã thu chính thức, công nợ, chi phí, lãi/lỗ và tỷ lệ lãi.
- Khoản thu chỉ tính sau xác nhận. Chọn vai trò **Kế toán** để thấy nút xác nhận.
- Hoàn công chỉ khi hết công nợ và không còn công chưa chốt; sau đó khóa đơn. Giám đốc/Admin mở khóa được.
- Nhật ký thao tác, dashboard, tổng hợp/công nợ/lãi lỗ/hiệu suất, xuất CSV mở bằng Excel và in PDF.
- Quản lý tài khoản: tạo, sửa, khóa/mở và phân sáu vai trò; danh sách người phụ trách lấy trực tiếp từ tài khoản đang hoạt động.
- Không tạo đơn giả. Màn hình bắt đầu trống để nhập đơn hàng thực tế.

## Kiến trúc triển khai nhiều người dùng

`database.sql` là schema PostgreSQL/Supabase gồm hồ sơ, đơn, phát sinh, khoản thu, chi phí, nhân sự, công đoạn và activity log; có view tài chính, index và RLS nền tảng. Bản production nên tách thành:

1. Frontend này kết nối Supabase JS (Auth + REST/Realtime).
2. Edge Function `sync-employees` gọi Google Apps Script/Web API chỉ-đọc, chuẩn hóa mã nhân viên và upsert bảng `employees`. Không đặt URL/secret Sheet trong frontend.
3. Database trigger ghi `activity_logs`, cập nhật `updated_at`; RLS chi tiết cho từng bảng con theo ma trận quyền.
4. Supabase Storage không cần bật vì hồ sơ media tiếp tục dùng Zalo.

Đơn giá công khi đồng bộ: dùng cột đơn giá nếu có, nếu không dùng `(lương cơ bản + phụ cấp) / công chuẩn tháng`. Sync theo `external_code`, không xóa nhân viên cũ mà chuyển `active=false`.

## Quyền nghiệp vụ

- Quản lý đơn hàng: thông tin khách, nội dung, dự toán, báo giá, phát sinh khách, khoản thu dự kiến.
- Quản lý sản xuất: ra file–nghiệm thu, ghi chú, nhân sự/công và chi phí sản xuất.
- Kế toán: xác nhận thu, thêm chi, công nợ, hoàn công và báo cáo.
- Giám đốc/Admin: toàn quyền, mở khóa; Phó giám đốc mặc định chỉ đọc.

## Luồng chuyển bước và Google Sheet

- Quản lý đơn hàng chuyển tuần tự từ Tiếp nhận đến Ra file.
- Quản lý sản xuất chuyển từ Ra file qua Sản xuất, Lắp đặt đến Nghiệm thu. Khi vào Nghiệm thu phải chọn tài khoản Sale nhận lại đơn.
- Kế toán xác nhận khoản thu, nhập chi phí và chuyển Nghiệm thu sang Hoàn công.
- Mỗi lần chuyển bước, quản lý tích chọn một hoặc nhiều nhân sự và nhập số công từng người. Phần mềm tự tính tiền công, cộng chi phí nhân công, cập nhật lãi/lỗ và ghi nhật ký.
- Hồ sơ lương đọc từ tab `NhanVien` (loại lương, lương giờ/ngày/tháng và 5 loại phụ cấp); công và phụ cấp thực tế đọc từ `BangLuongThang`. Đầu mỗi tháng phần mềm tự đồng bộ một lần. Đơn giá công: lương ngày dùng `Lương Ngày`, lương giờ dùng `Lương Giờ × 8`, lương tháng dùng `Lương Tháng / 26`, sau đó cộng phụ cấp thực tế bình quân mỗi công của kỳ lương.

MVP local tập trung kiểm chứng luồng. Khi đưa vào vận hành thật, dùng schema Supabase và thực thi quyền ở RLS/backend, không chỉ ẩn nút ở giao diện.
