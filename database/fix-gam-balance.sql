-- Fix NULL gam_balance values in users table
-- This script ensures all users have a proper gam_balance value
-- Note: This is now deprecated - use migrate-coins-to-gam.sql instead

-- First, check for users with NULL gam_balance
SELECT id, username, email, gam_balance, created_at 
FROM users 
WHERE gam_balance IS NULL OR gam_balance = 0;

-- Update NULL or 0 gam_balance to default 10000
UPDATE users 
SET gam_balance = 10000
WHERE gam_balance IS NULL OR gam_balance = 0;

-- Verify the fix
SELECT id, username, email, gam_balance, created_at 
FROM users 
ORDER BY created_at DESC;

-- Add constraint to prevent future NULL values
ALTER TABLE users ALTER COLUMN gam_balance SET NOT NULL;
ALTER TABLE users ALTER COLUMN gam_balance SET DEFAULT 10000;