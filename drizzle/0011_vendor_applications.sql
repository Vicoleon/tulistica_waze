-- 0011_vendor_applications.sql
-- Vendor application + approval workflow. Approval creates a brands row
-- with kind='vendor' and a brand_members row promoting the applicant.

CREATE TABLE vendor_applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  applicantUserId INT NOT NULL,
  companyName VARCHAR(255) NOT NULL,
  contactName VARCHAR(255),
  contactPhone VARCHAR(32),
  description TEXT,
  desiredStoresNote TEXT,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewerNote TEXT,
  reviewedByUserId INT,
  reviewedAt TIMESTAMP NULL,
  resultingBrandId INT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vendor_apps_applicant (applicantUserId),
  INDEX idx_vendor_apps_status (status)
);
