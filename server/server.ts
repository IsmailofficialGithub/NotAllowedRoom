import { Server, Socket } from "socket.io";
const io = new Server(3000);

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("message", (data) => {
    console.log("Received:", data);
    io.emit("broadcast", data);
  });
});
