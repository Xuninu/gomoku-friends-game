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
const restartHint = document.getElementById("restartHint");
const noticeText = document.getElementById("noticeText");
const previewActions = document.getElementById("previewActions");
const previewText = document.getElementById("previewText");
const confirmMoveBtn = document.getElementById("confirmMoveBtn");
const cancelPreviewBtn = document.getElementById("cancelPreviewBtn");
const resultModal = document.getElementById("resultModal");
const resultTitle = document.getElementById("resultTitle");
const resultMessage = document.getElementById("resultMessage");
const closeResultBtn = document.getElementById("closeResultBtn");
const restartFromResultBtn = document.getElementById("restartFromResultBtn");
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
  lastMove: null,
  restartVotes: [],
  pendingMove: null,
  hoverMove: null,
  lastAnnouncedWinner: 0
};

function colorName(color) {
  if (color === 1) {
    return "黑棋";
  }
  if (color === 2) {
    return "白棋";
  }
  return "未知";
}

function playerName() {
  const value = nameInput.value.trim();
  return value || "玩家";
}

function indexOfCell(row, col) {
  return row * BOARD_SIZE + col;
}

function sameCell(a, b) {
  return Boolean(a && b && a.row === b.row && a.col === b.col);
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
  const mySuffix = "（你）";

  blackPlayer.textContent = `黑棋：${black ? black.name : "等待加入..."}${state.myColor === 1 && black ? mySuffix : ""}`;
  whitePlayer.textContent = `白棋：${white ? white.name : "等待加入..."}${state.myColor === 2 && white ? mySuffix : ""}`;
}

function updateStatusUI() {
  if (state.winner !== 0) {
    const winText = state.winner === state.myColor ? "你赢了！" : `${colorName(state.winner)}获胜`;
    statusText.textContent = `对局结束：${winText}`;
    return;
  }

  if (state.players.length < 2) {
    statusText.textContent = `你执${colorName(state.myColor)}，等待另一位玩家加入房间...`;
    return;
  }

  const turnLabel = colorName(state.currentTurn);
  if (state.currentTurn === state.myColor) {
    statusText.textContent = `轮到你落子（${turnLabel}）。先点击棋盘预览，再确认落子。`;
  } else {
    statusText.textContent = `对手回合（${turnLabel}），请稍候。`;
  }
}

function updateRestartUI() {
  const votes = Array.isArray(state.restartVotes) ? state.restartVotes : [];
  const voted = votes.some((vote) => vote.color === state.myColor);

  restartBtn.disabled = state.players.length >= 2 && voted;
  restartBtn.textContent = voted ? "等待对方确认" : "重新开局";

  if (votes.length === 0 || state.players.length < 2) {
    restartHint.textContent = "";
    return;
  }

  const names = votes.map((vote) => `${vote.name}（${colorName(vote.color)}）`).join("、");
  restartHint.textContent = `重新开局确认中：${names} 已同意。`;
}

function updatePreviewUI() {
  if (!state.pendingMove) {
    previewActions.classList.add("hidden");
    previewText.textContent = "";
    return;
  }

  previewActions.classList.remove("hidden");
  previewText.textContent = `已预览：第 ${state.pendingMove.row + 1} 行，第 ${state.pendingMove.col + 1} 列`;
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
      const value = state.board[indexOfCell(row, col)];
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

function drawGhostStone(move, alpha, ringColor) {
  if (!move || !state.myColor || state.board[indexOfCell(move.row, move.col)] !== 0) {
    return;
  }

  const x = PADDING + move.col * CELL_SIZE;
  const y = PADDING + move.row * CELL_SIZE;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = state.myColor === 1 ? "#101010" : "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMovePreview() {
  if (state.pendingMove) {
    drawGhostStone(state.pendingMove, 0.62, "rgba(188, 52, 35, 0.82)");
    return;
  }

  if (canInteractWithBoard(false)) {
    drawGhostStone(state.hoverMove, 0.28, "rgba(54, 94, 74, 0.54)");
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
  updateRestartUI();
  updatePreviewUI();
  drawBoard();
  drawPieces();
  drawMovePreview();
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

function clearMovePreview() {
  state.pendingMove = null;
  state.hoverMove = null;
}

function canInteractWithBoard(showMessage = true) {
  if (!state.roomId) {
    return false;
  }
  if (state.players.length < 2) {
    if (showMessage) {
      setNotice("等待另一位玩家加入后才能落子。");
    }
    return false;
  }
  if (state.winner !== 0) {
    if (showMessage) {
      setNotice("对局已经结束，需要双方确认后才能重新开局。");
    }
    return false;
  }
  if (state.currentTurn !== state.myColor) {
    if (showMessage) {
      setNotice("还没轮到你，请稍候。");
    }
    return false;
  }
  return true;
}

function getCellFromPointer(event) {
  const rect = boardCanvas.getBoundingClientRect();
  const scaleX = boardCanvas.width / rect.width;
  const scaleY = boardCanvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  const col = Math.round((x - PADDING) / CELL_SIZE);
  const row = Math.round((y - PADDING) / CELL_SIZE);

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return null;
  }

  const canvasX = PADDING + col * CELL_SIZE;
  const canvasY = PADDING + row * CELL_SIZE;
  const distance = Math.hypot(x - canvasX, y - canvasY);
  if (distance > CELL_SIZE * 0.45) {
    return null;
  }

  return { row, col };
}

function canPlaceAt(row, col, showMessage = true) {
  if (!canInteractWithBoard(showMessage)) {
    return false;
  }

  if (state.board[indexOfCell(row, col)] !== 0) {
    if (showMessage) {
      setNotice("该位置已有棋子，请选择其他位置。");
    }
    return false;
  }

  return true;
}

function setPendingMove(move) {
  if (!canPlaceAt(move.row, move.col)) {
    clearMovePreview();
    render();
    return;
  }

  state.pendingMove = move;
  state.hoverMove = null;
  setNotice(`已预览第 ${move.row + 1} 行第 ${move.col + 1} 列。点击“确认落子”或再次点击该位置即可落子。`);
  render();
}

function confirmPendingMove() {
  if (!state.pendingMove) {
    return;
  }

  const move = state.pendingMove;
  if (!canPlaceAt(move.row, move.col)) {
    clearMovePreview();
    render();
    return;
  }

  socket.emit("place_stone", { row: move.row, col: move.col }, (response) => {
    if (!response?.ok) {
      setNotice(response?.error || "落子无效。");
      clearMovePreview();
      render();
      return;
    }
    setNotice("落子已确认。");
    clearMovePreview();
    render();
  });
}

function showResultModal(winner) {
  const winnerName = colorName(winner);
  const isMe = winner === state.myColor;

  resultTitle.textContent = isMe ? "你赢了！" : `${winnerName}获胜`;
  resultMessage.textContent = isMe
    ? "漂亮，五子连珠！本局已经结束，重新开局需要双方都确认。"
    : `${winnerName}已经五子连珠。本局已经结束，重新开局需要双方都确认。`;
  resultModal.classList.remove("hidden");
}

function hideResultModal() {
  resultModal.classList.add("hidden");
}

function requestRestart() {
  if (restartBtn.disabled) {
    return;
  }

  socket.emit("restart_game", {}, (response) => {
    if (!response?.ok) {
      setNotice(response?.error || "重新开局申请失败。");
      return;
    }

    if (response.restarted) {
      hideResultModal();
      setNotice("双方已确认，已重新开局。");
      return;
    }

    setNotice("已发送重新开局申请，等待对方确认。");
  });
}

function handleJoinResponse(response) {
  if (!response?.ok) {
    setStartError(response?.error || "加入房间失败。");
    return;
  }

  state.roomId = response.roomId;
  state.myColor = response.color;
  state.lastAnnouncedWinner = 0;
  clearMovePreview();
  setStartError("");
  setNotice(`你已进入房间，随机阵营为${colorName(state.myColor)}。`);
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
    setNotice("链接已复制，快发给好友吧。");
  } catch (_err) {
    setNotice("无法调用剪贴板，请手动复制。");
  }
});

