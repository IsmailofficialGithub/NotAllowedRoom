CREATE TABLE IF NOT EXISTS auth_session(
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    session_token VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    is_deleted BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES user_profile(id)
);

CREATE INDEX IF NOT EXISTS idx_auth_session_user_id ON auth_session(user_id);
