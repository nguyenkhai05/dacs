SET NAMES utf8mb4;
USE football_pitch_db;

-- Màn Admin > Thanh toán & hoàn cọc

-- 1) Thông tin tài khoản nhận hoàn cọc + lý do chuyển hoàn thất bại
ALTER TABLE payment_refunds
    ADD COLUMN bank_name VARCHAR(100) NULL AFTER reason,
    ADD COLUMN bank_account_number VARCHAR(30) NULL AFTER bank_name,
    ADD COLUMN bank_account_name VARCHAR(100) NULL AFTER bank_account_number,
    ADD COLUMN failure_reason VARCHAR(500) NULL AFTER bank_account_name;

-- 2) Lịch sử xử lý từng yêu cầu hoàn cọc (ghi từ ứng dụng)
CREATE TABLE IF NOT EXISTS payment_refund_history (
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

-- 3) Hàng đợi đối soát: tiền ngân hàng báo về nhưng hệ thống không tự khớp được
--    (thiếu tiền, đơn đã hủy/không còn chờ cọc, không có mã đơn...)
CREATE TABLE IF NOT EXISTS bank_transfer_logs (
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
