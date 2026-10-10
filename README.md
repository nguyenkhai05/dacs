# Đặt Sân Nhanh – Backend (NestJS + MySQL)

Hệ thống đặt sân bóng đá trực tuyến. Repo hiện tập trung hoàn thiện **backend** (thư mục `nest/`) trước, frontend làm sau.

## Yêu cầu
- Node.js 22+ (khuyến nghị dùng Dev Container có sẵn trong `.devcontainer/`)
- MySQL 8+

## Cài đặt & chạy
```bash
# 1. Tạo database và dữ liệu
mysql -u root -p < football_pitch_db.sql
mysql -u root -p < db/migrations/001_home_page.sql
mysql -u root -p < db/migrations/002_seed_home_demo.sql
mysql -u root -p < db/migrations/003_pitch_filters.sql   # chỉ cần nếu dùng lọc quận/tiện ích
mysql -u root -p < db/migrations/004_reviews.sql          # bảng đánh giá sau trận (màn 12)

# 2. Cấu hình môi trường
cd nest
cp .env.example .env     # rồi điền DB_*, JWT_SECRET, PAYMENT_*

# 3. Chạy
npm install
npm run start:dev        # http://localhost:3000
npm test                 # chạy unit test
```

## Biến môi trường chính
| Biến | Ý nghĩa |
|---|---|
| `DB_HOST/PORT/USER/PASSWORD/NAME` | Kết nối MySQL |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Ký token (vd `1h`, `7d` hoặc số giây) |
| `CORS_ORIGIN` | Origin frontend được gọi API, cách nhau bằng dấu phẩy |
| `PAYMENT_*`, `DEPOSIT_PERCENT` | Tài khoản nhận cọc VietQR, % cọc, thời gian giữ chỗ |
| `PAYMENT_WEBHOOK_SECRET` | Secret xác thực webhook ngân hàng (header `x-webhook-secret`) |
| `REFUND_FULL_HOURS`, `REFUND_PARTIAL_HOURS`, `REFUND_PARTIAL_PERCENT` | Chính sách hoàn cọc khi khách hủy (mặc định 24h / 12h / 50%) |

