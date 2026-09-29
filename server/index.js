const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = {};
const disconnectTimers = {}; // Track timeouts for reconnection grace period

const PAYOUTS = {
  'cooperate': { 'cooperate': [3, 3], 'defect': [0, 5] },
  'defect': { 'cooperate': [5, 0], 'defect': [1, 1] }
};

const generateRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create Room with custom options set by owner
  socket.on('create_room', ({ maxRounds, turnTime }) => {
    const roomCode = generateRoomCode();
    const requestedRounds = Number(maxRounds);
    const roundLimit = Number.isFinite(requestedRounds) ? Math.min(50, Math.max(1, requestedRounds)) : 5;
    rooms[roomCode] = {
      owner: socket.id,
      players: [socket.id],
      playerNames: { [socket.id]: "Player 1" },
      scores: { [socket.id]: 0 },
      choices: {},
      currentRound: 1,
      maxRounds: roundLimit,
      turnTime: turnTime || 30, // seconds
      status: 'waiting' // waiting, playing, paused, finished
    };
    socket.join(roomCode);
    socket.emit('room_created', roomCode);
  });

  // Join Room
  socket.on('join_room', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (room && room.players.length === 1 && room.status === 'waiting') {
      room.players.push(socket.id);
      room.playerNames[socket.id] = playerName || "Player 2";
      room.scores[socket.id] = 0;
      room.status = 'playing';
      socket.join(roomCode);
      
      io.to(roomCode).emit('game_start', { 
        maxRounds: room.maxRounds, 
        turnTime: room.turnTime,
        players: room.playerNames 
      });
    } else {
      socket.emit('error', 'Room is full, invalid, or already started');
    }
  });

  // Handle Player Choice
  socket.on('make_choice', ({ roomCode, choice }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== 'playing') return;

    room.choices[socket.id] = choice;

    if (Object.keys(room.choices).length === 2) {
      resolveRound(roomCode);
    } else {
      socket.to(roomCode).emit('opponent_locked');
    }
  });

  // Chat & Emotes
  socket.on('send_message', ({ roomCode, message, type }) => {
    io.to(roomCode).emit('receive_message', { sender: socket.id, message, type });
  });

  // Handle Disconnection (Grace Period Implementation)
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      if (room.players.includes(socket.id)) {
        if (room.status === 'finished') {
          delete rooms[roomCode];
          return;
        }

        room.status = 'paused';
        io.to(roomCode).emit('player_paused', { message: 'Opponent disconnected. Waiting for reconnection (60s)...' });

        // Give them 60 seconds to reconnect before forfeiting the game
        disconnectTimers[socket.id] = setTimeout(() => {
          if (rooms[roomCode] && rooms[roomCode].status === 'paused') {
            io.to(roomCode).emit('player_forfeited', { loser: socket.id });
            delete rooms[roomCode];
          }
        }, 60000);
      }
    }
  });

  // Reconnection Handling
  socket.on('reconnect_room', ({ roomCode, oldId }) => {
    const room = rooms[roomCode];
    if (room && room.players.includes(oldId)) {
      if (disconnectTimers[oldId]) clearTimeout(disconnectTimers[oldId]);

      // Swap out the old socket ID for the new socket ID
      room.players = room.players.map(id => id === oldId ? socket.id : id);
      room.scores[socket.id] = room.scores[oldId];
      delete room.scores[oldId];
      room.playerNames[socket.id] = room.playerNames[oldId];
      delete room.playerNames[oldId];

      if (room.owner === oldId) room.owner = socket.id;
      if (room.choices[oldId]) {
        room.choices[socket.id] = room.choices[oldId];
        delete room.choices[oldId];
      }

      socket.join(roomCode);
      room.status = 'playing';

      io.to(roomCode).emit('player_reconnected', { 
        maxRounds: room.maxRounds, 
        turnTime: room.turnTime,
        scores: room.scores,
        currentRound: room.currentRound
      });
    } else {
      socket.emit('error', 'Reconnection window expired or invalid room.');
    }
  });
});

function resolveRound(roomCode) {
  const room = rooms[roomCode];
  const p1 = room.players[0];
  const p2 = room.players[1];
  
  // Auto-default if a player failed to pick in time
  const p1Choice = room.choices[p1] || 'defect';
  const p2Choice = room.choices[p2] || 'defect';

  const [p1Gain, p2Gain] = PAYOUTS[p1Choice][p2Choice];
  room.scores[p1] += p1Gain;
  room.scores[p2] += p2Gain;

  io.to(p1).emit('round_result', { myChoice: p1Choice, opponentChoice: p2Choice, myScore: room.scores[p1], opponentScore: room.scores[p2], myGain: p1Gain, opponentGain: p2Gain });
  io.to(p2).emit('round_result', { myChoice: p2Choice, opponentChoice: p1Choice, myScore: room.scores[p2], opponentScore: room.scores[p1], myGain: p2Gain, opponentGain: p1Gain });

  if (room.currentRound >= room.maxRounds) {
    room.status = 'finished';
    io.to(roomCode).emit('game_over', room.scores);
  } else {
    room.currentRound++;
    room.choices = {};
    io.to(roomCode).emit('next_round', room.currentRound);
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));