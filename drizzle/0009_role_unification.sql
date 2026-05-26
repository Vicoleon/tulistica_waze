-- 0009_role_unification.sql
-- Expands the user role model, adds email verification on users,
-- introduces brand_members + stores.brandId, and adds a brands.kind
-- discriminator so a brand can be either an advertiser or a vendor.

-- 1. Widen users.role and backfill existing values
ALTER TABLE users MODIFY role ENUM(
  'consumer','vendor_staff','vendor_admin','super_admin'
) NOT NULL DEFAULT 'consumer';

UPDATE users SET role = 'super_admin' WHERE role = 'admin';
UPDATE users SET role = 'consumer' WHERE role NOT IN (
  'consumer','vendor_staff','vendor_admin','super_admin'
);

-- 2. Email verification columns on users
ALTER TABLE users
  ADD COLUMN emailVerified TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN emailVerifiedAt TIMESTAMP NULL;

-- Grandfather existing users as verified to avoid breaking their flows.
UPDATE users SET emailVerified = 1, emailVerifiedAt = NOW();

-- 3. user_tokens table for verify + reset
CREATE TABLE user_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  token VARCHAR(128) NOT NULL UNIQUE,
  type ENUM('email_verify','password_reset') NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  usedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_tokens_user (userId),
  INDEX idx_user_tokens_token (token)
);

-- 4. brands.kind discriminator
ALTER TABLE brands ADD COLUMN kind ENUM('advertiser','vendor')
  NOT NULL DEFAULT 'advertiser';

-- 5. stores.brandId
ALTER TABLE stores ADD COLUMN brandId INT NULL;
CREATE INDEX idx_stores_brand ON stores(brandId);

-- 6. brand_members join table
CREATE TABLE brand_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brandId INT NOT NULL,
  userId INT NOT NULL,
  membershipRole ENUM('owner','admin','staff') NOT NULL DEFAULT 'staff',
  invitedByUserId INT NULL,
  invitedAt TIMESTAMP NULL,
  acceptedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_brand_user (brandId, userId),
  INDEX idx_brand_members_user (userId)
);
