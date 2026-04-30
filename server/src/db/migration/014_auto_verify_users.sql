-- Update default value for isverified to TRUE
ALTER TABLE user_profile ALTER COLUMN isverified SET DEFAULT TRUE;

-- Verify all existing users just in case
UPDATE user_profile SET isverified = TRUE WHERE isverified = FALSE;
