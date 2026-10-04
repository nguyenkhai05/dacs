SET NAMES utf8mb4;
USE football_pitch_db;

INSERT IGNORE INTO pitch_categories (category_name, description) VALUES
    ('Sân 5 người', 'Sân mini 5 người'),
    ('Sân 7 người', 'Sân 7 người');

INSERT IGNORE INTO pitches (category_id, pitch_name, image_url)
SELECT category_id, 'Sân 5 - Số 1', '/images/pitches/san5-so1.jpg'
FROM pitch_categories WHERE category_name = 'Sân 5 người';

INSERT IGNORE INTO pitches (category_id, pitch_name, image_url)
SELECT category_id, 'Sân 5 - Số 2', '/images/pitches/san5-so2.jpg'
FROM pitch_categories WHERE category_name = 'Sân 5 người';

INSERT IGNORE INTO pitches (category_id, pitch_name, image_url)
SELECT category_id, 'Sân 7 - Số 1', '/images/pitches/san7-so1.jpg'
FROM pitch_categories WHERE category_name = 'Sân 7 người';

SET @cat5 = (SELECT category_id FROM pitch_categories WHERE category_name = 'Sân 5 người');
SET @cat7 = (SELECT category_id FROM pitch_categories WHERE category_name = 'Sân 7 người');

INSERT INTO price_slots (category_id, start_time, end_time, price_per_hour)
SELECT @cat5, '06:00:00', '16:00:00', 200000
WHERE NOT EXISTS (SELECT 1 FROM price_slots WHERE category_id = @cat5);

INSERT INTO price_slots (category_id, start_time, end_time, price_per_hour)
SELECT @cat5, '16:00:00', '22:00:00', 250000
WHERE (SELECT COUNT(*) FROM price_slots WHERE category_id = @cat5) = 1;

INSERT INTO price_slots (category_id, start_time, end_time, price_per_hour)
SELECT @cat7, '06:00:00', '16:00:00', 350000
WHERE NOT EXISTS (SELECT 1 FROM price_slots WHERE category_id = @cat7);

INSERT INTO price_slots (category_id, start_time, end_time, price_per_hour)
SELECT @cat7, '16:00:00', '22:00:00', 420000
WHERE (SELECT COUNT(*) FROM price_slots WHERE category_id = @cat7) = 1;
