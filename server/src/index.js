import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import roomRoutes from './routes/rooms.js';
import connectDB from './config/postgress_db.js';
import authRoutes from './routes/auth.js';

dotenv.config();


const app = express();
const PORT = process.env.PORT || 9000;

//connect database when servers start
connectDB();



app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.use('/api/v1/rooms', roomRoutes)
app.use('/api/v1/auth', authRoutes)

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