## API hiện có
| Màn | Method & route | Quyền |
|---|---|---|
| 01 | `POST /auth/login` (`identifier` = email hoặc SĐT, `password`) | Công khai |
| 02 | `POST /auth/register` | Công khai |
| 04 | `GET /home` | Công khai |
| 05 | `GET /home/pitches?date&category_id&q&district&min_price&max_price&amenities&sort&page&limit` | Công khai |
| 05/06 | `GET /pitches`, `GET /pitches/:id` | Công khai |
| 06 | `GET /bookings/availability?pitch_id&date` | Công khai |
| 07 | `GET /services` | Công khai |
| 07 | `POST /bookings/quote` (tính tiền sân + dịch vụ + cọc, chưa giữ sân) | Công khai |
| 07 | `POST /bookings` (có thể kèm `services: [{service_id, quantity}]`) | Đăng nhập |
| 09 | `GET /bookings/my?tab=all\|upcoming\|completed\|cancelled&page&limit` | Đăng nhập |
| 10 | `GET /bookings/:id` (chi tiết, thanh toán, hoàn cọc, lịch sử, xem trước hủy) | Chủ đơn / Staff / Admin |
| 10 | `POST /bookings/:id/cancel` (`reason` tùy chọn) | Chủ đơn |
| 08 | `POST /payments/deposit`, `GET /payments/deposit/:bookingId` | Đăng nhập |
| 08 | `POST /payments/webhook/bank` | Secret webhook |
| – | `POST /payments/:paymentId/confirm` | Admin, Staff |
| 12 | `GET /reviews?pitch_id&rating&page&limit` (tổng quan sao + danh sách, tên người đánh giá được che) | Công khai |
| 12 | `POST /reviews` (`booking_id`, `rating` 1-5, `comment` tùy chọn; chỉ đơn `Completed` của chính mình, mỗi đơn 1 lần) | Đăng nhập |
| 12 | `GET /reviews/booking/:bookingId` (đơn đã đánh giá chưa / có đánh giá được không) | Chủ đơn |
| 12 | `PUT /reviews/:id` (sửa đánh giá của mình) | Chủ đánh giá |
| 13 | `GET /dashboard/overview?date&view=day\|week` (KPI, biểu đồ, đơn mới nhất, lượt sắp diễn ra) | Admin, Staff |
| 15 | `GET /admin/pitches?status&category_id&q` (danh sách sân + tổng quan trạng thái + khoảng giá + số lượt sắp tới) | Admin, Staff |
| 15 | `GET /admin/pitches/:id` (chi tiết, bảng giá, khoảng trống giá, lịch sử sửa) | Admin, Staff |
| 15 | `POST /admin/pitches`, `PATCH /admin/pitches/:id` | Admin |
| 15 | `PATCH /admin/pitches/:id/status` (`Available`/`Maintenance`/`Inactive`; chặn nếu còn lịch sắp tới) | Admin, Staff |
| 15 | `GET /admin/pitch-categories` (loại sân + bảng giá + khoảng trống giá) | Admin, Staff |
| 15 | `POST /admin/pitch-categories`, `PATCH /admin/pitch-categories/:id` | Admin |
| 15 | `GET /admin/pitch-categories/:id/price-slots`, `GET .../price-history` | Admin, Staff |
| 15 | `POST /admin/pitch-categories/:id/price-slots` (`day_type`: `All`/`Weekday`/`Weekend`/`Holiday`, `start_time`, `end_time`, `price_per_hour`) | Admin |
| 15 | `GET /admin/pitch-categories/:id/price-preview?date=YYYY-MM-DD` (bảng giá thực tế áp dụng cho một ngày) | Admin, Staff |
| 15 | `PATCH /admin/price-slots/:id`, `DELETE /admin/price-slots/:id` | Admin |
| 15 | `GET /admin/holidays?from&to` | Admin, Staff |
| 15 | `POST /admin/holidays` (`name`, `date`, `end_date?` - tối đa 31 ngày/lần), `DELETE /admin/holidays/:date` | Admin |
| 18 | `GET /admin/users/customers?q&status=active\|locked&page&limit` (khách + tổng booking, hủy / không đến, phân trang) | Admin |
| 18 | `GET /admin/users/customers/:id` (chi tiết, ghi chú, booking gần đây kèm hoàn cọc, lịch sử thao tác) | Admin |
| 18 | `PATCH /admin/users/customers/:id/note` (`note`) | Admin |
| 18 | `PATCH /admin/users/customers/:id/status` (`is_active`, `reason` - bắt buộc khi khóa) | Admin |
| 18 | `GET /admin/users/staff` (nhân viên + vai trò, cờ `is_last_admin`, `can_grant_admin`, `can_revoke_admin`) | Admin |
| 18 | `POST /admin/users/staff` (`full_name`, `email`, `role`: `Admin`/`Staff`, tùy chọn `employee_code`, `position`, `phone_number`) | Admin |
| 18 | `PATCH /admin/users/staff/:id/role` (`role`: `Admin` = cấp, `Staff` = thu hồi Admin) | Admin |
| 18 | `POST /admin/users/staff/:id/resend-invite` | Admin |

Đăng nhập sai quá 5 lần trong 15 phút sẽ bị khóa tạm (HTTP 429).

## Tiến độ theo màn hình
- ✅ 01, 02, 03, 04, 05, 06, 07, 09, 10, 11, 12 (backend)
- ⚠️ 08: có QR + webhook + tự hủy đơn hết hạn; cần cấu hình `PAYMENT_*` để chạy thật
- ✅ 13 (tổng quan & báo cáo)
- ✅ 15 (sân & bảng giá: khung giờ + thứ trong tuần + ngày lễ). **Cần chạy `db/migrations/006_price_day_types.sql`** (thêm `price_slots.day_type`, bảng `holidays`, cập nhật trigger chống chồng giờ)
- ✅ 18 (người dùng: khách hàng + nhân viên & vai trò). **Cần chạy `db/migrations/009_user_admin.sql`** (bảng `user_admin_history`)
- ⏳ 14, 16, 17, 19 (phân hệ quản trị)

## Quy tắc chọn bảng giá theo ngày (migration 006)
Mỗi khung giá có `day_type`: `All` (mọi ngày - toàn bộ khung giá cũ được giữ ở loại này), `Weekday` (T2-T6), `Weekend` (T7-CN), `Holiday` (ngày có trong bảng `holidays`).
Với mỗi loại sân, bộ khung giá của một ngày được chọn theo thứ tự (loại ngày nào có khung giá riêng thì dùng riêng **cả bộ** đó):
- Ngày lễ: `Holiday` → `Weekend`/`Weekday` (theo thứ thật) → `All`
- Ngày thường: `Weekend`/`Weekday` → `All`

