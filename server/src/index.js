import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import roomRoutes from './routes/rooms.js';
import connectDB, { pool } from './config/postgress_db.js';
import authRoutes from './routes/auth.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Adjust this in production
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 9000;

// Connect database when server starts
connectDB();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.use((req, res, next) => {
    req.io = io;
    next();
});

app.use('/api/v1/rooms', roomRoutes);
app.use('/api/v1/auth', authRoutes);

app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: "Server is running",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// Socket.io Middleware for Authentication
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            socket.data.user = null; // Guest user
            return next();
        }

        const result = await pool.query(
            "SELECT s.user_id, u.name, u.email FROM auth_session s JOIN user_profile u ON s.user_id = u.id WHERE s.session_token = $1 AND s.is_active = true",
            [token]
        );

        if (result.rows.length === 0) {
            socket.data.user = null; // Token invalid, fallback to guest
        } else {
            // Store user data in the socket for later use
            socket.data.user = result.rows[0];
        }
        
        next();
    } catch (err) {
        socket.data.user = null;
        next();
    }
});

// Socket.io Logic
io.on('connection', (socket) => {
    console.log(`⚡ Authenticated user connected: ${socket.data.user?.name || 'Guest'} (${socket.id})`);

    // Handle joining a room
    socket.on('join_room', (data) => {
        const roomId = typeof data === 'string' ? data : data.room_id;
        const guestId = typeof data === 'object' ? data.guest_id : null;
        
        socket.join(`room_${roomId}`);
        socket.data.room_id = roomId;
        if (guestId) socket.data.guest_id = guestId;

        console.log(`👥 User ${socket.id} joined room_${roomId}`);
    });

    // Handle real-time messaging
    socket.on('send_message', async (data) => {
        const { room_id, message, guest_id, guest_name } = data;
        const user = socket.data.user; 
        
        const userId = user?.id || null;
        const pName = user?.name || guest_name;
        const pGuestId = userId ? null : (guest_id || socket.data.guest_id);

        // Store guest_id for disconnect cleanup if not already set
        if (pGuestId && !socket.data.guest_id) socket.data.guest_id = pGuestId;

        try {
            // Security Check: Verify user or guest is a participant of this room
            const participantCheck = await pool.query(
                "SELECT id FROM participants WHERE room_id = $1 AND (user_id = $2 OR user_tempeorary_id = $3) AND is_removed = false",
                [room_id, userId, pGuestId]
            );

            if (participantCheck.rows.length === 0) {
                return socket.emit('error', 'Unauthorized: You are not a participant of this room');
            }

            // 1. Save to Database
            const now = new Date().toISOString();
            await pool.query(
                "INSERT INTO room_messages (room_id, user_id, user_tempeorary_id, message, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
                [room_id, userId, pGuestId, message, now, now]
            );

            // 2. Broadcast the message to everyone in the room
            io.to(`room_${room_id}`).emit('receive_message', {
                room_id,
                message,
                user_name: pName,
                user_id: userId,
                user_tempeorary_id: pGuestId,
                timestamp: now
            });
            
            console.log(`💬 Message sent in room_${room_id} by ${pName}`);
        } catch (error) {
            console.error('❌ Error saving socket message:', error.message);
            socket.emit('error', 'Message could not be sent');
        }
    });

    // Helper to remove participant and notify others
    const handleParticipantLeave = async (customRoomId, customGuestId) => {
        const roomId = customRoomId || socket.data.room_id;
        const user = socket.data.user;
        const guestId = customGuestId || socket.data.guest_id;

        if (roomId && (user || guestId)) {
            try {
                const userId = user?.id || null;
                const pGuestId = userId ? null : guestId;

                await pool.query(
                    "UPDATE participants SET is_removed = true, removed_at = $1 WHERE room_id = $2 AND (user_id = $3 OR user_tempeorary_id = $4)",
                    [new Date().toISOString(), roomId, userId, pGuestId]
                );
                
                // Notify others
                io.to(`room_${roomId}`).emit('participant_left', { 
                    user_id: userId, 
                    guest_id: pGuestId 
                });
                console.log(`👋 Participant removed from room_${roomId}`);
            } catch (err) {
                console.error('Error removing participant:', err.message);
            }
        }
    };

    socket.on('leave_room', (data) => {
        const roomId = data?.room_id || socket.data.room_id;
        const guestId = data?.guest_id || socket.data.guest_id;
        handleParticipantLeave(roomId, guestId);
        socket.leave(`room_${roomId}`);
    });

    // Handle disconnection - Remove from room database
    socket.on('disconnect', async () => {
        await handleParticipantLeave();
        console.log('👋 User disconnected:', socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});