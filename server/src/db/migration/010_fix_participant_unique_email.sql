-- Remove the incorrect unique constraint on email in the participants table
-- Users should be able to join multiple rooms with the same email
ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_email_key;
