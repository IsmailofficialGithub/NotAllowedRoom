import { pool } from "../config/postgress_db.js";

const activeCalls = new Map(); // Map<room_id, Set<socket_id>>

export const registerSocketHandlers = (io, socket) => {
    console.log(`⚡ User connected: ${socket.data.user?.name || 'Guest'} (${socket.id})`);

    // Helper to remove participant and notify others
    const handleParticipantLeave = async (customRoomId, customGuestId) => {
        const roomId = customRoomId || socket.data.room_id;
        const user = socket.data.user;
        const guestId = customGuestId || socket.data.guest_id;

        // Cleanup from active calls tracked in memory
        if (roomId && activeCalls.has(parseInt(roomId))) {
            activeCalls.get(parseInt(roomId)).delete(socket.id);
            if (activeCalls.get(parseInt(roomId)).size === 0) {
                activeCalls.delete(parseInt(roomId));
            }
        }

        if (roomId && (user || guestId)) {
            try {
                const userId = user?.id || null;
                const pGuestId = userId ? null : (guestId && guestId !== 'null' && guestId !== '' ? guestId : null);
                
                const updateResult = await pool.query(
                    "UPDATE participants SET is_removed = true, removed_at = $1 WHERE room_id = $2 AND ((user_id = $3 AND $3 IS NOT NULL) OR (user_tempeorary_id = $4 AND $4 IS NOT NULL))",
                    [new Date().toISOString(), roomId, userId, pGuestId]
                );

                const countResult = await pool.query(
                    "SELECT COUNT(id) FROM participants WHERE room_id = $1 AND is_removed = false",
                    [roomId]
                );
                
                const currentCount = parseInt(countResult.rows[0].count);
                io.emit('participant_count_updated', {
                    room_id: parseInt(roomId),
                    participant_count: currentCount
                });

                io.to(`room_${parseInt(roomId)}`).emit('participant_left', { 
                    user_id: userId, 
                    guest_id: pGuestId 
                });
            } catch (err) {
                console.error('Error in handleParticipantLeave:', err);
            }
        }
    };

    socket.on('join_room', async (data) => {
        const { room_id, guest_id } = data;
        const cleanRoomId = parseInt(room_id);
        const cleanGuestId = (guest_id && guest_id !== 'null' && guest_id !== '') ? guest_id : null;
        
        socket.data.room_id = cleanRoomId;
        socket.data.guest_id = cleanGuestId;

        await socket.join(`room_${cleanRoomId}`);
        console.log(`👥 Socket [${socket.id}] joined [room_${cleanRoomId}]`);

        // Notify if a call is active in this room
        if (activeCalls.has(cleanRoomId) && activeCalls.get(cleanRoomId).size > 0) {
            console.log(`📞 Notifying [${socket.id}] about active call in room_${cleanRoomId}`);
            socket.emit('call_in_progress', {
                room_id: cleanRoomId,
                participants_count: activeCalls.get(cleanRoomId).size
            });
        }
    });

    socket.on('send_message', async (data) => {
        const { room_id, message, guest_id, guest_name } = data;
        const user = socket.data.user; 
        
        const cleanRoomId = parseInt(room_id);
        const userId = user?.id || null;
        const pName = user?.name || guest_name;
        const pGuestId = userId ? null : (guest_id && guest_id !== 'null' && guest_id !== '' ? guest_id : socket.data.guest_id);

        if (!cleanRoomId || !message) return;

        try {
            const participantCheck = await pool.query(
                "SELECT id FROM participants WHERE room_id = $1 AND ((user_id = $2 AND $2 IS NOT NULL) OR (user_tempeorary_id = $3 AND $3 IS NOT NULL)) AND is_removed = false",
                [cleanRoomId, userId, pGuestId]
            );

            if (participantCheck.rows.length === 0) return;

            const now = new Date().toISOString();
            await pool.query(
                "INSERT INTO room_messages (room_id, user_id, user_tempeorary_id, message, created_at) VALUES ($1, $2, $3, $4, $5)",
                [cleanRoomId, userId, pGuestId, message, now]
            );

            io.to(`room_${cleanRoomId}`).emit('receive_message', {
                room_id: cleanRoomId,
                message,
                user_name: pName,
                user_id: userId,
                user_tempeorary_id: pGuestId,
                timestamp: now
            });
        } catch (err) {
            console.error('Socket message error:', err);
        }
    });

    socket.on('leave_room', (data) => {
        const roomId = parseInt(data?.room_id || socket.data.room_id);
        const guestId = data?.guest_id || socket.data.guest_id;
        handleParticipantLeave(roomId, guestId);
        socket.leave(`room_${roomId}`);
    });

    // --- WebRTC Signaling Handlers ---
    
    socket.on('join_call', (data) => {
        const { room_id } = data;
        const cleanRoomId = parseInt(room_id);
        console.log(`📞 User [${socket.id}] joined call in room_${cleanRoomId}`);
        
        // Track call participants
        if (!activeCalls.has(cleanRoomId)) {
            activeCalls.set(cleanRoomId, new Set());
        }
        activeCalls.get(cleanRoomId).add(socket.id);

        // Notify room that call is in progress
        io.to(`room_${cleanRoomId}`).emit('call_in_progress', {
            room_id: cleanRoomId,
            participants_count: activeCalls.get(cleanRoomId).size
        });
        
        socket.to(`room_${cleanRoomId}`).emit('user_joined_call', {
            socket_id: socket.id,
            user: socket.data.user || { name: `Guest ${socket.id.slice(0, 4)}`, is_guest: true }
        });
    });

    socket.on('call_signal', (data) => {
        const { to, signal } = data;
        io.to(to).emit('call_signal', {
            signal,
            from: socket.id,
            user: socket.data.user || { name: `Guest ${socket.id.slice(0, 4)}`, is_guest: true }
        });
    });

    socket.on('leave_call', (data) => {
        const { room_id } = data;
        const cleanRoomId = parseInt(room_id);
        
        if (activeCalls.has(cleanRoomId)) {
            activeCalls.get(cleanRoomId).delete(socket.id);
            if (activeCalls.get(cleanRoomId).size === 0) {
                activeCalls.delete(cleanRoomId);
                // Notify room that call ended
                io.to(`room_${cleanRoomId}`).emit('call_ended', { room_id: cleanRoomId });
            } else {
                // Update count
                io.to(`room_${cleanRoomId}`).emit('call_in_progress', {
                    room_id: cleanRoomId,
                    participants_count: activeCalls.get(cleanRoomId).size
                });
            }
        }

        console.log(`📵 User [${socket.id}] left call in room_${cleanRoomId}`);
        socket.to(`room_${cleanRoomId}`).emit('user_left_call', {
            socket_id: socket.id
        });
    });

    socket.on('disconnect', async () => {
        const roomId = socket.data.room_id;
        if (roomId && activeCalls.has(parseInt(roomId))) {
            activeCalls.get(parseInt(roomId)).delete(socket.id);
            if (activeCalls.get(parseInt(roomId)).size === 0) {
                activeCalls.delete(parseInt(roomId));
                io.to(`room_${parseInt(roomId)}`).emit('call_ended', { room_id: parseInt(roomId) });
            }
            socket.to(`room_${parseInt(roomId)}`).emit('user_left_call', {
                socket_id: socket.id
            });
        }
        await handleParticipantLeave();
        console.log('👋 User disconnected:', socket.id);
    });
};

import { Server } from 'socket.io';

export const setupSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token;
        if (token) {
            try {
                const result = await pool.query(
                    "SELECT u.id, u.name, u.email FROM auth_session s JOIN user_profile u ON s.user_id = u.id WHERE s.session_token = $1 AND s.is_active = true",
                    [token]
                );

                if (result.rows.length > 0) {
                    socket.data.user = result.rows[0];
                    console.log(`🔑 Socket Auth Success: ${socket.data.user.name}`);
                } else {
                    socket.data.user = null;
                }
            } catch (err) {
                console.error('Socket auth error:', err.message);
                socket.data.user = null;
            }
        } else {
            socket.data.user = null;
        }
        next();
    });

    io.on('connection', (socket) => {
        registerSocketHandlers(io, socket);
    });

    return io;
};
