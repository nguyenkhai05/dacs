SET NAMES utf8mb4;
USE football_pitch_db;

ALTER TABLE pitches
    ADD COLUMN address VARCHAR(255) NULL AFTER surface_type,
    ADD COLUMN district VARCHAR(100) NULL AFTER address,
    ADD COLUMN amenities JSON NULL AFTER district,
    ADD INDEX idx_pitches_district (district);


