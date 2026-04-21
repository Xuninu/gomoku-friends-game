import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

const BOARD_SIZE = 15;
const ROOM_ID_LENGTH = 6;
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 2;
const UNDO_PASSWORD = "1024";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function sanitizeName(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  return (value || "玩家").slice(0, 20);
}

function normalizeRoomId(raw) {
  const value = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return value.replace(/[^A-Z0-9]/g, "").slice(0, ROOM_ID_LENGTH);
}

function createEmptyBoard() {
  return new Array(BOARD_SIZE * BOARD_SIZE).fill(0);
}

function buildRoomState(room) {
  const restartVotes = room.players
    .filter((player) => room.restartVotes.has(player.socketId))
    .map((player) => ({
      name: player.name,
      color: player.color
    }));

  return {
    roomId: room.id,
    board: room.board,
    currentTurn: room.currentTurn,
    winner: room.winner,
    players: room.players.map((player) => ({
      name: player.name,
      color: player.color
    })),
    lastMove: room.lastMove,
    restartVotes
  };
}

function randomRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < ROOM_ID_LENGTH; i += 1) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

function generateUniqueRoomId() {
  let id = randomRoomId();
  while (rooms.has(id)) {
    id = randomRoomId();
  }
  return id;
}

function indexOfCell(row, col) {
  return row * BOARD_SIZE + col;
}

function inBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function countOneDirection(board, row, col, dx, dy, color) {
  let count = 0;
  let currentRow = row + dx;
  let currentCol = col + dy;

  while (inBounds(currentRow, currentCol)) {
    const idx = indexOfCell(currentRow, currentCol);
    if (board[idx] !== color) {
      break;
    }
    count += 1;
    currentRow += dx;
    currentCol += dy;
  }

  return count;
}

function isWinningMove(board, row, col, color) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];

  return directions.some(([dx, dy]) => {
    const contiguous =
      1 +
      countOneDirection(board, row, col, dx, dy, color) +
      countOneDirection(board, row, col, -dx, -dy, color);
    return contiguous >= 5;
  });
}

function findPlayer(room, socketId) {
  return room.players.find((player) => player.socketId === socketId);
}

function chooseColor(room) {
  if (room.players.length === 0) {
    return Math.random() < 0.5 ? 1 : 2;
  }

  const usedColors = new Set(room.players.map((player) => player.color));
  return usedColors.has(1) ? 2 : 1;
}

function resetGame(room) {
  room.board = createEmptyBoard();
  room.currentTurn = 1;
  room.winner = 0;
  room.lastMove = null;
  room.moveHistory = [];
  room.restartVotes.clear();
}

function emitRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }
  io.to(roomId).emit("room_state", buildRoomState(room));
}

function removePlayerFromRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) {
    return;
  }

  const room = rooms.get(roomId);
  socket.leave(roomId);

  if (!room) {
    socket.data.roomId = null;
    socket.data.color = null;
    return;
  }

  const playerIndex = room.players.findIndex((player) => player.socketId === socket.id);
  if (playerIndex >= 0) {
    room.players.splice(playerIndex, 1);
  }
  room.restartVotes.delete(socket.id);

  socket.data.roomId = null;
  socket.data.color = null;

  if (room.players.length === 0) {
    rooms.delete(roomId);
    return;
  }

  io.to(roomId).emit("notice", "有玩家离开了房间。");
  emitRoomState(roomId);
}

function joinRoom(socket, roomId, name) {
  const room = rooms.get(roomId);
  if (!room) {
    return { ok: false, error: "房间不存在。" };
  }

  if (room.players.length >= MAX_PLAYERS) {
    return { ok: false, error: "房间人数已满。" };
  }

  removePlayerFromRoom(socket);

  const player = {
    socketId: socket.id,
    name: sanitizeName(name),
    color: chooseColor(room)
  };

  room.players.push(player);
  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.color = player.color;

  io.to(roomId).emit("notice", `${player.name} 已加入房间。`);
  emitRoomState(roomId);

  return {
    ok: true,
    roomId,
    color: player.color
  };
}

