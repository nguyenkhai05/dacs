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

-- Khung giá (các khung không được chồng lấn trong cùng một loại sân)
INSERT INTO price_slots (category_id, start_time, end_time, price_per_hour)
SELECT c.category_id, s.start_time, s.end_time, s.price
FROM pitch_categories c
JOIN (
    SELECT 'Sân 5 người' AS name, '06:00:00' AS start_time, '16:00:00' AS end_time, 200000 AS price
    UNION ALL SELECT 'Sân 5 người', '16:00:00', '22:00:00', 250000
    UNION ALL SELECT 'Sân 7 người', '06:00:00', '16:00:00', 350000
    UNION ALL SELECT 'Sân 7 người', '16:00:00', '22:00:00', 420000
) s ON s.name = c.category_name
WHERE NOT EXISTS (SELECT 1 FROM price_slots ps WHERE ps.category_id = c.category_id);