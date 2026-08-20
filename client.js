// Client-side: click-to-move board, local and online modes
const socket = io();
let localChess = null; // for local games
let online = true;
let myColor = null; // 'w' or 'b' for online; for local use 'w' initially
let currentFen = null;
let selected = null;

const UNICODE = {
  p: { w: '♙', b: '♟' },
  r: { w: '♖', b: '♜' },
  n: { w: '♘', b: '♞' },
  b: { w: '♗', b: '♝' },
  q: { w: '♕', b: '♛' },
  k: { w: '♔', b: '♚' }
};

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const roomLabel = document.getElementById('roomLabel');
const gameInfo = document.getElementById('gameInfo');

document.getElementById('createBtn').addEventListener('click', () => {
  socket.emit('create-room', (res) => {
    if (res.ok) {
      roomLabel.textContent = `Room: ${res.roomId} (you: white)`;
      myColor = res.color;
      online = true;
      statusEl.textContent = 'Waiting for opponent...';
    } else {
      alert(res.error || 'Error creating room');
    }
  });
});

document.getElementById('joinBtn').addEventListener('click', () => {
  const roomId = document.getElementById('roomInput').value.trim();
  if (!roomId) return alert('Enter room id to join');
  socket.emit('join-room', roomId, (res) => {
    if (!res.ok) return alert(res.error || 'Join failed');
    roomLabel.textContent = `Room: ${res.roomId} (you: black)`;
    myColor = res.color;
    online = true;
    statusEl.textContent = 'Connected to room';
  });
});

document.getElementById('localBtn').addEventListener('click', () => {
  online = false;
  myColor = 'w';
  localChess = new Chess();
  currentFen = localChess.fen();
  roomLabel.textContent = 'Local 2-player';
  renderFromFen(currentFen);
  statusEl.textContent = 'Local game (white to move)';
});

document.getElementById('newGameBtn').addEventListener('click', () => {
  if (online) {
    socket.emit('new-game', (res) => {
      if (!res.ok) alert('Could not start new game');
    });
  } else {
    localChess = new Chess();
    currentFen = localChess.fen();
    renderFromFen(currentFen);
    statusEl.textContent = 'New local game (white to move)';
  }
});

document.getElementById('resignBtn').addEventListener('click', () => {
  if (confirm('Resign?')) {
    statusEl.textContent = 'Resigned';
    // In online mode, a more elaborate flow could notify server
  }
});

// Build board grid
function buildBoard() {
  boardEl.innerHTML = '';
  const files = ['a','b','c','d','e','f','g','h'];
  for (let rank = 8; rank >= 1; rank--) {
    for (let f = 0; f < 8; f++) {
      const sq = files[f] + rank;
      const div = document.createElement('div');
      div.className = 'square';
      const light = ((f + rank) % 2 === 0);
      div.classList.add(light ? 'light' : 'dark');
      div.dataset.square = sq;
      div.addEventListener('click', onSquareClick);
      boardEl.appendChild(div);
    }
  }
}

function onSquareClick(e) {
  const sq = e.currentTarget.dataset.square;
  // if no position yet, ignore
  if (!currentFen) return;
  const chess = (online ? new Chess(currentFen) : localChess);

  const piece = chess.get(sq);
  // select or move
  if (!selected) {
    // only allow selecting a piece when it's your turn (for online), or in local allow both
    if (piece && ( !online || (online && ((chess.turn() === 'w' && myColor === 'w') || (chess.turn() === 'b' && myColor === 'b') ) ) ) ) {
      selected = sq;
      markSelected(sq);
    }
    return;
  } else {
    const from = selected;
    const to = sq;
    selected = null;
    clearSelection();

    // perform move
    if (online) {
      socket.emit('move', { from, to, promotion: 'q' }, (res) => {
        if (!res.ok) {
          alert('Invalid move: ' + (res.error || 'unknown'));
        }
      });
    } else {
      const res = localChess.move({ from, to, promotion: 'q' });
      if (res === null) {
        // invalid
        statusEl.textContent = 'Invalid move';
      } else {
        currentFen = localChess.fen();
        renderFromFen(currentFen);
        updateGameInfo(localChess);
      }
    }
  }
}

function markSelected(sq) {
  clearSelection();
  const el = boardEl.querySelector(`[data-square="${sq}"]`);
  if (el) el.classList.add('selected');
}

function clearSelection() {
  boardEl.querySelectorAll('.square.selected').forEach(el => el.classList.remove('selected'));
}

function renderFromFen(fen) {
  currentFen = fen;
  const chess = new Chess(fen);
  const board = chess.board(); // 8x8 array [rank][file], rank 8 first? chess.js returns 2D array starting at rank 8
  // board is array of ranks from 8->1
  const squares = boardEl.querySelectorAll('.square');
  // iterate ranks 8 to 1 and files a-h to match grid
  let idx = 0;
  for (let r = 0; r < 8; r++) {
    const rank = board[r];
    for (let f = 0; f < 8; f++) {
      const cell = squares[idx++];
      cell.textContent = '';
      const p = rank[f];
      if (p) {
        const u = UNICODE[p.type][p.color];
        cell.textContent = u;
      }
    }
  }
  // status
  const turn = chess.turn() === 'w' ? 'White' : 'Black';
  statusEl.textContent = `${turn} to move` + (chess.in_check() ? ' — check' : '');
  updateGameInfo(chess);
}

function updateGameInfo(chess) {
  let info = `FEN: ${chess.fen()}\n`;
  info += `PGN: ${chess.pgn() || '(none)'}\n`;
  if (chess.in_checkmate()) info += 'Checkmate!\n';
  if (chess.in_draw()) info += 'Draw.\n';
  gameInfo.textContent = info;
}

// Socket events
socket.on('game-state', (state) => {
  // state: fen, pgn, turn, in_check, etc.
  online = true;
  buildBoard();
  renderFromFen(state.fen);
  // show players availability
  roomLabel.textContent = `Online room (players: W:${state.players.white ? 'yes' : 'no'} B:${state.players.black ? 'yes' : 'no'})`;
  if (state.in_checkmate) {
    statusEl.textContent = 'Checkmate';
  } else if (state.in_draw) {
    statusEl.textContent = 'Draw';
  } else {
    statusEl.textContent = (state.turn === 'w' ? 'White' : 'Black') + ' to move' + (state.in_check ? ' — check' : '');
  }
});

socket.on('connect', () => {
  console.log('connected to server');
});

// initialize
buildBoard();
