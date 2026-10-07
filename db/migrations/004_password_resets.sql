SET NAMES utf8mb4;
USE football_pitch_db;

-- Màn 03: mã OTP khôi phục mật khẩu (chỉ lưu bản băm HMAC, không lưu OTP gốc)
CREATE TABLE IF NOT EXISTS password_reset_otps (
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
