import { Server,Socket } from "socket.io";
const io = new Server(3000); // Running on port 3000

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Listen for a custom event
  socket.on("message", (data) => {
    console.log("Received:", data);
    // Broadcast to all connected clients
    io.emit("broadcast", data);
  });
});
