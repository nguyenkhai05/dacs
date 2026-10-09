SET NAMES utf8mb4;
USE football_pitch_db;

-- Màn Admin > Dịch vụ đi kèm
-- 1) Ngưỡng cảnh báo sắp hết hàng cho từng dịch vụ (mặc định 10)
ALTER TABLE services
    ADD COLUMN low_stock_threshold INT UNSIGNED NOT NULL DEFAULT 10 AFTER stock_quantity;

-- 2) Lịch sử thay đổi tên / giá / tồn kho / trạng thái (ghi từ ứng dụng)
CREATE TABLE IF NOT EXISTS service_history (
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
