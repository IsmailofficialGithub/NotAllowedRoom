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
import { setupSocket } from './socket/socketHandlers.js';
const io = setupSocket(server);

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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something broke!' });
});

const PORT = process.env.PORT || 9000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});