import express from 'express';
import { CreateRoom, GetRooms, DeleteRoom } from '../controller/roomController.js';
import { JoinRoom, LeaveRoom, GetParticipants } from '../controller/participantController.js';
import { SendMessage, GetMessages } from '../controller/messageController.js';
import { protect, optionalProtect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Room Management
router.post('/create', protect, CreateRoom);
router.get('/', optionalProtect, GetRooms);
router.delete('/:id', protect, DeleteRoom);

// Participants
router.post('/join', optionalProtect, JoinRoom);
router.post('/leave', optionalProtect, LeaveRoom);
router.get('/:room_id/participants', optionalProtect, GetParticipants);

// Messages
router.post('/message', optionalProtect, SendMessage);
router.get('/:room_id/messages', optionalProtect, GetMessages);

export default router;