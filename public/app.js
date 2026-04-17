const BOARD_SIZE = 15;
const CELL_SIZE = 40;
const PADDING = 30;
const CANVAS_SIZE = PADDING * 2 + CELL_SIZE * (BOARD_SIZE - 1);

const socket = io();

const startPanel = document.getElementById("startPanel");
const gamePanel = document.getElementById("gamePanel");
const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const startError = document.getElementById("startError");

const roomLabel = document.getElementById("roomLabel");
const shareLink = document.getElementById("shareLink");
const copyBtn = document.getElementById("copyBtn");
const restartBtn = document.getElementById("restartBtn");
const undoBtn = document.getElementById("undoBtn");
const leaveBtn = document.getElementById("leaveBtn");
const blackPlayer = document.getElementById("blackPlayer");
const whitePlayer = document.getElementById("whitePlayer");
const statusText = document.getElementById("statusText");
const noticeText = document.getElementById("noticeText");
const boardCanvas = document.getElementById("boardCanvas");
const ctx = boardCanvas.getContext("2d");

boardCanvas.width = CANVAS_SIZE;
boardCanvas.height = CANVAS_SIZE;

const state = {
  roomId: "",
  myColor: 0,
  board: new Array(BOARD_SIZE * BOARD_SIZE).fill(0),
  currentTurn: 1,
  winner: 0,
  players: [],
  lastMove: null
};

function colorName(color) {
  if (color === 1) {
    return "Black";
  }
  if (color === 2) {
    return "White";
  }
  return "Unknown";
}

function playerName() {
  const value = nameInput.value.trim();
  return value || "Player";
}

function setStartError(message = "") {
  startError.textContent = message;
}

function setNotice(message = "") {
  noticeText.textContent = message;
}

function updateShareLink() {
  const url = new URL(window.location.href);
  url.searchParams.set("room", state.roomId);
  shareLink.value = url.toString();
}

function updatePlayersUI() {
  const black = state.players.find((p) => p.color === 1);
  const white = state.players.find((p) => p.color === 2);

  blackPlayer.textContent = `Black: ${black ? black.name : "waiting..."}`;
  whitePlayer.textContent = `White: ${white ? white.name : "waiting..."}`;
}

function updateStatusUI() {
  if (state.winner !== 0) {
    const winText = state.winner === state.myColor ? "You win!" : `${colorName(state.winner)} wins!`;
    statusText.textContent = `Game over: ${winText}`;
    return;
  }

  if (state.players.length < 2) {
    statusText.textContent = "Waiting for another player to join...";
    return;
  }

  const turnLabel = colorName(state.currentTurn);
  if (state.currentTurn === state.myColor) {
    statusText.textContent = `Your turn (${turnLabel})`;
  } else {
    statusText.textContent = `Opponent's turn (${turnLabel})`;
  }
}

