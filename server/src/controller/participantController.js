import { pool } from "../config/postgress_db.js";
import { v4 as uuidv4 } from 'uuid';

export const JoinRoom = async (req, res) => {
    try {
        const { room_id } = req.body;
        if (!room_id) {
            return res.status(400).json({ message: "Room ID is required" });
        }

        // Check if room exists
        const roomCheck = await pool.query("SELECT id FROM rooms WHERE id = $1 AND is_active = true", [room_id]);
        if (roomCheck.rows.length === 0) {
            return res.status(404).json({ message: "Room not found" });
        }

        const userId = req.user.user_id;
        const now = new Date().toISOString();

        // Check if already in room
        const existing = await pool.query(
            "SELECT id FROM participants WHERE room_id = $1 AND user_id = $2 AND is_removed = false",
            [room_id, userId]
        );

        if (existing.rows.length > 0) {
            return res.status(200).json({ message: "Already joined", participantId: existing.rows[0].id });
        }

        const result = await pool.query(
            `INSERT INTO participants 
            (room_id, user_id, name, email, created_at, updated_at, is_allowed) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [room_id, userId, req.user.name, req.user.email, now, now, true]
        );

        res.status(201).json({
            success: true,
            message: "Joined room successfully",
            participantId: result.rows[0].id
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
        const { room_id } = req.body;
        const userId = req.user.user_id;

        await pool.query(
            "UPDATE participants SET is_removed = true, removed_at = $1 WHERE room_id = $2 AND user_id = $3",
            [new Date().toISOString(), room_id, userId]
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
