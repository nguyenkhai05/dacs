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

Đăng nhập sai quá 5 lần trong 15 phút sẽ bị khóa tạm (HTTP 429).

## Tiến độ theo màn hình
- ✅ 01, 02, 04, 05, 06, 07, 09, 10 (backend)
- ⚠️ 08: có QR + webhook + tự hủy đơn hết hạn; cần cấu hình `PAYMENT_*` để chạy thật
- ⏳ 03 (quên mật khẩu), 11 (tài khoản), 12 (đánh giá)
- ⏳ 13–19 (phân hệ quản trị)

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

