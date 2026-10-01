CREATE DATABASE IF NOT EXISTS football_pitch_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE football_pitch_db;

CREATE TABLE roles (
    role_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE users (
    user_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(254) NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE user_roles (
    user_id INT UNSIGNED NOT NULL,
    role_id INT UNSIGNED NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id)
        REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id)
        REFERENCES roles(role_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE customers (
    user_id INT UNSIGNED PRIMARY KEY,
    address VARCHAR(255) NULL,
    date_of_birth DATE NULL,
    notes TEXT NULL,
    CONSTRAINT fk_customers_user FOREIGN KEY (user_id)
        REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE employees (
    user_id INT UNSIGNED PRIMARY KEY,
    employee_code VARCHAR(30) NOT NULL UNIQUE,
    position VARCHAR(100) NULL,
    hire_date DATE NULL,
    CONSTRAINT fk_employees_user FOREIGN KEY (user_id)
        REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE pitch_categories (
    category_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE pitches (
    pitch_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id INT UNSIGNED NULL,
    pitch_name VARCHAR(100) NOT NULL UNIQUE,
    status ENUM('Available', 'Maintenance', 'Inactive') NOT NULL DEFAULT 'Available',
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pitches_category_status (category_id, status),
    CONSTRAINT fk_pitches_category FOREIGN KEY (category_id)
        REFERENCES pitch_categories(category_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE price_slots (
    price_slot_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id INT UNSIGNED NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    price_per_hour DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_price_slots_time CHECK (end_time > start_time),
    CONSTRAINT chk_price_slots_price CHECK (price_per_hour >= 0),
    INDEX idx_price_slots_category_time (category_id, start_time, end_time),
    CONSTRAINT fk_price_slots_category FOREIGN KEY (category_id)
        REFERENCES pitch_categories(category_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE bookings (
    booking_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id INT UNSIGNED NOT NULL,
    pitch_id INT UNSIGNED NOT NULL,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    total_pitch_price DECIMAL(10,2) NOT NULL,
    status ENUM('Pending', 'Confirmed', 'CheckedIn', 'Playing', 'Completed', 'Cancelled', 'NoShow')
        NOT NULL DEFAULT 'Pending',
    customer_note TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_bookings_time CHECK (end_time > start_time),
    CONSTRAINT chk_bookings_price CHECK (total_pitch_price >= 0),
    INDEX idx_bookings_pitch_schedule (pitch_id, booking_date, status, start_time, end_time),
    INDEX idx_bookings_customer_date (customer_id, booking_date),
    INDEX idx_bookings_status_date (status, booking_date),
    CONSTRAINT fk_bookings_customer FOREIGN KEY (customer_id)
        REFERENCES customers(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_bookings_pitch FOREIGN KEY (pitch_id)
        REFERENCES pitches(pitch_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE services (
    service_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL UNIQUE,
    unit VARCHAR(20) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock_quantity INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_services_price CHECK (price >= 0),
    CONSTRAINT chk_services_stock CHECK (stock_quantity >= 0)
) ENGINE=InnoDB;

CREATE TABLE booking_services (
    booking_service_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id INT UNSIGNED NOT NULL,
    service_id INT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_booking_services_quantity CHECK (quantity > 0),
    CONSTRAINT chk_booking_services_price CHECK (unit_price >= 0),
    INDEX idx_booking_services_booking (booking_id),
    INDEX idx_booking_services_service (service_id),
    CONSTRAINT fk_booking_services_booking FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_booking_services_service FOREIGN KEY (service_id)
        REFERENCES services(service_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE invoices (
    invoice_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id INT UNSIGNED NOT NULL UNIQUE,
    staff_id INT UNSIGNED NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status ENUM('Unpaid', 'PartiallyPaid', 'Paid', 'PartiallyRefunded', 'Refunded') NOT NULL DEFAULT 'Unpaid',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_invoices_total CHECK (total_amount >= 0),
    CONSTRAINT fk_invoices_booking FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_invoices_staff FOREIGN KEY (staff_id)
        REFERENCES employees(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payments (
    payment_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT UNSIGNED NOT NULL,
    payment_method ENUM('Cash', 'Banking', 'Momo', 'VNPay') NOT NULL,
    transaction_code VARCHAR(100) NULL UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('Pending', 'Successful', 'Failed') NOT NULL DEFAULT 'Pending',
    paid_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payments_amount CHECK (amount > 0),
    INDEX idx_payments_invoice (invoice_id),
    CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id)
        REFERENCES invoices(invoice_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE invoice_items (
    invoice_item_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT UNSIGNED NOT NULL,
    item_type ENUM('Pitch', 'Service', 'Other') NOT NULL,
    description VARCHAR(255) NOT NULL,
    service_id INT UNSIGNED NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_invoice_items_quantity CHECK (quantity > 0),
    CONSTRAINT chk_invoice_items_unit_price CHECK (unit_price >= 0),
    CONSTRAINT chk_invoice_items_line_total CHECK (line_total >= 0),
    INDEX idx_invoice_items_invoice (invoice_id),
    CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id)
        REFERENCES invoices(invoice_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_invoice_items_service FOREIGN KEY (service_id)
        REFERENCES services(service_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payment_refunds (
    refund_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    payment_id INT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    reason VARCHAR(500) NULL,
    status ENUM('Pending', 'Successful', 'Failed') NOT NULL DEFAULT 'Pending',
    transaction_code VARCHAR(100) NULL UNIQUE,
    processed_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    CONSTRAINT chk_payment_refunds_amount CHECK (amount > 0),
    INDEX idx_payment_refunds_payment (payment_id),
    CONSTRAINT fk_payment_refunds_payment FOREIGN KEY (payment_id)
        REFERENCES payments(payment_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_payment_refunds_employee FOREIGN KEY (processed_by)
        REFERENCES employees(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE pitch_history (
    history_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pitch_id INT UNSIGNED NOT NULL,
    old_pitch_name VARCHAR(100) NULL,
    new_pitch_name VARCHAR(100) NULL,
    old_category_id INT UNSIGNED NULL,
    new_category_id INT UNSIGNED NULL,
    old_status VARCHAR(20) NULL,
    new_status VARCHAR(20) NULL,
    old_notes TEXT NULL,
    new_notes TEXT NULL,
    changed_by INT UNSIGNED NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pitch_history_pitch_time (pitch_id, changed_at),
    CONSTRAINT fk_pitch_history_pitch FOREIGN KEY (pitch_id)
        REFERENCES pitches(pitch_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_pitch_history_user FOREIGN KEY (changed_by)
        REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE booking_status_history (
    history_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id INT UNSIGNED NOT NULL,
    old_status VARCHAR(30) NULL,
    new_status VARCHAR(30) NOT NULL,
    changed_by INT UNSIGNED NULL,
    reason TEXT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_booking_history_booking_time (booking_id, changed_at),
    CONSTRAINT fk_booking_history_booking FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_booking_history_user FOREIGN KEY (changed_by)
        REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE price_slot_history (
    history_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    price_slot_id INT UNSIGNED NOT NULL,
    old_price DECIMAL(10,2) NOT NULL,
    new_price DECIMAL(10,2) NOT NULL,
    changed_by INT UNSIGNED NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_price_history_old CHECK (old_price >= 0),
    CONSTRAINT chk_price_history_new CHECK (new_price >= 0),
    INDEX idx_price_history_slot_time (price_slot_id, changed_at),
    CONSTRAINT fk_price_history_slot FOREIGN KEY (price_slot_id)
        REFERENCES price_slots(price_slot_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_price_history_user FOREIGN KEY (changed_by)
        REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

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
          AND ps.price_slot_id <> OLD.price_slot_id
          AND NEW.start_time < ps.end_time
          AND NEW.end_time > ps.start_time
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Khung gia bi chong lan voi khung gia da ton tai';
    END IF;
END$$

CREATE TRIGGER trg_bookings_before_insert
BEFORE INSERT ON bookings FOR EACH ROW
BEGIN
    DECLARE v_pitch_id INT UNSIGNED;
    SELECT pitch_id INTO v_pitch_id FROM pitches
      WHERE pitch_id = NEW.pitch_id FOR UPDATE;
    IF NEW.status IN ('Pending','Confirmed','CheckedIn','Playing') AND EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.pitch_id = NEW.pitch_id
          AND b.booking_date = NEW.booking_date
          AND b.status IN ('Pending','Confirmed','CheckedIn','Playing')
          AND NEW.start_time < b.end_time
          AND NEW.end_time > b.start_time
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lich dat bi trung voi mot booking khac';
    END IF;
END$$

CREATE TRIGGER trg_bookings_before_update
BEFORE UPDATE ON bookings FOR EACH ROW
BEGIN
    DECLARE v_pitch_id INT UNSIGNED;
    SELECT pitch_id INTO v_pitch_id FROM pitches
      WHERE pitch_id = NEW.pitch_id FOR UPDATE;
    IF NEW.status IN ('Pending','Confirmed','CheckedIn','Playing') AND EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.pitch_id = NEW.pitch_id
          AND b.booking_date = NEW.booking_date
          AND b.booking_id <> OLD.booking_id
          AND b.status IN ('Pending','Confirmed','CheckedIn','Playing')
          AND NEW.start_time < b.end_time
          AND NEW.end_time > b.start_time
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lich dat bi trung voi mot booking khac';
    END IF;
END$$

CREATE TRIGGER trg_bookings_after_insert
AFTER INSERT ON bookings FOR EACH ROW
BEGIN
    INSERT INTO booking_status_history (booking_id, old_status, new_status, changed_by, reason)
    VALUES (NEW.booking_id, NULL, NEW.status, @app_user_id, 'Tao booking');
END$$

CREATE TRIGGER trg_bookings_after_update
AFTER UPDATE ON bookings FOR EACH ROW
BEGIN
    IF NOT (OLD.status <=> NEW.status) THEN
        INSERT INTO booking_status_history (booking_id, old_status, new_status, changed_by, reason)
        VALUES (NEW.booking_id, OLD.status, NEW.status, @app_user_id, NULL);
    END IF;
END$$

CREATE TRIGGER trg_price_slots_after_update
AFTER UPDATE ON price_slots FOR EACH ROW
BEGIN
    IF NOT (OLD.price_per_hour <=> NEW.price_per_hour) THEN
        INSERT INTO price_slot_history (price_slot_id, old_price, new_price, changed_by)
        VALUES (NEW.price_slot_id, OLD.price_per_hour, NEW.price_per_hour, @app_user_id);
    END IF;
END$$

CREATE TRIGGER trg_pitches_after_update
AFTER UPDATE ON pitches FOR EACH ROW
BEGIN
    IF NOT (OLD.pitch_name <=> NEW.pitch_name)
       OR NOT (OLD.category_id <=> NEW.category_id)
       OR NOT (OLD.status <=> NEW.status)
       OR NOT (OLD.notes <=> NEW.notes) THEN
        INSERT INTO pitch_history
          (pitch_id, old_pitch_name, new_pitch_name, old_category_id, new_category_id,
           old_status, new_status, old_notes, new_notes, changed_by)
        VALUES
          (NEW.pitch_id, OLD.pitch_name, NEW.pitch_name, OLD.category_id, NEW.category_id,
           OLD.status, NEW.status, OLD.notes, NEW.notes, @app_user_id);
    END IF;
END$$

DELIMITER ;

INSERT IGNORE INTO roles (role_name, description) VALUES
    ('Admin', 'Quan tri he thong'),
    ('Staff', 'Nhan vien quan ly san va hoa don'),
    ('Customer', 'Khach hang dat san');