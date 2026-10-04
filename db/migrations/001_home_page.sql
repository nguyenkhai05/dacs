SET NAMES utf8mb4;
USE football_pitch_db;

ALTER TABLE pitches
    ADD COLUMN image_url VARCHAR(500) NULL AFTER pitch_name,
    ADD COLUMN surface_type VARCHAR(50) NOT NULL DEFAULT 'Cỏ nhân tạo' AFTER image_url;
