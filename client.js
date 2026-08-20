/* Chess Pro – full client with book, eval bar, themes, mobile gestures */
(function () {
  const FILES = 'abcdefgh'.split('');
  const boardEl = document.getElementById('board');
  const statusText = document.getElementById('statusText');
  const gameResult = document.getElementById('gameResult');
  const bookInfo = document.getElementById('bookInfo');
  const moveListEl = document.getElementById('moveList');
  const pgnBox = document.getElementById('pgnBox');
  const coordsFiles = document.getElementById('coordsFiles');
  const coordsRanks = document.getElementById('coordsRanks');
  const evalFill = document.getElementById('evalFill');
  const evalScore = document.getElementById('evalScore');
  const evalBarWrap = document.getElementById('evalBarWrap');

  let game = new Chess();
  let selected = null;
  let legalMap = new Map();
  let flipped = false;
  let mode = 'local';
  let humanColor = 'w';
  let lastMove = null;
  let aiThinking = false;
  let pendingPromo = null;
  let drag = null; // { from, pieceEl, ghost, startX, startY }

  let settings = {
    highlights: true, lastMove: true, coords: true,
    eval: true, book: true, sound: true
  };

  let clockEnabled = false, timeWhite = 600, timeBlack = 600, clockInterval = null, activeSide = 'w';

  const THEMES = {
    classic: { light: '#f0d9b5', dark: '#b58863', name: 'Classic' },
    green:   { light: '#eeeed2', dark: '#769656', name: 'Green' },
    blue:    { light: '#dee3e6', dark: '#8ca2ad', name: 'Blue' },
    purple:  { light: '#e8d5f0', dark: '#7b5a8c', name: 'Purple' },
    wood:    { light: '#e8c39e', dark: '#8b5a2b', name: 'Wood' },
    dark:    { light: '#4a5568', dark: '#2d3748', name: 'Dark' },
    coral:   { light: '#f5d0c5', dark: '#c97b63', name: 'Coral' },
    midnight:{ light: '#4a5568', dark: '#1a202c', name: 'Midnight' },
    neon:    { light: '#2d3748', dark: '#1a365d', name: 'Neon' },
    marble:  { light: '#e2e8f0', dark: '#a0aec0', name: 'Marble' }
  };
  let currentTheme = 'classic';

  // Sound
  const audioCtx = window.AudioContext ? new AudioContext() : null;
  function tone(freq, dur, type) {
    if (!settings.sound || !audioCtx) return;
    try {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type = type || 'sine'; o.frequency.value = freq; g.gain.value = 0.07;
      o.start(); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur);
    } catch (_) {}
  }
  const sfx = {
    move: () => tone(420, 0.07),
    capture: () => tone(260, 0.11, 'square'),
    check: () => { tone(520, 0.12); setTimeout(() => tone(700, 0.1), 80); },
    end: () => { tone(300, 0.25); setTimeout(() => tone(180, 0.35), 120); }
  };

  function squareName(f, r) { return FILES[f] + (8 - r); }

  function buildBoard() {
    boardEl.innerHTML = '';
    coordsFiles.innerHTML = '';
    coordsRanks.innerHTML = '';
    const fo = flipped ? [...FILES].reverse() : FILES;
    const ro = flipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];
    fo.forEach(f => { const d = document.createElement('div'); d.textContent = f; coordsFiles.appendChild(d); });
    ro.forEach(r => { const d = document.createElement('div'); d.textContent = r; coordsRanks.appendChild(d); });

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = flipped ? squareName(7 - f, 7 - r) : squareName(f, r);
        const div = document.createElement('div');
        div.className = 'square ' + ((f + r) % 2 === 0 ? 'light' : 'dark');
        div.dataset.square = sq;
        // Unified pointer handling for mouse + touch
        div.addEventListener('pointerdown', onPointerDown);
        boardEl.appendChild(div);
      }
    }
    applyTheme();
    updateCoords();
  }

  function applyTheme() {
    const t = THEMES[currentTheme];
    document.documentElement.style.setProperty('--sq-light', t.light);
    document.documentElement.style.setProperty('--sq-dark', t.dark);
  }
  function updateCoords() {
    coordsFiles.style.display = settings.coords ? 'grid' : 'none';
    coordsRanks.style.display = settings.coords ? 'grid' : 'none';
  }

  function render() {
    const squares = boardEl.querySelectorAll('.square');
    squares.forEach(s => {
      s.classList.remove('selected', 'last-move', 'in-check', 'legal-dot', 'legal-capture', 'hint');
      s.innerHTML = '';
    });

    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (!p) continue;
        const sq = FILES[f] + (8 - r);
        const el = boardEl.querySelector(`[data-square="${sq}"]`);
        if (el) el.appendChild(ChessPieces.createElement(p.type, p.color));
      }
    }

    if (settings.lastMove && lastMove) {
      [lastMove.from, lastMove.to].forEach(sq => {
        const el = boardEl.querySelector(`[data-square="${sq}"]`);
        if (el) el.classList.add('last-move');
      });
    }
    if (selected) {
      const el = boardEl.querySelector(`[data-square="${selected}"]`);
      if (el) el.classList.add('selected');
      if (settings.highlights) {
        legalMap.forEach((m, to) => {
          const el = boardEl.querySelector(`[data-square="${to}"]`);
          if (!el) return;
          el.classList.add(m.captured || (m.flags && m.flags.includes('e')) ? 'legal-capture' : 'legal-dot');
        });
      }
    }
    if (game.in_check()) {
      const turn = game.turn();
      for (const f of FILES) for (let r = 1; r <= 8; r++) {
        const sq = f + r, p = game.get(sq);
        if (p && p.type === 'k' && p.color === turn) {
          const el = boardEl.querySelector(`[data-square="${sq}"]`);
          if (el) el.classList.add('in-check');
        }
      }
    }

    updateStatus();
    updateMoveList();
    updateCaptured();
    updatePGN();
    updateEval();
    updateBookInfo();
    updateClocksUI();
  }

  function updateEval() {
    if (!settings.eval) {
      evalBarWrap.style.display = 'none';
      return;
    }
    evalBarWrap.style.display = 'flex';
    const score = ChessAI.evaluate(game);
    // From White's perspective for the bar
    const pct = ChessAI.toBarPercent(score);
    evalFill.style.height = pct + '%';
    evalScore.textContent = ChessAI.formatScore(score);
  }

  function updateBookInfo() {
    if (!settings.book || !window.OpeningBook) {
      bookInfo.textContent = '';
      return;
    }
    const info = OpeningBook.info(game);
    bookInfo.textContent = info ? 'Book: ' + info : (game.history().length < 12 ? '' : '');
  }

  function updateStatus() {
    if (game.in_checkmate()) {
      statusText.textContent = 'Checkmate';
      gameResult.textContent = (game.turn() === 'w' ? 'Black' : 'White') + ' wins!';
      gameResult.classList.remove('hidden');
      sfx.end(); stopClock(); return;
    }
    if (game.in_draw()) {
      statusText.textContent = 'Draw';
      let reason = 'Draw';
      if (game.in_stalemate()) reason = 'Stalemate';
      else if (game.insufficient_material()) reason = 'Insufficient material';
      else if (game.in_threefold_repetition()) reason = 'Threefold repetition';
      gameResult.textContent = reason;
      gameResult.classList.remove('hidden');
      sfx.end(); stopClock(); return;
    }
    gameResult.classList.add('hidden');
    let msg = (game.turn() === 'w' ? 'White' : 'Black') + ' to move';
    if (game.in_check()) { msg += ' · Check'; sfx.check(); }
    if (aiThinking) msg = 'Computer thinking…';
    statusText.textContent = msg;
  }

  function updateMoveList() {
    const hist = game.history({ verbose: true });
    let html = '';
    for (let i = 0; i < hist.length; i += 2) {
      const n = Math.floor(i / 2) + 1;
      html += `<div class="row"><span class="num">${n}.</span><span class="san">${hist[i] ? hist[i].san : ''}</span><span class="san">${hist[i+1] ? hist[i+1].san : ''}</span></div>`;
    }
    moveListEl.innerHTML = html || '<span style="color:var(--muted)">No moves</span>';
    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  function updateCaptured() {
    const hist = game.history({ verbose: true });
    const values = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    let wMat = 0, bMat = 0, wCap = [], bCap = [];
    hist.forEach(m => {
      if (m.captured) {
        const v = values[m.captured] || 0;
        if (m.color === 'w') { wCap.push(m.captured); wMat += v; }
        else { bCap.push(m.captured); bMat += v; }
      }
    });
    const order = 'qrnbp';
    wCap.sort((a,b) => order.indexOf(a) - order.indexOf(b));
    bCap.sort((a,b) => order.indexOf(a) - order.indexOf(b));
    const u = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };
    document.getElementById('capBlack').textContent = wCap.map(t => u[t]).join('');
    document.getElementById('capWhite').textContent = bCap.map(t => u[t]).join('');
    document.getElementById('matWhite').textContent = wMat > bMat ? '+' + (wMat - bMat) : '';
    document.getElementById('matBlack').textContent = bMat > wMat ? '+' + (bMat - wMat) : '';
  }

  function updatePGN() { pgnBox.value = game.pgn() || ''; }

  // —— Pointer / gesture handling (mobile-first) ——
  function onPointerDown(e) {
    if (game.game_over() || aiThinking) return;
    if (mode === 'ai' && game.turn() !== humanColor) return;
    const sq = e.currentTarget.dataset.square;
    const piece = game.get(sq);
    if (!piece || piece.color !== game.turn()) {
      // tapping a legal target while selected
      if (selected && legalMap.has(sq)) {
        e.preventDefault();
        tryMove(selected, sq);
      }
      return;
    }

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    select(sq);

    const pieceEl = e.currentTarget.querySelector('.piece');
    if (!pieceEl) return;

    const ghost = document.createElement('div');
    ghost.className = 'ghost-piece';
    ghost.innerHTML = pieceEl.innerHTML;
    const size = Math.min(e.currentTarget.offsetWidth * 0.95, 72);
    ghost.style.width = size + 'px';
    ghost.style.height = size + 'px';
    document.body.appendChild(ghost);
    pieceEl.classList.add('dragging');

    drag = { from: sq, pieceEl, ghost, pointerId: e.pointerId };

    moveGhost(e.clientX, e.clientY);

    const onMove = (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      ev.preventDefault();
      moveGhost(ev.clientX, ev.clientY);
    };
    const onUp = (ev) => {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);

      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const sqEl = target && target.closest ? target.closest('.square') : null;
      const to = sqEl ? sqEl.dataset.square : null;

      if (drag.ghost) drag.ghost.remove();
      if (drag.pieceEl) drag.pieceEl.classList.remove('dragging');

      if (to && to !== drag.from && legalMap.has(to)) {
        tryMove(drag.from, to);
      } else {
        render();
      }
      drag = null;
    };

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  function moveGhost(x, y) {
    if (!drag || !drag.ghost) return;
    drag.ghost.style.left = x + 'px';
    drag.ghost.style.top = y + 'px';
  }

  function select(sq) {
    selected = sq;
    legalMap = new Map();
    game.moves({ square: sq, verbose: true }).forEach(m => legalMap.set(m.to, m));
    render();
  }
  function clearSelection() { selected = null; legalMap = new Map(); }

  function tryMove(from, to) {
    const moves = game.moves({ square: from, verbose: true }).filter(m => m.to === to);
    if (!moves.length) return;
    if (moves.some(m => m.promotion)) {
      pendingPromo = { from, to };
      showPromotion(game.turn());
      return;
    }
    doMove({ from, to });
  }

  function doMove(opts) {
    const move = game.move({ ...opts, promotion: opts.promotion || 'q' });
    if (!move) return;
    lastMove = { from: move.from, to: move.to };
    clearSelection();
    if (move.captured) sfx.capture(); else sfx.move();
    render();
    switchClock();
    if (mode === 'ai' && !game.game_over() && game.turn() !== humanColor) {
      setTimeout(runAI, 260);
    }
  }

  function showPromotion(color) {
    const modal = document.getElementById('promoModal');
    const choices = document.getElementById('promoChoices');
    choices.innerHTML = '';
    ['q','r','b','n'].forEach(t => {
      const btn = document.createElement('button');
      btn.innerHTML = ChessPieces.getSVG(t, color);
      btn.addEventListener('click', () => {
        modal.classList.add('hidden');
        if (pendingPromo) {
          doMove({ from: pendingPromo.from, to: pendingPromo.to, promotion: t });
          pendingPromo = null;
        }
      });
      choices.appendChild(btn);
    });
    modal.classList.remove('hidden');
  }

  function runAI() {
    if (game.game_over()) return;
    aiThinking = true;
    updateStatus();
    const level = parseInt(document.getElementById('aiLevel').value, 10);
    setTimeout(() => {
      const move = ChessAI.chooseMove(game, level, settings.book);
      if (move) {
        game.move(move);
        lastMove = { from: move.from, to: move.to };
        if (move.captured) sfx.capture(); else sfx.move();
      }
      aiThinking = false;
      clearSelection();
      render();
      switchClock();
    }, 120);
  }

  // Hint
  document.getElementById('btnHint').addEventListener('click', () => {
    if (game.game_over() || aiThinking) return;
    const move = ChessAI.chooseMove(game, 3, settings.book);
    if (!move) return;
    boardEl.querySelectorAll('.hint').forEach(el => el.classList.remove('hint'));
    const fromEl = boardEl.querySelector(`[data-square="${move.from}"]`);
    const toEl = boardEl.querySelector(`[data-square="${move.to}"]`);
    if (fromEl) fromEl.classList.add('hint');
    if (toEl) toEl.classList.add('hint');
    setTimeout(() => {
      boardEl.querySelectorAll('.hint').forEach(el => el.classList.remove('hint'));
    }, 2200);
  });

  // Clocks
  function formatTime(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }
  function updateClocksUI() {
    document.getElementById('timeWhite').textContent = formatTime(timeWhite);
    document.getElementById('timeBlack').textContent = formatTime(timeBlack);
    document.getElementById('clockWhite').classList.toggle('active', clockEnabled && activeSide === 'w' && !game.game_over());
    document.getElementById('clockBlack').classList.toggle('active', clockEnabled && activeSide === 'b' && !game.game_over());
    document.getElementById('clockWhite').classList.toggle('low', timeWhite < 30);
    document.getElementById('clockBlack').classList.toggle('low', timeBlack < 30);
  }
  function startClock() {
    stopClock();
    if (!clockEnabled || game.game_over()) return;
    clockInterval = setInterval(() => {
      if (activeSide === 'w') {
        timeWhite = Math.max(0, timeWhite - 1);
        if (timeWhite === 0) { statusText.textContent = 'White flagged'; gameResult.textContent = 'Black wins on time'; gameResult.classList.remove('hidden'); stopClock(); }
      } else {
        timeBlack = Math.max(0, timeBlack - 1);
        if (timeBlack === 0) { statusText.textContent = 'Black flagged'; gameResult.textContent = 'White wins on time'; gameResult.classList.remove('hidden'); stopClock(); }
      }
      updateClocksUI();
    }, 1000);
  }
  function stopClock() { if (clockInterval) clearInterval(clockInterval); clockInterval = null; }
  function switchClock() { activeSide = game.turn(); if (clockEnabled) startClock(); updateClocksUI(); }

  // Controls
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mode = btn.dataset.mode;
      document.getElementById('aiOptions').classList.toggle('hidden', mode !== 'ai');
      newGame();
    });
  });
  document.querySelectorAll('[data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-color]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      humanColor = btn.dataset.color;
      newGame();
    });
  });

  document.getElementById('btnNew').addEventListener('click', newGame);
  document.getElementById('btnUndo').addEventListener('click', () => {
    if (aiThinking) return;
    game.undo();
    if (mode === 'ai') game.undo();
    lastMove = null; clearSelection(); render();
  });
  document.getElementById('btnFlip').addEventListener('click', () => {
    flipped = !flipped; buildBoard(); render();
  });
  document.getElementById('btnResign').addEventListener('click', () => {
    if (confirm('Resign?')) {
      statusText.textContent = 'Resignation';
      gameResult.textContent = (game.turn() === 'w' ? 'Black' : 'White') + ' wins';
      gameResult.classList.remove('hidden');
      stopClock(); sfx.end();
    }
  });
  document.getElementById('btnDraw').addEventListener('click', () => {
    if (confirm('Draw?')) {
      statusText.textContent = 'Draw';
      gameResult.textContent = 'Draw by agreement';
      gameResult.classList.remove('hidden');
      stopClock();
    }
  });
  document.getElementById('clockEnabled').addEventListener('change', e => {
    clockEnabled = e.target.checked;
    if (clockEnabled) { timeWhite = timeBlack = 600; activeSide = game.turn(); startClock(); }
    else stopClock();
    updateClocksUI();
  });

  document.getElementById('btnCopyPgn').addEventListener('click', () => {
    navigator.clipboard.writeText(pgnBox.value).then(() => {
      const b = document.getElementById('btnCopyPgn');
      b.textContent = 'Copied!'; setTimeout(() => b.textContent = 'Copy', 1400);
    });
  });
  document.getElementById('btnDownloadPgn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([pgnBox.value], { type: 'text/plain' }));
    a.download = 'game.pgn'; a.click();
  });

  // Themes
  document.getElementById('btnTheme').addEventListener('click', () => {
    const grid = document.getElementById('themeGrid');
    grid.innerHTML = '';
    Object.entries(THEMES).forEach(([key, t]) => {
      const sw = document.createElement('div');
      sw.className = 'theme-swatch' + (key === currentTheme ? ' active' : '');
      sw.innerHTML = `<div class="preview"><div style="background:${t.light}"></div><div style="background:${t.dark}"></div><div style="background:${t.dark}"></div><div style="background:${t.light}"></div></div><div class="name">${t.name}</div>`;
      sw.addEventListener('click', () => {
        currentTheme = key; applyTheme();
        document.getElementById('themeModal').classList.add('hidden');
      });
      grid.appendChild(sw);
    });
    document.getElementById('themeModal').classList.remove('hidden');
  });
  document.getElementById('closeTheme').addEventListener('click', () => {
    document.getElementById('themeModal').classList.add('hidden');
  });

  // Settings
  document.getElementById('btnSettings').addEventListener('click', () => {
    document.getElementById('setHighlights').checked = settings.highlights;
    document.getElementById('setLastMove').checked = settings.lastMove;
    document.getElementById('setCoords').checked = settings.coords;
    document.getElementById('setEval').checked = settings.eval;
    document.getElementById('setBook').checked = settings.book;
    document.getElementById('setSound').checked = settings.sound;
    document.getElementById('settingsModal').classList.remove('hidden');
  });
  document.getElementById('closeSettings').addEventListener('click', () => {
    settings.highlights = document.getElementById('setHighlights').checked;
    settings.lastMove = document.getElementById('setLastMove').checked;
    settings.coords = document.getElementById('setCoords').checked;
    settings.eval = document.getElementById('setEval').checked;
    settings.book = document.getElementById('setBook').checked;
    settings.sound = document.getElementById('setSound').checked;
    updateCoords(); render();
    document.getElementById('settingsModal').classList.add('hidden');
  });
  document.getElementById('btnSound').addEventListener('click', () => {
    settings.sound = !settings.sound;
    document.getElementById('btnSound').textContent = settings.sound ? '🔊' : '🔇';
  });

  function newGame() {
    game = new Chess();
    lastMove = null; clearSelection(); aiThinking = false; pendingPromo = null;
    timeWhite = timeBlack = 600; activeSide = 'w'; stopClock();
    buildBoard(); render();
    if (clockEnabled) startClock();
    if (mode === 'ai' && humanColor === 'b') setTimeout(runAI, 350);
  }

  buildBoard();
  render();
})();
