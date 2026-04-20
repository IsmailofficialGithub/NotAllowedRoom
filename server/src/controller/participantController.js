import { pool } from "../config/postgress_db.js";
import { v4 as uuidv4 } from 'uuid';

export const JoinRoom = async (req, res) => {
    const client = await pool.connect();
    try {
        const { room_id, password, guest_name, guest_id } = req.body;
        
        if (!room_id) {
            return res.status(400).json({ message: "Room ID is required" });
        }

        await client.query('BEGIN');

        // 1. Check if room exists and LOCK it
        const roomResult = await client.query(
            "SELECT * FROM rooms WHERE id = $1 AND is_active = true FOR UPDATE", 
            [room_id]
        );
        
        if (roomResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Room not found" });
        }

        const room = roomResult.rows[0];
        const now = new Date().toISOString();
        let userId = req.user?.id || null;
        let pName = req.user?.name || guest_name;
        let pEmail = req.user?.email || null;
        let pGuestId = userId ? null : (guest_id && guest_id !== 'null' && guest_id !== '' ? guest_id : uuidv4());

        if (!userId && !pName) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "Name is required for guest access" });
        }

        // 2. Check if already in room (regardless of is_removed status)
        let existing = await client.query(
            `SELECT id, is_removed, name FROM participants 
             WHERE room_id = $1 AND ((user_id = $2 AND $2 IS NOT NULL) OR (user_tempeorary_id = $3 AND $3 IS NOT NULL))`,
            [room_id, userId, pGuestId]
        );

        if (existing.rows.length > 0) {
            const participant = existing.rows[0];
            const finalName = pName || participant.name;
            console.log(`🔄 Updating existing participant ${participant.id} for room ${room_id}`);

            await client.query(
                "UPDATE participants SET is_removed = false, name = $1, removed_at = null, updated_at = $2 WHERE id = $3",
                [finalName, now, participant.id]
            );

            if (req.io) {
                const countResult = await client.query(
                    "SELECT COUNT(id) FROM participants WHERE room_id = $1 AND is_removed = false",
                    [room_id]
                );
                req.io.emit('participant_count_updated', {
                    room_id: parseInt(room_id),
                    participant_count: parseInt(countResult.rows[0].count)
                });
            }

            await client.query('COMMIT');
            return res.status(200).json({ 
                message: "Joined successfully", 
                participantId: participant.id,
                guest_id: pGuestId,
                name: finalName
            });
        }

        // 3. Security Check
        if (room.is_private && room.room_password) {
            if (password !== room.room_password) {
                await client.query('ROLLBACK');
                return res.status(401).json({ message: "Incorrect room password", is_private: true });
            }
        }

        console.log(`🆕 Inserting new participant for room ${room_id}`);
        const insertResult = await client.query(
            `INSERT INTO participants 
            (room_id, user_id, user_tempeorary_id, name, email, created_at, updated_at, is_allowed) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [room_id, userId, pGuestId, pName, pEmail, now, now, true]
        );

        if (req.io) {
            const countResult = await client.query(
                "SELECT COUNT(id) FROM participants WHERE room_id = $1 AND is_removed = false",
                [room_id]
            );
            req.io.emit('participant_count_updated', {
                room_id: parseInt(room_id),
                participant_count: parseInt(countResult.rows[0].count)
            });
        }

        await client.query('COMMIT');
        res.status(200).json({ 
            message: "Joined successfully", 
            participantId: insertResult.rows[0].id,
            guest_id: pGuestId,
            name: pName 
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        client.release();
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
        const userId = req.user?.id || null;
        const pGuestId = userId ? null : (guest_id && guest_id !== 'null' && guest_id !== '' ? guest_id : null);

        console.log(`👋 Mark as removed: User ${userId} / Guest ${pGuestId} from room ${room_id}`);
        
        await pool.query(
            "UPDATE participants SET is_removed = true, removed_at = $1 WHERE room_id = $2 AND (($3::INT IS NOT NULL AND user_id = $3) OR ($4::UUID IS NOT NULL AND user_tempeorary_id = $4))",
            [new Date().toISOString(), room_id, userId, pGuestId]
        );

        // Broadcast new count
        if (req.io) {
            const countResult = await pool.query(
                "SELECT COUNT(id) FROM participants WHERE room_id = $1 AND is_removed = false",
                [room_id]
            );
            req.io.emit('participant_count_updated', {
                room_id: parseInt(room_id),
                participant_count: parseInt(countResult.rows[0].count)
            });
        }

        res.status(200).json({
            success: true,
            message: "Left room successfully"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};