function drawBoard() {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.fillStyle = "#c89a5f";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.strokeStyle = "#6f4d2c";
  ctx.lineWidth = 1;

  for (let i = 0; i < BOARD_SIZE; i += 1) {
    const offset = PADDING + i * CELL_SIZE;

    ctx.beginPath();
    ctx.moveTo(PADDING, offset);
    ctx.lineTo(CANVAS_SIZE - PADDING, offset);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(offset, PADDING);
    ctx.lineTo(offset, CANVAS_SIZE - PADDING);
    ctx.stroke();
  }

  const stars = [
    [3, 3],
    [3, 11],
    [7, 7],
    [11, 3],
    [11, 11]
  ];

  ctx.fillStyle = "#5f3f1f";
  stars.forEach(([row, col]) => {
    const x = PADDING + col * CELL_SIZE;
    const y = PADDING + row * CELL_SIZE;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPieces() {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const value = state.board[row * BOARD_SIZE + col];
      if (!value) {
        continue;
      }

      const x = PADDING + col * CELL_SIZE;
      const y = PADDING + row * CELL_SIZE;
      const radius = 16;

      const gradient = ctx.createRadialGradient(x - 4, y - 6, 1, x, y, radius);
      if (value === 1) {
        gradient.addColorStop(0, "#4f4f4f");
        gradient.addColorStop(1, "#0f0f0f");
      } else {
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(1, "#dcdcdc");
      }

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
      ctx.stroke();
    }
  }
}

function drawLastMoveMarker() {
  if (!state.lastMove) {
    return;
  }

  const x = PADDING + state.lastMove.col * CELL_SIZE;
  const y = PADDING + state.lastMove.row * CELL_SIZE;

  ctx.strokeStyle = state.lastMove.color === 1 ? "#f5f5f5" : "#1c1c1c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.stroke();
}

function render() {
  updatePlayersUI();
  updateStatusUI();
  drawBoard();
  drawPieces();
  drawLastMoveMarker();
}

function enterGame() {
  startPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");
  roomLabel.textContent = state.roomId;
  updateShareLink();
  render();
}

function leaveGame() {
  window.location.href = window.location.pathname;
}

function handleJoinResponse(response) {
  if (!response?.ok) {
    setStartError(response?.error || "Unable to join room.");
    return;
  }

  state.roomId = response.roomId;
  state.myColor = response.color;
  setStartError("");
  setNotice(`You are ${colorName(state.myColor)}.`);
  enterGame();
}

createRoomBtn.addEventListener("click", () => {
  socket.emit("create_room", { name: playerName() }, handleJoinResponse);
});

joinRoomBtn.addEventListener("click", () => {
  const roomId = roomInput.value.trim().toUpperCase();
  socket.emit("join_room", { roomId, name: playerName() }, handleJoinResponse);
});

roomInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    joinRoomBtn.click();
  }
});

nameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    createRoomBtn.click();
  }
});

copyBtn.addEventListener("click", async () => {
  if (!shareLink.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(shareLink.value);
    setNotice("Share link copied.");
  } catch (_err) {
    setNotice("Clipboard unavailable. Please copy manually.");
  }
});

restartBtn.addEventListener("click", () => {
  socket.emit("restart_game", {}, (response) => {
    if (!response?.ok) {
      setNotice(response?.error || "Failed to restart game.");
    }
  });
});

undoBtn.addEventListener("click", () => {
  const password = window.prompt("Please input undo password");
  if (password === null) {
    return;
  }

  socket.emit("undo_move", { password }, (response) => {
    if (!response?.ok) {
      setNotice(response?.error || "Failed to undo.");
      return;
    }
    setNotice("Undo successful.");
  });
});

leaveBtn.addEventListener("click", () => {
  leaveGame();
});

boardCanvas.addEventListener("click", (event) => {
  if (!state.roomId) {
    return;
  }
  if (state.winner !== 0) {
    setNotice("Game is over. Press Restart.");
    return;
  }
  if (state.currentTurn !== state.myColor) {
    setNotice("Please wait for your turn.");
    return;
  }

  const rect = boardCanvas.getBoundingClientRect();
  const scaleX = boardCanvas.width / rect.width;
  const scaleY = boardCanvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  const col = Math.round((x - PADDING) / CELL_SIZE);
  const row = Math.round((y - PADDING) / CELL_SIZE);

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return;
  }

  const canvasX = PADDING + col * CELL_SIZE;
  const canvasY = PADDING + row * CELL_SIZE;
  const distance = Math.hypot(x - canvasX, y - canvasY);
  if (distance > CELL_SIZE * 0.45) {
    return;
  }

  socket.emit("place_stone", { row, col }, (response) => {
    if (!response?.ok) {
      setNotice(response?.error || "Invalid move.");
    }
  });
});

socket.on("room_state", (roomState) => {
  state.board = roomState.board;
  state.currentTurn = roomState.currentTurn;
  state.winner = roomState.winner;
  state.players = roomState.players;
  state.lastMove = roomState.lastMove;
  if (!state.roomId) {
    state.roomId = roomState.roomId;
  }
  render();
});

socket.on("notice", (message) => {
  setNotice(message);
});

const params = new URLSearchParams(window.location.search);
const roomFromUrl = params.get("room");
if (roomFromUrl) {
  roomInput.value = roomFromUrl.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

render();
