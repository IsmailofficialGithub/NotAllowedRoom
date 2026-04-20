-- Drop the problematic foreign key constraints that block guest users
ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_user_tempeorary_id_fkey;
ALTER TABLE room_messages DROP CONSTRAINT IF EXISTS fk_messages_temporary;
