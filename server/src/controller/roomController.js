import { pool } from "../config/postgress_db.js";
import { v4 as uuidv4 } from 'uuid';

export const CreateRoom = async (req, res) => {
    try {
        const { room_name, is_private, room_password, guest_name, guest_id } = req.body;
        if (!room_name) {
            return res.status(400).json({ message: "Room name is required" });
        }

        const userId = req.user?.id || null;
        const hName = (req.user?.name || guest_name || 'Guest').trim();
        const hTemporaryId = userId ? null : (guest_id && guest_id !== 'null' && guest_id !== '' ? guest_id : uuidv4());

        if (!userId && (!hName || hName === 'Guest') && !guest_name) {
            return res.status(400).json({ message: "Name is required for guest room creation" });
        }

        const now = new Date().toISOString();

        const result = await pool.query(
            "INSERT INTO rooms (host_id, host_temporary_id, host_name, room_name, created_at, updated_at, is_active, is_deleted, is_private, room_password) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *",
            [userId, hTemporaryId, hName, room_name, now, now, true, false, is_private || false, room_password || null]
        );

        const roomData = {
            ...result.rows[0],
            participant_count: 0
        };

        // Realtime broadcast for public rooms
        if (!is_private && req.io) {
            req.io.emit('room_created', roomData);
        }

        res.status(201).json({
            success: true,
            message: "Room created successfully",
            room: roomData,
            guest_id: hTemporaryId // Send back the guest_id if it was generated
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal server error" });
    }
}

export const GetRooms = async (req, res) => {
    try {
        const userId = req.user?.id || null;
        const guestId = req.query.guest_id || null;

        // Show all public rooms + private rooms where current user is the host
        const result = await pool.query(
            `SELECT r.*, 
                    COALESCE(r.host_name, u.name) as host_name,
                    COUNT(p.id) FILTER (WHERE p.is_removed = false) as participant_count
             FROM rooms r 
             LEFT JOIN user_profile u ON r.host_id = u.id 
             LEFT JOIN participants p ON r.id = p.room_id
             WHERE r.is_active = true AND r.is_deleted = false 
             AND (r.is_private = false OR r.host_id = $1 OR (r.host_temporary_id = $2::UUID AND r.host_temporary_id IS NOT NULL))
             GROUP BY r.id, u.name
             ORDER BY r.created_at DESC`,
            [userId, guestId]
        );

        res.status(200).json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal server error" });
    }
}

export const DeleteRoom = async (req, res) => {
    try {
        const { id } = req.params;
        const guest_id = req.body.guest_id || req.query.guest_id || null;
        const userId = req.user?.id || null;

        const result = await pool.query(
            `UPDATE rooms SET is_active = false, is_deleted = true, updated_at = $1 
             WHERE id = $2 AND (
                ($3::INT IS NOT NULL AND host_id = $3) OR 
                ($4::UUID IS NOT NULL AND host_temporary_id = $4)
             )`,
            [new Date().toISOString(), id, userId, guest_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Room not found or unauthorized" });
        }

        // Realtime broadcast for deletion
        if (req.io) {
            req.io.emit('room_deleted', id);
        }

        res.status(200).json({
            success: true,
            message: "Room deleted successfully"
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal server error" });
    }
}