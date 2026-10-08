SET NAMES utf8mb4;
USE football_pitch_db;

-- day_type của một khung giá:
--   All      : áp dụng mọi ngày (toàn bộ khung giá cũ được giữ nguyên ở loại này)
--   Weekday  : Thứ 2 - Thứ 6
--   Weekend  : Thứ 7 - Chủ nhật
--   Holiday  : ngày nằm trong bảng holidays
--
-- Cách chọn bộ khung giá cho một ngày (theo từng loại sân):
--   ngày lễ  : Holiday -> (Weekend | Weekday theo thứ thật) -> All
--   ngày thường: (Weekend | Weekday) -> All
-- Loại ngày nào có bộ khung giá riêng thì dùng riêng cả bộ đó, nếu không thì dùng bộ kế tiếp.

ALTER TABLE price_slots
    ADD COLUMN day_type ENUM('All', 'Weekday', 'Weekend', 'Holiday') NOT NULL DEFAULT 'All' AFTER category_id,
    ADD INDEX idx_price_slots_category_day_time (category_id, day_type, start_time, end_time);

-- Index cũ đã được index mới (bắt đầu bằng category_id) thay thế, FK vẫn có index để dùng
ALTER TABLE price_slots DROP INDEX idx_price_slots_category_time;

CREATE TABLE IF NOT EXISTS holidays (
    holiday_date DATE NOT NULL PRIMARY KEY,
    holiday_name VARCHAR(100) NOT NULL,
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_holidays_user FOREIGN KEY (created_by)
        REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Trigger chống chồng giờ: chỉ so với các khung CÙNG loại ngày
DROP TRIGGER IF EXISTS trg_price_slots_before_insert;
DROP TRIGGER IF EXISTS trg_price_slots_before_update;

DELIMITER $$

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

DELIMITER ;
