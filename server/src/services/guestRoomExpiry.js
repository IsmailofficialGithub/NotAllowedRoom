import { pool } from "../config/postgress_db.js";

const GUEST_ROOM_LIFETIME_MINUTES = 30;
const WARNING_MINUTES = [28, 29];
const CHECK_INTERVAL_MS = 15 * 1000;

const warnedRooms = new Set();

const getWarningKey = (roomId, minute) => `${roomId}:${minute}`;

export const startGuestRoomExpiryWatcher = (io) => {
    const checkGuestRooms = async () => {
        try {
            const warningResult = await pool.query(
                `SELECT id, room_name, FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) / 60) AS age_minutes
                 FROM rooms
                 WHERE host_id IS NULL
                   AND is_active = true
                   AND is_deleted = false
                   AND NOW() >= created_at + INTERVAL '28 minutes'
                   AND NOW() < created_at + INTERVAL '30 minutes'`
            );

            warningResult.rows.forEach((room) => {
                const ageMinute = Number(room.age_minutes);
                if (!WARNING_MINUTES.includes(ageMinute)) return;

                const warningKey = getWarningKey(room.id, ageMinute);
                if (warnedRooms.has(warningKey)) return;

                warnedRooms.add(warningKey);
                const minutesLeft = Math.max(GUEST_ROOM_LIFETIME_MINUTES - ageMinute, 1);

                io.to(`room_${Number(room.id)}`).emit('room_expiring', {
                    room_id: Number(room.id),
                    minutes_left: minutesLeft,
                    message: `Guest room will close in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}`
                });
            });

            const expiredResult = await pool.query(
                `UPDATE rooms
                 SET is_active = false, is_deleted = true, updated_at = NOW()
                 WHERE host_id IS NULL
                   AND is_active = true
                   AND is_deleted = false
                   AND NOW() >= created_at + INTERVAL '30 minutes'
                 RETURNING id, room_name`
            );

            expiredResult.rows.forEach((room) => {
                io.emit('room_deleted', {
                    room_id: Number(room.id),
                    message: "Guest room expired after 30 minutes"
                });
            });
        } catch (error) {
            console.error('Guest room expiry watcher error:', error);
        }
    };

    checkGuestRooms();
    return setInterval(checkGuestRooms, CHECK_INTERVAL_MS);
};
