import { pool } from "../config/postgress_db.js";
import { v4 as uuidv4 } from 'uuid';

export const JoinRoom = async (req, res) => {
    try {
        const { room_id, password, guest_name, guest_id } = req.body;
        if (!room_id) {
            return res.status(400).json({ message: "Room ID is required" });
        }

        // 1. Fetch room details including privacy info
        const roomResult = await pool.query(
            "SELECT id, is_private, room_password FROM rooms WHERE id = $1 AND is_active = true", 
            [room_id]
        );
        
        if (roomResult.rows.length === 0) {
            return res.status(404).json({ message: "Room not found" });
        }

        const room = roomResult.rows[0];
        const now = new Date().toISOString();
        let userId = req.user?.user_id || null;
        let pName = req.user?.name || guest_name;
        let pEmail = req.user?.email || null;
        let pGuestId = userId ? null : (guest_id || uuidv4());

        if (!pName) {
            return res.status(400).json({ message: "Name is required for guest access" });
        }

        // 2. Check if already in room (prevent duplicates & bypass password for existing members)
        const existing = await pool.query(
            "SELECT id FROM participants WHERE room_id = $1 AND (user_id = $2 OR user_tempeorary_id = $3) AND is_removed = false",
            [room_id, userId, pGuestId]
        );

        if (existing.rows.length > 0) {
            return res.status(200).json({ 
                message: "Already joined", 
                participantId: existing.rows[0].id,
                guest_id: pGuestId 
            });
        }

        // 3. Security Check for Private Rooms (Only for new participants)
        if (room.is_private && room.room_password) {
            if (password !== room.room_password) {
                return res.status(401).json({ message: "Incorrect room password", is_private: true });
            }
        }

        const result = await pool.query(
            `INSERT INTO participants 
            (room_id, user_id, user_tempeorary_id, name, email, created_at, updated_at, is_allowed) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [room_id, userId, pGuestId, pName, pEmail, now, now, true]
        );

        res.status(201).json({
            success: true,
            message: "Joined room successfully",
            participantId: result.rows[0].id,
            guest_id: pGuestId
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const GetParticipants = async (req, res) => {
    try {
        const { room_id } = req.params;
        const result = await pool.query(
            "SELECT p.*, u.name as user_name FROM participants p LEFT JOIN user_profile u ON p.user_id = u.id WHERE p.room_id = $1 AND p.is_removed = false",
            [room_id]
        );

        res.status(200).json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const LeaveRoom = async (req, res) => {
    try {
        const { room_id, guest_id } = req.body;
        const userId = req.user?.user_id || null;
        const pGuestId = userId ? null : guest_id;

        await pool.query(
            "UPDATE participants SET is_removed = true, removed_at = $1 WHERE room_id = $2 AND (user_id = $3 OR user_tempeorary_id = $4)",
            [new Date().toISOString(), room_id, userId, pGuestId]
        );

        res.status(200).json({
            success: true,
            message: "Left room successfully"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};
