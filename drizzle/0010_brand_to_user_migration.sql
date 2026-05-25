-- 0010_brand_to_user_migration.sql
-- For each brand without a corresponding user row, create one. Then
-- ensure every brand has at least one owner-level brand_members row.
-- Both INSERTs are idempotent (NOT IN / NOT EXISTS guards).

INSERT INTO users (openId, name, email, loginMethod, role, emailVerified, emailVerifiedAt)
SELECT
  CONCAT('legacy-brand:', LOWER(b.email)),
  COALESCE(b.contactName, b.companyName),
  LOWER(b.email),
  'brand-migration',
  'consumer',
  b.emailVerified,
  CASE WHEN b.emailVerified = 1 THEN NOW() ELSE NULL END
FROM brands b
WHERE LOWER(b.email) NOT IN (
  SELECT LOWER(email) FROM users WHERE email IS NOT NULL
);

INSERT INTO brand_members (brandId, userId, membershipRole, acceptedAt)
SELECT b.id, u.id, 'owner', NOW()
FROM brands b
JOIN users u ON LOWER(u.email) = LOWER(b.email)
WHERE NOT EXISTS (
  SELECT 1 FROM brand_members bm
  WHERE bm.brandId = b.id AND bm.userId = u.id
);
