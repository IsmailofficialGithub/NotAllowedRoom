import { pool } from "../config/postgress_db.js";

export const registerSocketHandlers = (io, socket) => {
    console.log(`⚡ User connected: ${socket.data.user?.name || 'Guest'} (${socket.id})`);

    // Helper to remove participant and notify others
    const handleParticipantLeave = async (customRoomId, customGuestId) => {
        const roomId = customRoomId || socket.data.room_id;
        const user = socket.data.user;
        const guestId = customGuestId || socket.data.guest_id;

        if (roomId && (user || guestId)) {
            try {
                const userId = user?.id || null;
                const pGuestId = userId ? null : (guestId && guestId !== 'null' && guestId !== '' ? guestId : null);
                
                console.log(`📡 Socket Leave Flow:`);
                console.log(`   - Room: ${roomId} (${typeof roomId})`);
                console.log(`   - User: ${userId} (${typeof userId})`);
                console.log(`   - Guest: ${pGuestId} (${typeof pGuestId})`);

                const updateResult = await pool.query(
                    "UPDATE participants SET is_removed = true, removed_at = $1 WHERE room_id = $2 AND ((user_id = $3 AND $3 IS NOT NULL) OR (user_tempeorary_id = $4 AND $4 IS NOT NULL))",
                    [new Date().toISOString(), roomId, userId, pGuestId]
                );

                if (updateResult.rowCount === 0) {
                    console.warn(`⚠️ No participant row updated for exit. (This identity was likely already removed or never existed)`);
                }


                
                const countResult = await pool.query(
                    "SELECT COUNT(id) FROM participants WHERE room_id = $1 AND is_removed = false",
                    [roomId]
                );
                
                const currentCount = parseInt(countResult.rows[0].count);
                console.log(`📢 Broadcasting count ${currentCount} for room ${roomId} to all clients`);
                io.emit('participant_count_updated', {
                    room_id: parseInt(roomId),
                    participant_count: currentCount
                });

                // Notify others in the specific room about the specific person leaving
                console.log(`📢 Notifying room_${roomId} about participant exit: User:${userId} Guest:${pGuestId}`);
                io.to(`room_${parseInt(roomId)}`).emit('participant_left', { 
                    user_id: userId, 
                    guest_id: pGuestId 
                });

                console.log(`👋 Participant removed from room_${roomId}. Broadcasts complete.`);
            } catch (err) {
                console.error('Error in handleParticipantLeave:', err);
            }
        }
    };

    socket.on('join_room', async (data) => {
        const { room_id, guest_id } = data;
        const cleanRoomId = parseInt(room_id);
        const cleanGuestId = (guest_id && guest_id !== 'null' && guest_id !== '') ? guest_id : null;
        
        // Store in socket for disconnect handling
        socket.data.room_id = cleanRoomId;
        socket.data.guest_id = cleanGuestId;

        await socket.join(`room_${cleanRoomId}`);
        console.log(`👥 Socket [${socket.id}] successfully joined [room_${cleanRoomId}] as Guest:${cleanGuestId}`);
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
            console.log(`📝 Msg from [${socket.id}]: User:${userId} / Guest:${pGuestId} for room:${cleanRoomId}`);
            
            // Check if user/guest is participant
            const participantCheck = await pool.query(
                "SELECT id FROM participants WHERE room_id = $1 AND ((user_id = $2 AND $2 IS NOT NULL) OR (user_tempeorary_id = $3 AND $3 IS NOT NULL)) AND is_removed = false",
                [cleanRoomId, userId, pGuestId]
            );

            if (participantCheck.rows.length === 0) {
                console.warn(`⚠️ Send blocked: Socket [${socket.id}] identity not found in room ${cleanRoomId}`);
                return socket.emit('error', 'You must join the room before sending messages');
            }

            const now = new Date().toISOString();
            await pool.query(
                "INSERT INTO room_messages (room_id, user_id, user_tempeorary_id, message, created_at) VALUES ($1, $2, $3, $4, $5)",
                [cleanRoomId, userId, pGuestId, message, now]
            );

            console.log(`📡 Success. Socket [${socket.id}] broadcasting to room_${cleanRoomId}`);
            io.to(`room_${cleanRoomId}`).emit('receive_message', {
                room_id: cleanRoomId,
                message,
                user_name: pName,
                user_id: userId,
                user_tempeorary_id: pGuestId,
                timestamp: now
            });
        } catch (err) {
            console.error('Socket message error details:', err);
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
        
        // Notify others that a new user joined the call
        socket.to(`room_${cleanRoomId}`).emit('user_joined_call', {
            socket_id: socket.id,
            user: socket.data.user || { name: `Guest ${socket.id.slice(0, 4)}`, is_guest: true }
        });
    });

    socket.on('call_signal', (data) => {
        const { to, signal, from } = data;
        console.log(`📡 Relaying signal from [${socket.id}] to [${to}] type: ${signal.type || 'ice-candidate'}`);
        io.to(to).emit('call_signal', {
            signal,
            from: socket.id,
            user: socket.data.user || { name: `Guest ${socket.id.slice(0, 4)}`, is_guest: true }
        });
    });

    socket.on('leave_call', (data) => {
        const { room_id } = data;
        const cleanRoomId = parseInt(room_id);
        console.log(`📵 User [${socket.id}] left call in room_${cleanRoomId}`);
        socket.to(`room_${cleanRoomId}`).emit('user_left_call', {
            socket_id: socket.id
        });
    });

    socket.on('disconnect', async () => {
        // Notify call participants if they were in a call
        if (socket.data.room_id) {
            socket.to(`room_${socket.data.room_id}`).emit('user_left_call', {
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
