-- Kkary Database Schema Extensions
-- This migration adds admin management, mail system, and driver app support

-- 1. Add new roles and admin role field to users table
-- Note: If using MySQL, add these manually or via ORM if not already present
-- ALTER TABLE users ADD COLUMN adminRole VARCHAR(128) COMMENT 'Custom role description for admin/super_admin users';
-- ALTER TABLE users MODIFY COLUMN role ENUM('user', 'admin', 'super_admin', 'customer_care') DEFAULT 'user' NOT NULL;

-- 2. Create admin messages table for in-app mail system
CREATE TABLE IF NOT EXISTS adminMessages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fromUserId INT NOT NULL,
  toUserId INT NOT NULL,
  subject VARCHAR(255) NOT NULL,
  messageBody LONGTEXT NOT NULL,
  readAt TIMESTAMP NULL,
  isReply BOOLEAN DEFAULT FALSE NOT NULL,
  parentMessageId INT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  
  CONSTRAINT fk_admin_messages_from FOREIGN KEY (fromUserId) REFERENCES users(id),
  CONSTRAINT fk_admin_messages_to FOREIGN KEY (toUserId) REFERENCES users(id),
  CONSTRAINT fk_admin_messages_parent FOREIGN KEY (parentMessageId) REFERENCES adminMessages(id),
  
  INDEX idx_from_user (fromUserId),
  INDEX idx_to_user (toUserId),
  INDEX idx_created (createdAt),
  INDEX idx_parent (parentMessageId)
);

-- 3. Bootstrap super admin credentials update
-- Delete old bootstrap if exists (optional)
-- DELETE FROM users WHERE username = 'admin' AND role = 'super_admin' AND createdAt < NOW() - INTERVAL 1 DAY;

-- The application will auto-create superadmin/supa12345 on first login attempt
-- If you need to manually create it, use:
-- INSERT INTO users (openId, username, name, passwordHash, role, mustChangePassword, loginMethod)
-- VALUES ('admin-credential', 'superadmin', 'Kkary Super Administrator', '$2b$10$...hash...', 'super_admin', TRUE, 'credentials');
-- Replace hash with scrypt(supa12345) hash

-- 4. Support for driver and rider app isolation
-- No schema changes needed - apps are isolated by URL routing and session context

-- 5. Mail notification support (future enhancement)
-- CREATE TABLE IF NOT EXISTS mailNotifications (
--   id INT AUTO_INCREMENT PRIMARY KEY,
--   messageId INT NOT NULL,
--   userId INT NOT NULL,
--   isRead BOOLEAN DEFAULT FALSE NOT NULL,
--   createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
--   CONSTRAINT fk_mail_notif_message FOREIGN KEY (messageId) REFERENCES adminMessages(id),
--   CONSTRAINT fk_mail_notif_user FOREIGN KEY (userId) REFERENCES users(id),
--   INDEX idx_user (userId),
--   INDEX idx_read (isRead)
-- );

COMMIT;
