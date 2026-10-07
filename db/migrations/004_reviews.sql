SET NAMES utf8mb4;
USE football_pitch_db;

CREATE TABLE IF NOT EXISTS reviews (
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
