import { pool } from "../config/postgress_db.js";

export const SendMessage = async (req, res) => {
    try {
        const { room_id, message, guest_id } = req.body;
        if (!room_id || !message) {
            return res.status(400).json({ message: "Room ID and message are required" });
        }

        const userId = req.user?.user_id || null;
        const pGuestId = userId ? null : guest_id;

        // Check if user or guest is a participant
        const participantCheck = await pool.query(
            "SELECT id FROM participants WHERE room_id = $1 AND (user_id = $2 OR user_tempeorary_id = $3) AND is_removed = false",
            [room_id, userId, pGuestId]
        );

        if (participantCheck.rows.length === 0) {
            return res.status(403).json({ message: "You must join the room before sending messages" });
        }

        const now = new Date().toISOString();
        const result = await pool.query(
            "INSERT INTO room_messages (room_id, user_id, user_tempeorary_id, message, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
            [room_id, userId, pGuestId, message, now, now]
        );

        res.status(201).json({
            success: true,
            message: "Message sent",
            messageId: result.rows[0].id
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const GetMessages = async (req, res) => {
    try {
        const { room_id } = req.params;
        
        const result = await pool.query(
            `SELECT m.*, u.name as user_name 
             FROM room_messages m 
             JOIN user_profile u ON m.user_id = u.id 
             WHERE m.room_id = $1 
             ORDER BY m.created_at ASC`,
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
