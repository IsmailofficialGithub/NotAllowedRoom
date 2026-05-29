ALTER TABLE rooms ADD COLUMN IF NOT EXISTS invite_token VARCHAR(80) UNIQUE;

UPDATE rooms
SET invite_token = md5(random()::text || clock_timestamp()::text || id::text)
WHERE is_private = true AND invite_token IS NULL;
