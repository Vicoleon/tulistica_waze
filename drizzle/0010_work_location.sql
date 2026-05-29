-- 0010_work_location.sql
-- Adds an optional secondary location (work address) on users, so people who
-- shop near their workplace after hours can pick stores from there too.

ALTER TABLE users
  ADD COLUMN workLatitude FLOAT NULL,
  ADD COLUMN workLongitude FLOAT NULL;
