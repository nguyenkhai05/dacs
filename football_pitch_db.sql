SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS football_pitch_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE football_pitch_db;

-- ---------------------------------------------------------------------
-- 1. TÀI KHOẢN & PHÂN QUYỀN
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    role_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE users (
    user_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(254) NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE user_roles (
    user_id INT UNSIGNED NOT NULL,
    role_id INT UNSIGNED NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id)
        REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id)
        REFERENCES roles(role_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE customers (
    user_id INT UNSIGNED PRIMARY KEY,
    address VARCHAR(255) NULL,
    date_of_birth DATE NULL,
    notes TEXT NULL,
    CONSTRAINT fk_customers_user FOREIGN KEY (user_id)
        REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE employees (
    user_id INT UNSIGNED PRIMARY KEY,
    employee_code VARCHAR(30) NOT NULL UNIQUE,
    position VARCHAR(100) NULL,
    hire_date DATE NULL,
    CONSTRAINT fk_employees_user FOREIGN KEY (user_id)
        REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Màn 03: mã OTP khôi phục mật khẩu (chỉ lưu bản băm HMAC, không lưu OTP gốc)
CREATE TABLE password_reset_otps (
    otp_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    otp_hash CHAR(64) NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pro_user_created (user_id, created_at),
    CONSTRAINT fk_pro_user FOREIGN KEY (user_id)
        REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. SÂN & BẢNG GIÁ
-- ---------------------------------------------------------------------
CREATE TABLE pitch_categories (
    category_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE pitches (
    pitch_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id INT UNSIGNED NULL,
    pitch_name VARCHAR(100) NOT NULL UNIQUE,
    image_url VARCHAR(500) NULL,
    surface_type VARCHAR(50) NOT NULL DEFAULT 'Cỏ nhân tạo',
    address VARCHAR(255) NULL,
    district VARCHAR(100) NULL,
    amenities JSON NULL,
    status ENUM('Available', 'Maintenance', 'Inactive') NOT NULL DEFAULT 'Available',
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pitches_category_status (category_id, status),
    INDEX idx_pitches_district (district),
    CONSTRAINT fk_pitches_category FOREIGN KEY (category_id)
        REFERENCES pitch_categories(category_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

--   All = mọi ngày | Weekday = T2-T6 | Weekend = T7-CN | Holiday = ngày trong bảng holidays
-- Một loại ngày có bộ khung giá riêng thì dùng riêng CẢ BỘ đó (xem README, "Quy tắc chọn bảng giá").
CREATE TABLE price_slots (
    price_slot_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id INT UNSIGNED NOT NULL,
    day_type ENUM('All', 'Weekday', 'Weekend', 'Holiday') NOT NULL DEFAULT 'All',
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    price_per_hour DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_price_slots_time CHECK (end_time > start_time),
    CONSTRAINT chk_price_slots_price CHECK (price_per_hour >= 0),
    INDEX idx_price_slots_category_day_time (category_id, day_type, start_time, end_time),
    CONSTRAINT fk_price_slots_category FOREIGN KEY (category_id)
        REFERENCES pitch_categories(category_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE holidays (
    holiday_date DATE NOT NULL PRIMARY KEY,
    holiday_name VARCHAR(100) NOT NULL,
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_holidays_user FOREIGN KEY (created_by)
        REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. ĐẶT SÂN & DỊCH VỤ ĐI KÈM
-- ---------------------------------------------------------------------
CREATE TABLE bookings (
    booking_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id INT UNSIGNED NOT NULL,
    pitch_id INT UNSIGNED NOT NULL,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    total_pitch_price DECIMAL(10,2) NOT NULL,
    status ENUM('Pending', 'Confirmed', 'CheckedIn', 'Playing', 'Completed', 'Cancelled', 'NoShow')
        NOT NULL DEFAULT 'Pending',
    customer_note TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_bookings_time CHECK (end_time > start_time),
    CONSTRAINT chk_bookings_price CHECK (total_pitch_price >= 0),
    INDEX idx_bookings_pitch_schedule (pitch_id, booking_date, status, start_time, end_time),
    INDEX idx_bookings_customer_date (customer_id, booking_date),
    INDEX idx_bookings_status_date (status, booking_date),
    CONSTRAINT fk_bookings_customer FOREIGN KEY (customer_id)
        REFERENCES customers(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_bookings_pitch FOREIGN KEY (pitch_id)
        REFERENCES pitches(pitch_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE services (
    service_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL UNIQUE,
    unit VARCHAR(20) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock_quantity INT NOT NULL DEFAULT 0,
    low_stock_threshold INT UNSIGNED NOT NULL DEFAULT 10,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_services_price CHECK (price >= 0),
    CONSTRAINT chk_services_stock CHECK (stock_quantity >= 0)
) ENGINE=InnoDB;

CREATE TABLE booking_services (
    booking_service_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id INT UNSIGNED NOT NULL,
    service_id INT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_booking_services_quantity CHECK (quantity > 0),
    CONSTRAINT chk_booking_services_price CHECK (unit_price >= 0),
    INDEX idx_booking_services_booking (booking_id),
    INDEX idx_booking_services_service (service_id),
    CONSTRAINT fk_booking_services_booking FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_booking_services_service FOREIGN KEY (service_id)
        REFERENCES services(service_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. HÓA ĐƠN, THANH TOÁN, HOÀN CỌC, ĐỐI SOÁT
-- ---------------------------------------------------------------------
CREATE TABLE invoices (
    invoice_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id INT UNSIGNED NOT NULL UNIQUE,
    staff_id INT UNSIGNED NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status ENUM('Unpaid', 'PartiallyPaid', 'Paid', 'PartiallyRefunded', 'Refunded') NOT NULL DEFAULT 'Unpaid',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_invoices_total CHECK (total_amount >= 0),
    CONSTRAINT fk_invoices_booking FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_invoices_staff FOREIGN KEY (staff_id)
        REFERENCES employees(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payments (
    payment_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT UNSIGNED NOT NULL,
    payment_method ENUM('Cash', 'Banking', 'Momo', 'VNPay') NOT NULL,
    transaction_code VARCHAR(100) NULL UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('Pending', 'Successful', 'Failed') NOT NULL DEFAULT 'Pending',
    paid_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payments_amount CHECK (amount > 0),
    INDEX idx_payments_invoice (invoice_id),
    CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id)
        REFERENCES invoices(invoice_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE invoice_items (
    invoice_item_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT UNSIGNED NOT NULL,
    item_type ENUM('Pitch', 'Service', 'Other') NOT NULL,
    description VARCHAR(255) NOT NULL,
    service_id INT UNSIGNED NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_invoice_items_quantity CHECK (quantity > 0),
    CONSTRAINT chk_invoice_items_unit_price CHECK (unit_price >= 0),
    CONSTRAINT chk_invoice_items_line_total CHECK (line_total >= 0),
    INDEX idx_invoice_items_invoice (invoice_id),
    CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id)
        REFERENCES invoices(invoice_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_invoice_items_service FOREIGN KEY (service_id)
        REFERENCES services(service_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payment_refunds (
    refund_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    payment_id INT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    reason VARCHAR(500) NULL,
    bank_name VARCHAR(100) NULL,
    bank_account_number VARCHAR(30) NULL,
    bank_account_name VARCHAR(100) NULL,
    failure_reason VARCHAR(500) NULL,
    status ENUM('Pending', 'Successful', 'Failed') NOT NULL DEFAULT 'Pending',
    transaction_code VARCHAR(100) NULL UNIQUE,
    processed_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    CONSTRAINT chk_payment_refunds_amount CHECK (amount > 0),
    INDEX idx_payment_refunds_payment (payment_id),
    CONSTRAINT fk_payment_refunds_payment FOREIGN KEY (payment_id)
        REFERENCES payments(payment_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_payment_refunds_employee FOREIGN KEY (processed_by)
        REFERENCES employees(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payment_refund_history (
    history_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    refund_id BIGINT UNSIGNED NOT NULL,
    old_status VARCHAR(20) NULL,
    new_status VARCHAR(20) NOT NULL,
    note VARCHAR(500) NULL,
    changed_by INT UNSIGNED NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_refund_history_refund_time (refund_id, changed_at),
    CONSTRAINT fk_refund_history_refund FOREIGN KEY (refund_id)
        REFERENCES payment_refunds(refund_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_refund_history_user FOREIGN KEY (changed_by)
        REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Hàng đợi đối soát: tiền ngân hàng báo về nhưng hệ thống không tự khớp được
CREATE TABLE bank_transfer_logs (
    transfer_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id INT UNSIGNED NULL,
    payment_id INT UNSIGNED NULL,
    content VARCHAR(500) NOT NULL,
    reference_code VARCHAR(100) NULL UNIQUE,
    received_amount DECIMAL(10,2) NOT NULL,
    expected_amount DECIMAL(10,2) NULL,
    issue ENUM('NoBookingCode', 'BookingNotFound', 'NoDepositPayment', 'BookingNotPending', 'AmountTooSmall') NOT NULL,
    status ENUM('Open', 'Resolved', 'Dismissed') NOT NULL DEFAULT 'Open',
    resolution_action VARCHAR(30) NULL,
    resolution_note VARCHAR(500) NULL,
    resolved_by INT UNSIGNED NULL,
    resolved_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_bank_transfer_amount CHECK (received_amount > 0),
    INDEX idx_bank_transfer_status (status, created_at),
    INDEX idx_bank_transfer_booking (booking_id),
    CONSTRAINT fk_bank_transfer_resolver FOREIGN KEY (resolved_by)
        REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. ĐÁNH GIÁ 
-- ---------------------------------------------------------------------
CREATE TABLE reviews (
    review_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id INT UNSIGNED NOT NULL,
    customer_id INT UNSIGNED NOT NULL,
    pitch_id INT UNSIGNED NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    comment VARCHAR(1000) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_reviews_booking UNIQUE (booking_id),
    CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    INDEX idx_reviews_pitch_created (pitch_id, created_at),
    INDEX idx_reviews_customer (customer_id),
    CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_reviews_customer FOREIGN KEY (customer_id)
        REFERENCES customers(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_reviews_pitch FOREIGN KEY (pitch_id)
        REFERENCES pitches(pitch_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. BẢNG LỊCH SỬ (ghi bởi trigger hoặc ứng dụng)
-- ---------------------------------------------------------------------
CREATE TABLE pitch_history (
    history_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pitch_id INT UNSIGNED NOT NULL,
    old_pitch_name VARCHAR(100) NULL,
    new_pitch_name VARCHAR(100) NULL,
    old_category_id INT UNSIGNED NULL,
    new_category_id INT UNSIGNED NULL,
    old_status VARCHAR(20) NULL,
    new_status VARCHAR(20) NULL,
    old_notes TEXT NULL,
    new_notes TEXT NULL,
    changed_by INT UNSIGNED NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pitch_history_pitch_time (pitch_id, changed_at),
    CONSTRAINT fk_pitch_history_pitch FOREIGN KEY (pitch_id)
        REFERENCES pitches(pitch_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_pitch_history_user FOREIGN KEY (changed_by)
        REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE booking_status_history (
    history_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id INT UNSIGNED NOT NULL,
    old_status VARCHAR(30) NULL,
    new_status VARCHAR(30) NOT NULL,
    changed_by INT UNSIGNED NULL,
    reason TEXT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_booking_history_booking_time (booking_id, changed_at),
    CONSTRAINT fk_booking_history_booking FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_booking_history_user FOREIGN KEY (changed_by)
        REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE price_slot_history (
    history_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    price_slot_id INT UNSIGNED NOT NULL,
    old_price DECIMAL(10,2) NOT NULL,
    new_price DECIMAL(10,2) NOT NULL,
    changed_by INT UNSIGNED NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_price_history_old CHECK (old_price >= 0),
    CONSTRAINT chk_price_history_new CHECK (new_price >= 0),
    INDEX idx_price_history_slot_time (price_slot_id, changed_at),
    CONSTRAINT fk_price_history_slot FOREIGN KEY (price_slot_id)
        REFERENCES price_slots(price_slot_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_price_history_user FOREIGN KEY (changed_by)
        REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- (migration 007)
CREATE TABLE service_history (
    history_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    service_id INT UNSIGNED NOT NULL,
    old_service_name VARCHAR(100) NULL,
    new_service_name VARCHAR(100) NULL,
    old_price DECIMAL(10,2) NULL,
    new_price DECIMAL(10,2) NULL,
    old_stock_quantity INT NULL,
    new_stock_quantity INT NULL,
    old_is_active BOOLEAN NULL,
    new_is_active BOOLEAN NULL,
    changed_by INT UNSIGNED NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_service_history_service_time (service_id, changed_at),
    CONSTRAINT fk_service_history_service FOREIGN KEY (service_id)
        REFERENCES services(service_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_service_history_user FOREIGN KEY (changed_by)
        REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_admin_history (
    history_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    action ENUM('Lock', 'Unlock', 'NoteUpdate', 'GrantAdmin', 'RevokeAdmin', 'CreateStaff') NOT NULL,
    reason VARCHAR(500) NULL,
    performed_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_admin_history_user_time (user_id, created_at),
    CONSTRAINT fk_user_admin_history_user FOREIGN KEY (user_id)
        REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_user_admin_history_actor FOREIGN KEY (performed_by)
        REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. TRIGGER 
--    @app_user_id là biến session do ứng dụng gán để ghi "ai thực hiện".
-- ---------------------------------------------------------------------
DELIMITER $$

-- Chống chồng giờ giữa các khung giá CÙNG loại ngày của một loại sân 
CREATE TRIGGER trg_price_slots_before_insert
BEFORE INSERT ON price_slots FOR EACH ROW
BEGIN
    DECLARE v_category_id INT UNSIGNED;
    SELECT category_id INTO v_category_id FROM pitch_categories
      WHERE category_id = NEW.category_id FOR UPDATE;
    IF EXISTS (
        SELECT 1 FROM price_slots ps
        WHERE ps.category_id = NEW.category_id
          AND ps.day_type = NEW.day_type
          AND NEW.start_time < ps.end_time
          AND NEW.end_time > ps.start_time
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Khung gia bi chong lan voi khung gia da ton tai';
    END IF;
END$$

CREATE TRIGGER trg_price_slots_before_update
BEFORE UPDATE ON price_slots FOR EACH ROW
BEGIN
    DECLARE v_category_id INT UNSIGNED;
    SELECT category_id INTO v_category_id FROM pitch_categories
      WHERE category_id = NEW.category_id FOR UPDATE;
    IF EXISTS (
        SELECT 1 FROM price_slots ps
        WHERE ps.category_id = NEW.category_id
          AND ps.day_type = NEW.day_type
          AND ps.price_slot_id <> OLD.price_slot_id
          AND NEW.start_time < ps.end_time
          AND NEW.end_time > ps.start_time
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Khung gia bi chong lan voi khung gia da ton tai';
    END IF;
END$$

-- Chống đặt trùng sân (khóa dòng sân rồi kiểm tra chồng giờ)
CREATE TRIGGER trg_bookings_before_insert
BEFORE INSERT ON bookings FOR EACH ROW
BEGIN
    DECLARE v_pitch_id INT UNSIGNED;
    SELECT pitch_id INTO v_pitch_id FROM pitches
      WHERE pitch_id = NEW.pitch_id FOR UPDATE;
    IF NEW.status IN ('Pending','Confirmed','CheckedIn','Playing') AND EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.pitch_id = NEW.pitch_id
          AND b.booking_date = NEW.booking_date
          AND b.status IN ('Pending','Confirmed','CheckedIn','Playing')
          AND NEW.start_time < b.end_time
          AND NEW.end_time > b.start_time
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lich dat bi trung voi mot booking khac';
    END IF;
END$$

CREATE TRIGGER trg_bookings_before_update
BEFORE UPDATE ON bookings FOR EACH ROW
BEGIN
    DECLARE v_pitch_id INT UNSIGNED;
    SELECT pitch_id INTO v_pitch_id FROM pitches
      WHERE pitch_id = NEW.pitch_id FOR UPDATE;
    IF NEW.status IN ('Pending','Confirmed','CheckedIn','Playing') AND EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.pitch_id = NEW.pitch_id
          AND b.booking_date = NEW.booking_date
          AND b.booking_id <> OLD.booking_id
          AND b.status IN ('Pending','Confirmed','CheckedIn','Playing')
          AND NEW.start_time < b.end_time
          AND NEW.end_time > b.start_time
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lich dat bi trung voi mot booking khac';
    END IF;
END$$

CREATE TRIGGER trg_bookings_after_insert
AFTER INSERT ON bookings FOR EACH ROW
BEGIN
    INSERT INTO booking_status_history (booking_id, old_status, new_status, changed_by, reason)
    VALUES (NEW.booking_id, NULL, NEW.status, @app_user_id, 'Tao booking');
END$$

CREATE TRIGGER trg_bookings_after_update
AFTER UPDATE ON bookings FOR EACH ROW
BEGIN
    IF NOT (OLD.status <=> NEW.status) THEN
        INSERT INTO booking_status_history (booking_id, old_status, new_status, changed_by, reason)
        VALUES (NEW.booking_id, OLD.status, NEW.status, @app_user_id, NULL);
    END IF;
END$$

CREATE TRIGGER trg_price_slots_after_update
AFTER UPDATE ON price_slots FOR EACH ROW
BEGIN
    IF NOT (OLD.price_per_hour <=> NEW.price_per_hour) THEN
        INSERT INTO price_slot_history (price_slot_id, old_price, new_price, changed_by)
        VALUES (NEW.price_slot_id, OLD.price_per_hour, NEW.price_per_hour, @app_user_id);
    END IF;
END$$

CREATE TRIGGER trg_pitches_after_update
AFTER UPDATE ON pitches FOR EACH ROW
BEGIN
    IF NOT (OLD.pitch_name <=> NEW.pitch_name)
       OR NOT (OLD.category_id <=> NEW.category_id)
       OR NOT (OLD.status <=> NEW.status)
       OR NOT (OLD.notes <=> NEW.notes) THEN
        INSERT INTO pitch_history
          (pitch_id, old_pitch_name, new_pitch_name, old_category_id, new_category_id,
           old_status, new_status, old_notes, new_notes, changed_by)
        VALUES
          (NEW.pitch_id, OLD.pitch_name, NEW.pitch_name, OLD.category_id, NEW.category_id,
           OLD.status, NEW.status, OLD.notes, NEW.notes, @app_user_id);
    END IF;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------
-- 8. INDEX BỔ SUNG (an toàn, không đổi cấu trúc cột)
--    Phục vụ các truy vấn đang có trong code: danh sách đơn / lịch theo NGÀY
--    (không lọc theo sân), màn Thanh toán (lọc theo trạng thái + thời gian),
--    danh sách hoàn cọc.
-- ---------------------------------------------------------------------
ALTER TABLE bookings
    ADD INDEX idx_bookings_date_pitch (booking_date, pitch_id);
ALTER TABLE payments
    ADD INDEX idx_payments_status_paid (status, paid_at),
    ADD INDEX idx_payments_created (created_at);
ALTER TABLE payment_refunds
    ADD INDEX idx_payment_refunds_status_created (status, created_at);

-- ---------------------------------------------------------------------
-- 9. DỮ LIỆU BẮT BUỘC: vai trò
-- ---------------------------------------------------------------------
INSERT IGNORE INTO roles (role_name, description) VALUES
    ('Admin', 'Quan tri he thong'),
    ('Staff', 'Nhan vien quan ly san va hoa don'),
    ('Customer', 'Khach hang dat san');