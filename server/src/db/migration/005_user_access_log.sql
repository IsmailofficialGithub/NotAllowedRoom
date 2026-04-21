CREATE TABLE IF NOT EXISTS user_access_log(
    id serial primary key,
    user_id INTEGER,
    user_temporary_id UUID unique,
    room_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user_profile(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS idx_user_access_log_user_id ON user_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_access_log_user_temporary_id ON user_access_log(user_temporary_id);
CREATE INDEX IF NOT EXISTS idx_user_access_log_room_id ON user_access_log(room_id);