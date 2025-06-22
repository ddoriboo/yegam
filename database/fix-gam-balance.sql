-- Fix NULL gam_balance values in users table
-- This script ensures all users have a proper gam_balance value

-- First, check for users with NULL gam_balance
SELECT id, username, email, gam_balance, coins, created_at 
FROM users 
WHERE gam_balance IS NULL OR gam_balance = 0;

-- Update NULL gam_balance to use coins value or default 10000
UPDATE users 
SET gam_balance = COALESCE(coins, 10000)
WHERE gam_balance IS NULL;

-- For users with 0 gam_balance but have coins, sync them
UPDATE users 
SET gam_balance = coins
WHERE gam_balance = 0 AND coins > 0;

-- For users with both gam_balance and coins as 0 or NULL, set default
UPDATE users 
SET gam_balance = 10000
WHERE (gam_balance = 0 OR gam_balance IS NULL) 
  AND (coins = 0 OR coins IS NULL);

-- Verify the fix
SELECT id, username, email, gam_balance, coins, created_at 
FROM users 
ORDER BY created_at DESC;

-- Optional: Add constraint to prevent future NULL values
-- ALTER TABLE users ALTER COLUMN gam_balance SET NOT NULL;
-- ALTER TABLE users ALTER COLUMN gam_balance SET DEFAULT 10000;