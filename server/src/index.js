import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import roomRoutes from './routes/rooms.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 9000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.get('/roomRoute', roomRoutes)

app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: "Server is running",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    })
})

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});