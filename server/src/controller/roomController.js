import { v4 as uuidv4 } from 'uuid';

export const CreateRoom = (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ message: "Name is required" });
        }
        const roomId = uuidv4();

        const room = {
            id: roomId,
            hostName: name,
            createdAt: new Date.now().toISOString(),
            participates: []
        }
        room.set(roomId, room);
        console.log('Room Created successfully');


        res.status(201).json({
            success: true,
            message: "Room has been genereated",
            roomId: roomId
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal server error" });
    }


}