-- 0012_store_claims.sql
-- Vendor store-ownership claim workflow. Approval sets stores.brandId.

CREATE TABLE store_claims (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brandId INT NOT NULL,
  storeId INT NOT NULL,
  claimantUserId INT NOT NULL,
  justification TEXT,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewerNote TEXT,
  reviewedByUserId INT,
  reviewedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_store_claims_brand (brandId),
  INDEX idx_store_claims_store (storeId),
  INDEX idx_store_claims_status (status)
);
