ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_code VARCHAR(10);

UPDATE rooms
SET room_code = generated.code
FROM (
    SELECT r.id,
           string_agg(
               substr(chars.value, mod(abs(hashtext(r.id::text || ':' || pos::text)), 62) + 1, 1),
               ''
               ORDER BY pos
           ) AS code
    FROM rooms r
    CROSS JOIN generate_series(1, 10) pos
    CROSS JOIN (SELECT '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' AS value) chars
    WHERE r.room_code IS NULL
    GROUP BY r.id
) generated
WHERE rooms.id = generated.id
  AND rooms.room_code IS NULL;
WHERE room_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_room_code_unique ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms(room_code);
