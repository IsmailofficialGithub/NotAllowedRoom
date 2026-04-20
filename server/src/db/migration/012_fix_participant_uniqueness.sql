-- 012_fix_participant_uniqueness.sql
-- This ensures that a user or guest can only have ONE entry in a specific room at a time.
-- This effectively blocks the "Double Entry" bug at the database level.

-- 1. Remove any existing duplicates first (keeps the most recent one)
DELETE FROM participants p1
USING participants p2
WHERE p1.id < p2.id
AND p1.room_id = p2.room_id
AND (
    (p1.user_id = p2.user_id AND p1.user_id IS NOT NULL)
    OR
    (p1.user_tempeorary_id = p2.user_tempeorary_id AND p1.user_tempeorary_id IS NOT NULL)
);

-- 2. Add Unique Constraints
-- For logged in users
ALTER TABLE participants 
DROP CONSTRAINT IF EXISTS unique_room_user;
ALTER TABLE participants 
ADD CONSTRAINT unique_room_user UNIQUE (room_id, user_id);

-- For guest users
ALTER TABLE participants 
DROP CONSTRAINT IF EXISTS unique_room_guest;
ALTER TABLE participants 
ADD CONSTRAINT unique_room_guest UNIQUE (room_id, user_tempeorary_id);
