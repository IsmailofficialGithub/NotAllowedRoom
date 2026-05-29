ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_code VARCHAR(10);

UPDATE rooms
SET room_code = generated.code
FROM (
    SELECT r.id,
           upper(substr(md5(r.id::text), 1, 2)) ||
           substr(md5('room:' || r.id::text), 3, 2) ||
           lpad(r.id::text, 6, '0') AS code
    FROM rooms r
    WHERE r.room_code IS NULL
) generated
WHERE rooms.id = generated.id
  AND rooms.room_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_room_code_unique ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms(room_code);

ALTER TABLE rooms ALTER COLUMN room_code SET NOT NULL;
