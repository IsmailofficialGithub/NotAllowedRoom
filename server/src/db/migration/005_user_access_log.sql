CREATE TABLE IF NOT EXISTS user_access_log(
    id serial primary key,
    user_id UUID,
    user_temporary_id UUID UNIQUE,
    room_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES room(id) ON DELETE CASCADE,
    FOREIGN KEY (user_tempeorary_id) REFERENCES participant(user_tempeorary_id) ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS idx_user_access_log_user_id ON user_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_access_log_user_temporary_id ON user_access_log(user_temporary_id);
CREATE INDEX IF NOT EXISTS idx_user_access_log_room_id ON user_access_log(room_id);