Áp dụng thống nhất cho: tính tiền khi đặt/báo giá, `availability`, giá & ca trống ở trang chủ, sức chứa ở dashboard. Đơn đã tạo giữ nguyên giá. API quản trị trả `price_gaps` theo từng loại ngày để cảnh báo giờ nào chưa có giá (khách không đặt được giờ đó).

## Khác biệt giữa schema thực tế và bản đặc tả
Schema trong `football_pitch_db.sql` được thiết kế chi tiết hơn bản đặc tả (SRS) nên một số bảng đổi tên/tách ra:

| Đặc tả (SRS) | Schema thực tế |
|---|---|
| `Users.role` | `users` + `roles` + `user_roles` (một người nhiều vai trò) |
| `Grounds`, `Venues` | `pitches`, `pitch_categories` (một cụm sân) |
| `TimeSlots` | `price_slots` (giá theo loại sân + khung giờ) |
| `Transactions` | `invoices`, `invoice_items`, `payments`, `payment_refunds` |
| `AuditLogs` | Các bảng `*_history` + trigger; **chưa có bảng audit log chung** (làm ở màn 19) |
| `Reviews` | **Chưa có** (làm ở màn 12) |
| Khóa slot bằng Redis | Khóa dòng sân `SELECT ... FOR UPDATE` + đơn `Pending` có hạn giữ chỗ |

## Lưu ý Git
- `node_modules/` ở thư mục gốc không được commit (đã có `.gitignore`).
- Không commit `.env`; dùng `.env.example` làm mẫu.

## Dịch vụ đi kèm & tồn kho (màn 07)
- Khi tạo đơn, hệ thống **khóa dòng dịch vụ**, kiểm tra còn kinh doanh và đủ tồn kho, lưu **giá tại thời điểm đặt** vào `booking_services` và **trừ kho ngay** (giữ hàng).
- Kho được **trả lại** khi đơn bị hủy (khách hủy hoặc hết hạn giữ chỗ).
- Giá sân và giá dịch vụ luôn do server tính; client không gửi được giá.

## Hủy đơn & hoàn cọc (màn 10)
| Thời điểm hủy | Kết quả |
|---|---|
| Đơn chưa cọc (`Pending`) | Hủy ngay, trả kho, không có hoàn tiền |
| Đã cọc, hủy sớm ≥ 24h trước giờ đá | Yêu cầu hoàn **100%** cọc |
| Đã cọc, hủy trong 12h–24h | Yêu cầu hoàn **50%** cọc |
| Đã cọc, hủy trong vòng 12h | Mất cọc |
| Đã quá giờ bắt đầu | Không hủy được |

Các mốc giờ và % chỉnh trong `.env` (`REFUND_*`). Yêu cầu hoàn được ghi vào `payment_refunds` với trạng thái `Pending`; **việc duyệt chi tiền hoàn là của quản lý ở màn 17** (chưa làm).



## Người dùng (màn 18)
- Chỉ **Admin** truy cập. Mọi thao tác ghi kiểm tra lại quyền Admin trong DB (JWT có thể cũ tới `JWT_EXPIRES_IN`).
- **Khóa khách**: `users.is_active = 0` → không đăng nhập được và không tạo được đơn mới (kể cả token cũ). Không xóa booking/giao dịch; lý do khóa bắt buộc. Tài khoản Admin/Staff không khóa được ở màn này.
- **Nhân viên**: luôn giữ vai trò `Staff`; "Cấp Admin" thêm vai trò `Admin`, "Thu hồi" gỡ `Admin` (vẫn là `Staff`). **Không thu hồi được Admin hoạt động cuối cùng** (khóa dòng chống thao tác đồng thời).
- Tạo nhân viên: mật khẩu ngẫu nhiên không ai biết, email hướng dẫn nhân viên tự đặt mật khẩu qua "Quên mật khẩu". Chưa cấu hình SMTP thì `email_sent = false` (dùng `resend-invite` sau). Nếu không gửi `phone_number`, cột SĐT tạm dùng mã nhân viên (do `users.phone_number` là NOT NULL UNIQUE).
- Lịch sử khóa/mở khóa/đổi vai trò/sửa ghi chú lưu ở `user_admin_history` (màn 19 có thể đọc lại).
