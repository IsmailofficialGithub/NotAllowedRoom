import express from 'express';
import { CreateRoom, GetRooms, UpdateRoom, DeleteRoom } from '../controller/roomController.js';
import { JoinRoom, LeaveRoom, GetParticipants, RemoveParticipant } from '../controller/participantController.js';
import { SendMessage, GetMessages } from '../controller/messageController.js';
import { protect, optionalProtect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Room Management
router.post('/create', optionalProtect, CreateRoom);
router.get('/', optionalProtect, GetRooms);
router.patch('/:id', optionalProtect, UpdateRoom);
router.delete('/:id', optionalProtect, DeleteRoom);

// Participants
router.post('/join', optionalProtect, JoinRoom);
router.post('/leave', optionalProtect, LeaveRoom);
router.get('/:room_id/participants', optionalProtect, GetParticipants);
router.delete('/:room_id/participants/:participant_id', optionalProtect, RemoveParticipant);

// Messages
router.post('/message', optionalProtect, SendMessage);
router.get('/:room_id/messages', optionalProtect, GetMessages);

export default router;
