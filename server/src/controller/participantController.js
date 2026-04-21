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
        // 2. Identify the user/guest identifiers
        const roomIdInt = parseInt(room_id);
        const userId = req.user?.id || null;
        let pName = (req.user?.name || guest_name || 'Guest').trim();
        const pEmail = req.user?.email || null;
        
        // guest_id logic: prefer the one passed, fallback to uuid if we're a guest
        let pGuestId = userId ? null : (guest_id && guest_id !== 'null' && guest_id !== '' ? guest_id : uuidv4());

        if (!userId && (!pName || pName === 'Guest') && !guest_name) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "Name is required for guest access" });
        }

        // 3. Search for ANY existing entry for this user/guest in this room (even removed ones)
        console.log(`🔍 [JoinRoom] Searching existing: room=${roomIdInt}, user=${userId}, guest=${pGuestId}`);
        
        const existingResult = await client.query(
            `SELECT id, is_removed, name FROM participants 
             WHERE room_id = $1 
             AND (
                ($2::INT IS NOT NULL AND user_id = $2) 
                OR 
                ($3::UUID IS NOT NULL AND user_tempeorary_id = $3)
             )
             ORDER BY created_at DESC LIMIT 1`,
            [roomIdInt, userId, pGuestId]
        );

        if (existingResult.rows.length > 0) {
            const participant = existingResult.rows[0];
            console.log(`📍 [JoinRoom] Found existing entry [ID: ${participant.id}]. Reactivating...`);

            await client.query(
                "UPDATE participants SET is_removed = false, name = $1, removed_at = null, updated_at = NOW() WHERE id = $2",
                [pName, participant.id]
            );

            // Broadcast count update
            if (req.io) {
                const countRes = await client.query("SELECT COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id::TEXT ELSE user_tempeorary_id::TEXT END) as count FROM participants WHERE room_id = $1 AND is_removed = false", [roomIdInt]);
                req.io.emit('participant_count_updated', {
                    room_id: roomIdInt,
                    participant_count: parseInt(countRes.rows[0].count)
                });
            }

            await client.query('COMMIT');
            return res.status(200).json({ 
                message: "Joined successfully (reused)", 
                participantId: participant.id,
                guest_id: pGuestId,
                name: pName
            });
        }

        // 4. Room Privacy Check for NEW entries
        if (room.is_private && room.room_password) {
            if (password !== room.room_password) {
                await client.query('ROLLBACK');
                return res.status(401).json({ message: "Incorrect room password", is_private: true });
            }
        }

        // 5. Insert New Entry
        console.log(`🆕 [JoinRoom] No existing entry found. Inserting new participant...`);
        const insertResult = await client.query(
            `INSERT INTO participants 
            (room_id, user_id, user_tempeorary_id, name, email, created_at, updated_at, is_allowed, is_removed) 
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), true, false) RETURNING id`,
            [roomIdInt, userId, pGuestId, pName, pEmail]
        );

        const newId = insertResult.rows[0].id;

        // Broadcast count update
        if (req.io) {
            const countRes = await client.query("SELECT COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id::TEXT ELSE user_tempeorary_id::TEXT END) as count FROM participants WHERE room_id = $1 AND is_removed = false", [roomIdInt]);
            req.io.emit('participant_count_updated', {
                room_id: roomIdInt,
                participant_count: parseInt(countRes.rows[0].count)
            });
        }

        await client.query('COMMIT');
        res.status(200).json({ 
            message: "Joined successfully (new)", 
            participantId: newId,
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
