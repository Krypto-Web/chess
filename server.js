const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// In-memory rooms: roomId -> { chess: Chess, players: { white: socketId, black: socketId } }
const rooms = {};

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('create-room', (cb) => {
    const roomId = uuidv4().slice(0, 8);
    const chess = new Chess();
    rooms[roomId] = {
      chess,
      players: { white: socket.id, black: null }
    };
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.color = 'w';
    cb({ ok: true, roomId, color: 'w' });
    io.to(roomId).emit('game-state', serializeGameState(rooms[roomId]));
  });

  socket.on('join-room', (roomId, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ ok: false, error: 'Room not found' });
    if (room.players.black && room.players.white) return cb({ ok: false, error: 'Room full' });

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.color = 'b';
    room.players.black = socket.id;
    cb({ ok: true, roomId, color: 'b' });

    // notify both
    io.to(roomId).emit('game-state', serializeGameState(room));
  });

  socket.on('move', (move, cb) => {
    // move: { from: 'e2', to: 'e4', promotion: 'q' }
    const roomId = socket.data.roomId;
    if (!roomId) return cb && cb({ ok: false, error: 'Not in room' });
    const room = rooms[roomId];
    if (!room) return cb && cb({ ok: false, error: 'Room missing' });

    // determine if it's this player's turn
    const currentTurn = room.chess.turn(); // 'w' or 'b'
    if (socket.data.color !== currentTurn) {
      return cb && cb({ ok: false, error: "Not your turn" });
    }

    const result = room.chess.move(move);
    if (result === null) {
      return cb && cb({ ok: false, error: 'Invalid move' });
    }

    io.to(roomId).emit('game-state', serializeGameState(room));
    cb && cb({ ok: true });
  });

  socket.on('new-game', (cb) => {
    const roomId = socket.data.roomId;
    if (!roomId) return cb && cb({ ok: false });
    rooms[roomId].chess = new Chess();
    io.to(roomId).emit('game-state', serializeGameState(rooms[roomId]));
    cb && cb({ ok: true });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    console.log('disconnect', socket.id, roomId);
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;
    if (room.players.white === socket.id) room.players.white = null;
    if (room.players.black === socket.id) room.players.black = null;

    // If both players gone, delete room
    if (!room.players.white && !room.players.black) {
      delete rooms[roomId];
    } else {
      io.to(roomId).emit('game-state', serializeGameState(room));
    }
  });
});

function serializeGameState(room) {
  const chess = room.chess;
  return {
    fen: chess.fen(),
    pgn: chess.pgn(),
    turn: chess.turn(), // 'w' or 'b'
    in_check: chess.in_check(),
    in_checkmate: chess.in_checkmate(),
    in_draw: chess.in_draw(),
    players: {
      white: room.players.white ? true : false,
      black: room.players.black ? true : false
    }
  };
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
