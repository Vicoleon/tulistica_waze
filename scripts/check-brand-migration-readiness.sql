-- scripts/check-brand-migration-readiness.sql
-- Read-only counts to preview what migration 0010 will touch.
-- Usage: mysql tulistica < scripts/check-brand-migration-readiness.sql

SELECT COUNT(*) AS brands_to_migrate
FROM brands b
WHERE LOWER(b.email) NOT IN (SELECT LOWER(email) FROM users WHERE email IS NOT NULL);

SELECT COUNT(*) AS brands_missing_membership
FROM brands b
WHERE NOT EXISTS (SELECT 1 FROM brand_members bm WHERE bm.brandId = b.id);

SELECT COUNT(*) AS shared_user_collisions
FROM brands b
WHERE LOWER(b.email) IN (SELECT LOWER(email) FROM users WHERE email IS NOT NULL);
