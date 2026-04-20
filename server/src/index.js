import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { pool } from './config/postgress_db.js';

// Routes
import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';

// Socket Handlers
import { registerSocketHandlers } from "./socket/socketHandlers.js";

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('NotAllowedRoom API is running...');
});

// Middleware to attach io to req
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Use Routes
app.use('/api/v1/rooms', roomRoutes);
app.use('/api/v1/auth', authRoutes);

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.status(200).json({ status: 'ok', database: 'connected' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
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
            "SELECT u.id, u.name, u.email FROM auth_session s JOIN user_profile u ON s.user_id = u.id WHERE s.session_token = $1 AND s.is_active = true",
            [token]
        );

        if (result.rows.length === 0) {
            socket.data.user = null; 
        } else {
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
    registerSocketHandlers(io, socket);
});

const PORT = process.env.PORT || 9000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});