io.on("connection", (socket) => {
  socket.on("create_room", (payload, callback) => {
    const roomId = generateUniqueRoomId();
    const room = {
      id: roomId,
      players: [],
      board: createEmptyBoard(),
      currentTurn: 1,
      winner: 0,
      lastMove: null,
      moveHistory: [],
      restartVotes: new Set()
    };
    rooms.set(roomId, room);

    const result = joinRoom(socket, roomId, payload?.name);
    callback?.(result);
  });

  socket.on("join_room", (payload, callback) => {
    const roomId = normalizeRoomId(payload?.roomId);
    if (!roomId) {
      callback?.({ ok: false, error: "请输入有效的房间码。" });
      return;
    }

    const result = joinRoom(socket, roomId, payload?.name);
    callback?.(result);
  });

  socket.on("place_stone", (payload, callback) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      callback?.({ ok: false, error: "你当前不在房间内。" });
      return;
    }

    const room = rooms.get(roomId);
    const player = findPlayer(room, socket.id);

    if (!player) {
      callback?.({ ok: false, error: "未找到玩家信息。" });
      return;
    }

    if (room.players.length < MAX_PLAYERS) {
      callback?.({ ok: false, error: "等待另一位玩家加入后才能落子。" });
      return;
    }

    if (room.winner !== 0) {
      callback?.({ ok: false, error: "对局已结束，请重新开局。" });
      return;
    }

    if (room.currentTurn !== player.color) {
      callback?.({ ok: false, error: "还没轮到你落子。" });
      return;
    }

    const row = Number(payload?.row);
    const col = Number(payload?.col);

    if (!Number.isInteger(row) || !Number.isInteger(col) || !inBounds(row, col)) {
      callback?.({ ok: false, error: "落子位置无效。" });
      return;
    }

    const idx = indexOfCell(row, col);
    if (room.board[idx] !== 0) {
      callback?.({ ok: false, error: "该位置已有棋子。" });
      return;
    }

    const move = { row, col, color: player.color };
    room.board[idx] = player.color;
    room.lastMove = move;
    room.moveHistory.push(move);
    room.restartVotes.clear();

    if (isWinningMove(room.board, row, col, player.color)) {
      room.winner = player.color;
    } else {
      room.currentTurn = player.color === 1 ? 2 : 1;
    }

    emitRoomState(roomId);
    callback?.({ ok: true });
  });

  socket.on("restart_game", (_payload, callback) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      callback?.({ ok: false, error: "你当前不在房间内。" });
      return;
    }

    const room = rooms.get(roomId);
    const player = findPlayer(room, socket.id);
    if (!player) {
      callback?.({ ok: false, error: "未找到玩家信息。" });
      return;
    }

    if (room.players.length < MAX_PLAYERS) {
      callback?.({ ok: false, error: "需要双方都在房间内，才能确认重新开局。" });
      return;
    }

    room.restartVotes.add(socket.id);

    if (room.restartVotes.size < MAX_PLAYERS) {
      emitRoomState(roomId);
      io.to(roomId).emit("notice", `${player.name} 已申请重新开局，等待对方确认。`);
      callback?.({ ok: true, pending: true });
      return;
    }

    resetGame(room);
    emitRoomState(roomId);
    io.to(roomId).emit("notice", "双方已确认，已重新开局。黑棋先手。");
    callback?.({ ok: true, restarted: true });
  });

  socket.on("undo_move", (payload, callback) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      callback?.({ ok: false, error: "你当前不在房间内。" });
      return;
    }

    const room = rooms.get(roomId);
    const player = findPlayer(room, socket.id);
    if (!player) {
      callback?.({ ok: false, error: "未找到玩家信息。" });
      return;
    }

    const password = typeof payload?.password === "string" ? payload.password.trim() : "";
    if (password !== UNDO_PASSWORD) {
      callback?.({ ok: false, error: "悔棋密码错误。" });
      return;
    }

    if (!Array.isArray(room.moveHistory) || room.moveHistory.length === 0) {
      callback?.({ ok: false, error: "当前没有可悔的棋步。" });
      return;
    }

    const lastMove = room.moveHistory.pop();
    const idx = indexOfCell(lastMove.row, lastMove.col);
    room.board[idx] = 0;
    room.winner = 0;
    room.currentTurn = lastMove.color;
    room.lastMove = room.moveHistory.length > 0 ? room.moveHistory[room.moveHistory.length - 1] : null;
    room.restartVotes.clear();

    emitRoomState(roomId);
    io.to(roomId).emit("notice", `${player.name} 发起了悔棋。`);
    callback?.({ ok: true });
  });

  socket.on("disconnect", () => {
    removePlayerFromRoom(socket);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Gomoku server running on http://localhost:${PORT}`);
});
