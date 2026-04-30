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

// Parse CORS origins
let allowedOrigins = ['*'];
if (process.env.FRONT_CORS) {
    try {
        const corsValue = process.env.FRONT_CORS.trim();
        if (corsValue.startsWith('[') && corsValue.endsWith(']')) {
            // It looks like a JSON array or Python-style list
            const cleaned = corsValue.replace(/'/g, '"');
            allowedOrigins = JSON.parse(cleaned);
        } else {
            // It might be a comma-separated list or a single URL
            allowedOrigins = corsValue.split(',').map(o => o.trim());
        }
        
        // Clean up: remove trailing slashes and ensure strings
        allowedOrigins = allowedOrigins.map(o => 
            typeof o === 'string' ? o.trim().replace(/\/$/, "") : o
        );
        console.log("✅ Allowed CORS origins:", allowedOrigins);
    } catch (e) {
        console.error("❌ Error parsing FRONT_CORS:", e.message);
        // Fallback to split if JSON parse fails
        allowedOrigins = process.env.FRONT_CORS.split(',').map(o => o.trim().replace(/\/$/, ""));
    }
}

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.error(`🚫 CORS blocked for origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
};

app.use(cors(corsOptions));
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