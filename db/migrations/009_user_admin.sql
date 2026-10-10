SET NAMES utf8mb4;
USE football_pitch_db;

-- Màn Admin > Người dùng
-- Lịch sử thao tác quản trị trên tài khoản (khóa / mở khóa, sửa ghi chú,
-- cấp / thu hồi Admin, tạo nhân viên). Ghi từ ứng dụng; màn 19 (Nhật ký
-- hệ thống) có thể đọc lại bảng này.
CREATE TABLE IF NOT EXISTS user_admin_history (
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