restartBtn.addEventListener("click", requestRestart);
restartFromResultBtn.addEventListener("click", () => {
  requestRestart();
});

undoBtn.addEventListener("click", () => {
  const password = window.prompt("请输入悔棋密码");
  if (password === null) {
    return;
  }

  socket.emit("undo_move", { password }, (response) => {
    if (!response?.ok) {
      setNotice(response?.error || "悔棋失败。");
      return;
    }
    clearMovePreview();
    hideResultModal();
    setNotice("悔棋成功。");
  });
});

leaveBtn.addEventListener("click", () => {
  leaveGame();
});

confirmMoveBtn.addEventListener("click", confirmPendingMove);
cancelPreviewBtn.addEventListener("click", () => {
  clearMovePreview();
  setNotice("已取消落子预览。");
  render();
});

closeResultBtn.addEventListener("click", hideResultModal);
resultModal.addEventListener("click", (event) => {
  if (event.target === resultModal) {
    hideResultModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!resultModal.classList.contains("hidden")) {
      hideResultModal();
      return;
    }
    if (state.pendingMove) {
      clearMovePreview();
      setNotice("已取消落子预览。");
      render();
    }
  }
});

boardCanvas.addEventListener("mousemove", (event) => {
  if (state.pendingMove || !canInteractWithBoard(false)) {
    if (state.hoverMove) {
      state.hoverMove = null;
      render();
    }
    return;
  }

  const move = getCellFromPointer(event);
  if (!move || state.board[indexOfCell(move.row, move.col)] !== 0) {
    if (state.hoverMove) {
      state.hoverMove = null;
      render();
    }
    return;
  }

  if (!sameCell(state.hoverMove, move)) {
    state.hoverMove = move;
    render();
  }
});

boardCanvas.addEventListener("mouseleave", () => {
  if (state.hoverMove) {
    state.hoverMove = null;
    render();
  }
});

boardCanvas.addEventListener("click", (event) => {
  if (!canInteractWithBoard()) {
    return;
  }

  const move = getCellFromPointer(event);
  if (!move) {
    return;
  }

  if (!canPlaceAt(move.row, move.col)) {
    return;
  }

  if (sameCell(state.pendingMove, move)) {
    confirmPendingMove();
    return;
  }

  setPendingMove(move);
});

socket.on("room_state", (roomState) => {
  state.board = roomState.board;
  state.currentTurn = roomState.currentTurn;
  state.winner = roomState.winner;
  state.players = roomState.players;
  state.lastMove = roomState.lastMove;
  state.restartVotes = roomState.restartVotes || [];
  if (!state.roomId) {
    state.roomId = roomState.roomId;
  }

  if (state.pendingMove && !canPlaceAt(state.pendingMove.row, state.pendingMove.col, false)) {
    clearMovePreview();
  }

  if (state.winner === 0) {
    state.lastAnnouncedWinner = 0;
    hideResultModal();
  }

  render();

  if (state.winner !== 0 && state.winner !== state.lastAnnouncedWinner) {
    state.lastAnnouncedWinner = state.winner;
    clearMovePreview();
    render();
    showResultModal(state.winner);
  }
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
