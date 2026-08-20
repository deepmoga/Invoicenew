-- BillFlow CRM MySQL Database Schema
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sessions` (
  `token` VARCHAR(255) PRIMARY KEY,
  `user_id` INT NOT NULL,
  `expires_at` BIGINT NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `companies` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `gstin` VARCHAR(100) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(100) DEFAULT NULL,
  `bank_details` TEXT DEFAULT NULL,
  `logo` LONGTEXT DEFAULT NULL,
  `invoice_prefix` VARCHAR(50) DEFAULT 'INV',
  `next_invoice` INT DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `customers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `business_name` VARCHAR(255) DEFAULT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(100) DEFAULT NULL,
  `gstin` VARCHAR(100) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(100) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `unit` VARCHAR(50) DEFAULT 'unit',
  `price` DECIMAL(12,2) DEFAULT 0.00,
  `gst_rate` DECIMAL(5,2) DEFAULT 18.00,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `invoices` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `customer_id` INT NOT NULL,
  `number` VARCHAR(100) NOT NULL,
  `po_number` VARCHAR(100) DEFAULT NULL,
  `invoice_date` DATE DEFAULT NULL,
  `due_date` DATE DEFAULT NULL,
  `status` VARCHAR(50) DEFAULT 'draft',
  `gst_enabled` TINYINT(1) DEFAULT 0,
  `notes` TEXT DEFAULT NULL,
  `subtotal` DECIMAL(12,2) DEFAULT 0.00,
  `tax_total` DECIMAL(12,2) DEFAULT 0.00,
  `total` DECIMAL(12,2) DEFAULT 0.00,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`),
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `invoice_lines` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoice_id` INT NOT NULL,
  `item_id` INT DEFAULT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `quantity` DECIMAL(10,2) DEFAULT 1.00,
  `price` DECIMAL(12,2) DEFAULT 0.00,
  `gst_rate` DECIMAL(5,2) DEFAULT 18.00,
  `amount` DECIMAL(12,2) DEFAULT 0.00,
  FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `estimates` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `customer_id` INT NOT NULL,
  `number` VARCHAR(100) NOT NULL,
  `estimate_date` DATE DEFAULT NULL,
  `due_date` DATE DEFAULT NULL,
  `status` VARCHAR(50) DEFAULT 'draft',
  `gst_enabled` TINYINT(1) DEFAULT 0,
  `notes` TEXT DEFAULT NULL,
  `subtotal` DECIMAL(12,2) DEFAULT 0.00,
  `tax_total` DECIMAL(12,2) DEFAULT 0.00,
  `total` DECIMAL(12,2) DEFAULT 0.00,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`),
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `estimate_lines` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `estimate_id` INT NOT NULL,
  `item_id` INT DEFAULT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `quantity` DECIMAL(10,2) DEFAULT 1.00,
  `price` DECIMAL(12,2) DEFAULT 0.00,
  `gst_rate` DECIMAL(5,2) DEFAULT 18.00,
  `amount` DECIMAL(12,2) DEFAULT 0.00,
  FOREIGN KEY (`estimate_id`) REFERENCES `estimates`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT NOT NULL,
  `company_id` INT NOT NULL,
  `invoice_id` INT DEFAULT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `payment_date` DATE NOT NULL,
  `mode` VARCHAR(50) DEFAULT 'bank',
  `reference` VARCHAR(255) DEFAULT NULL,
  `note` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`),
  FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `followups` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT NOT NULL,
  `estimate_id` INT DEFAULT NULL,
  `followup_date` DATE NOT NULL,
  `message` TEXT NOT NULL,
  `status` VARCHAR(50) DEFAULT 'pending',
  `last_sent_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`estimate_id`) REFERENCES `estimates`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payment_reminder_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoice_id` INT NOT NULL,
  `sent_date` DATE NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_invoice_date` (`invoice_id`, `sent_date`),
  FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `domains` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT NOT NULL,
  `company_id` INT NOT NULL,
  `domain_name` VARCHAR(255) NOT NULL,
  `registrar` VARCHAR(255) DEFAULT NULL,
  `purchase_date` DATE DEFAULT NULL,
  `renewal_date` DATE NOT NULL,
  `yearly_cost` DECIMAL(12,2) DEFAULT 0.00,
  `auto_renew` TINYINT(1) DEFAULT 0,
  `status` VARCHAR(50) DEFAULT 'active',
  `notes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `settings` (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
