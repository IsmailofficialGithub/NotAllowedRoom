-- Remove the incorrect unique constraint on guest IDs in the participants table
-- Guests should be able to join multiple rooms with the same temporary ID
ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_user_tempeorary_id_key CASCADE;
