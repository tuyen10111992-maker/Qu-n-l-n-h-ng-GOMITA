# CLAUDE.md

Nguyên tắc làm việc cho Claude/Codex trong PM GOMITA và các project lớn của tôi: sửa đúng việc, giữ kiến trúc ổn định, bảo vệ dữ liệu/business logic, và luôn kiểm chứng trước khi báo xong.

## 1. Hiểu Trước Khi Code

Không đoán mò. Trước khi sửa phải đọc code hiện tại, tìm file liên quan, inspect module/service/model/component/API/database.

- Search utility, service, DTO, model, component, config có sẵn trước khi tạo mới.
- Nếu business rule đã có, reuse thay vì duplicate.
- Không tự phát minh API, schema, env, folder, status, permission hoặc rule nghiệp vụ.
- Nếu yêu cầu mơ hồ hoặc có rủi ro, nêu giả định hoặc hỏi lại.

## 2. Đơn Giản Và Đúng Phạm Vi

Giải pháp phải nhỏ nhất nhưng đúng nghiệp vụ. Không thêm framework, dependency, abstraction, config hay tính năng “để sau này dùng”.

- Ưu tiên mở rộng module hiện có hơn tạo module mới.
- Không refactor, format, rename, move file/folder nếu không được yêu cầu.
- Mọi dòng thay đổi phải liên quan trực tiếp tới yêu cầu.
- Nếu thấy vấn đề ngoài phạm vi, chỉ ghi nhận trong summary.

## 3. Bảo Vệ Kiến Trúc Và Module

Follow architecture, folder structure, dependency direction và convention hiện có.

- UI không được bypass service/API nếu project đã có layer xử lý.
- Module nào sở hữu feature thì logic nên nằm trong module đó.
- Không để module này sửa module khác nếu không có lý do nghiệp vụ rõ.
- Shared/common chỉ dùng cho logic thật sự dùng chung.

## 4. An Toàn Database, API Và Business Logic

Database, API contract và workflow hiện có được xem là production behavior.

- Không drop/rename column, delete table, sửa production data, đổi enum/status nếu chưa được duyệt.
- Ưu tiên migration additive và backward compatible.
- Không đổi endpoint, field, status code, error shape nếu không được yêu cầu.
- Không đơn giản hóa workflow, bỏ audit log, status history, permission check, validation hoặc công thức tính toán nếu chưa xác nhận.

## 5. UI Nhất Quán

UI là tool vận hành, ưu tiên ổn định và quen thuộc hơn redesign.

- Reuse component hiện có.
- Match spacing, typography, color, layout, interaction.
- Không thêm landing page, hero, animation, decoration nếu không được yêu cầu.
- Preserve behavior cũ trừ khi task yêu cầu đổi.

## 6. Quy Trình Hoàn Thành

Mỗi task đi theo vòng: Plan -> Implement -> Verify -> Regression Check -> Summarize.

Trước khi kết thúc, tự kiểm:

- Đã inspect implementation hiện có chưa?
- Đã sửa đúng phạm vi chưa?
- Đã reuse code/convention hiện có chưa?
- Có phá API, database, UI, workflow hay dữ liệu cũ không?
- Đã test/build/lint hoặc kiểm tra thủ công chưa?
- Summary đã nêu file sửa, lý do, cách verify, giả định và rủi ro còn lại chưa?

Chỉ báo “xong” khi có kết quả cụ thể và cách kiểm chứng rõ ràng.
