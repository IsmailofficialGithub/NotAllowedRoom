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
    console.log(`⚡ Authenticated user connected: ${socket.data.user.name} (${socket.id})`);

    // Join a specific room group
    socket.on('join_room', (roomId) => {
        socket.join(`room_${roomId}`);
        console.log(`👥 User ${socket.id} joined room_${roomId}`);
    });

    // Handle real-time messaging
    socket.on('send_message', async (data) => {
        const { room_id, message, guest_id, guest_name } = data;
        const user = socket.data.user; // Verified user from middleware
        
        const userId = user?.user_id || null;
        const pName = user?.name || guest_name;
        const pGuestId = userId ? null : guest_id;

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
                guest_id: pGuestId,
                timestamp: now
            });
            
            console.log(`💬 Message sent in room_${room_id} by ${pName}`);
        } catch (error) {
            console.error('❌ Error saving socket message:', error.message);
            socket.emit('error', 'Message could not be sent');
        }
    });

    socket.on('disconnect', () => {
        console.log('👋 User disconnected:', socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});