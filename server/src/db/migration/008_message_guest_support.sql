-- Update room_messages to support guest users
ALTER TABLE room_messages ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE room_messages ADD COLUMN user_tempeorary_id UUID;
ALTER TABLE room_messages ADD CONSTRAINT fk_messages_temporary FOREIGN KEY (user_tempeorary_id) REFERENCES user_profile(user_tempeorary_id) ON DELETE CASCADE;
