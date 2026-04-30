-- Migration to allow guest rooms
ALTER TABLE rooms ALTER COLUMN host_id DROP NOT NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS host_temporary_id UUID;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS host_name VARCHAR(225);

-- Populate host_name for existing rooms
UPDATE rooms r 
SET host_name = u.name 
FROM user_profile u 
WHERE r.host_id = u.id AND r.host_name IS NULL;
