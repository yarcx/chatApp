import { createServer } from "http";
import express from "express";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || "3500";

const ADMIN = "Admin";

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const appServer = app.listen(PORT, () => console.log("server is running on port " + PORT));

// state
const UsersState = {
  users: [],
  setUsers: function (newUsersArray) {
    this.users = newUsersArray;
  },
};

const io = new Server(appServer, {
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? false
        : ["http://127.0.0.1:5500", "http://localhost:5500"],
  },
});

io.on("connection", (socket) => {
  const userId = socket.id.substring(0, 5);

  // Socket.emit sends message to the logged in user only
  socket.emit("message", buildMsg(ADMIN, "Welcome to chat App"));

  socket.on("enterRoom", ({ name, room }) => {
    // leave previous room
    const prevRoom = getUser(socket.id)?.room;

    if (prevRoom) {
      socket.leave(prevRoom);
      io.to(prevRoom).emit("message", buildMsg(ADMIN, `${name} has left the room`));
    }

    const user = activateUser(socket.id, name, room);

    console.log(user, "after entering a room");

    // Cannot update the previous users list until after the state update ina activate user

    if (prevRoom) {
      io.to(prevRoom).emit("userList", {
        users: getUsersInRoom(prevRoom),
      });
    }

    socket.join(user.room);

    // To user who joined
    socket.emit("message", buildMsg(ADMIN, `You have joined the ${user.room} chat room`));

    // broadcast this message to everyone in the room group chat
    socket.broadcast
      .to(user.room)
      .emit("message", buildMsg(ADMIN, `${user.name} has joined the room`));

    // update user list of the particular room
    io.to(user.room).emit("userList", {
      users: getUsersInRoom(user.room),
    });

    // update the list for everyone
    io.emit("roomList", {
      rooms: getAllActiveRooms(),
    });
  });

  // when user disconnect, this should be sent to all others
  socket.on("disconnect", () => {
    const user = getUser(socket.id);
    userLeavesApp(socket.id);

    if (user) {
      io.to(user.room).emit("message", buildMsg(ADMIN, `${user.name} has left the room`));

      io.to(user.room).emit("userList", {
        users: getUsersInRoom(user.room),
      });

      io.emit("roomList", {
        rooms: getAllActiveRooms(),
      });
    }

    console.log(`User ${socket.id} disconnected`);
  });

  socket.on("message", ({ name, text }) => {
    const room = getUser(socket.id)?.room;
    if (room) {
      io.to(room).emit("message", buildMsg(name, text));
    }
  });
  // Socket.on is listening for any event
  socket.on("activity", (name) => {
    const room = getUser(socket.id)?.room;
    if (room) {
      socket.broadcast.to(room).emit("activity", buildMsg(name, name + " is typing..."));
    }
  });
});

function buildMsg(name, text) {
  return {
    name,
    text,
    time: new Intl.DateTimeFormat("default", {
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }).format(new Date()),
  };
}

// User functions
function activateUser(id, name, room) {
  const user = { id, name, room };
  UsersState.setUsers([...UsersState.users.filter((user) => user.id !== id), user]);
  return user;
}

function userLeavesApp(id) {
  UsersState.setUsers(UsersState.users.filter((user) => user.id !== id));
}

function getUser(id) {
  return UsersState.users.find((user) => user.id === id);
}

function getUsersInRoom(room) {
  return UsersState.users.filter((user) => user.room === room);
}

function getAllActiveRooms() {
  return Array.from(new Set(UsersState.users.map((user) => user.room)));
}
