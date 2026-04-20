import express from 'express';
import { CreateRoom, GetRooms, DeleteRoom } from '../controller/roomController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/create', protect, CreateRoom);
router.get('/', GetRooms); // Public list of active rooms
router.delete('/:id', protect, DeleteRoom);

export default router;