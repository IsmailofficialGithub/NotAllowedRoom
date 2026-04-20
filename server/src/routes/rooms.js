import express from 'express';
import { CreateRoom, GetRooms, DeleteRoom } from '../controller/roomController.js';
import { JoinRoom, LeaveRoom, GetParticipants } from '../controller/participantController.js';
import { SendMessage, GetMessages } from '../controller/messageController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Room Management
router.post('/create', protect, CreateRoom);
router.get('/', GetRooms);
router.delete('/:id', protect, DeleteRoom);

// Participants
router.post('/join', protect, JoinRoom);
router.post('/leave', protect, LeaveRoom);
router.get('/:room_id/participants', protect, GetParticipants);

// Messages
router.post('/message', protect, SendMessage);
router.get('/:room_id/messages', protect, GetMessages);

export default router;