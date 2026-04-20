-- // users can join without login
CREATE TABLE IF NOT EXISTS participants(
    id serial primary key,
    room_id INTEGER NOT NULL,
    user_id INTEGER,
    user_tempeorary_id UUID,
    name VARCHAR(225) NOT NULL,
    email VARCHAR(225),
    webRTC_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_allowed BOOLEAN DEFAULT FALSE,
    is_removed BOOLEAN DEFAULT FALSE,
    removed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    removed_by INTEGER REFERENCES user_profile(id) ON DELETE SET NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user_profile(id) ON DELETE CASCADE
    );

CREATE INDEX IF NOT EXISTS idx_participants_room_id ON participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_tempeorary_id ON participants(user_tempeorary_id);