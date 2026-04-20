import { pool } from "../config/postgress_db.js";

export const CreateRoom = async (req, res) => {
    try {
        const { room_name, is_private, room_password } = req.body;
        if (!room_name) {
            return res.status(400).json({ message: "Room name is required" });
        }

        const userId = req.user.user_id;
        const now = new Date().toISOString();

        const result = await pool.query(
            "INSERT INTO rooms (host_id, room_name, created_at, updated_at, is_active, is_deleted, is_private, room_password) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
            [userId, room_name, now, now, true, false, is_private || false, room_password || null]
        );

        console.log('Room Created successfully');

        res.status(201).json({
            success: true,
            message: "Room created successfully",
            room: {
                ...result.rows[0],
                host_name: req.user.name
            }
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal server error" });
    }
}

export const GetRooms = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.*, u.name as host_name 
             FROM rooms r 
             JOIN user_profile u ON r.host_id = u.id 
             WHERE r.is_active = true AND r.is_deleted = false AND r.is_private = false
             ORDER BY r.created_at DESC`
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
        const userId = req.user.user_id;

        const result = await pool.query(
            "UPDATE rooms SET is_active = false, is_deleted = true, updated_at = $1 WHERE id = $2 AND host_id = $3",
            [new Date().toISOString(), id, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Room not found or unauthorized" });
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