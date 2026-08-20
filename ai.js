/* Chess AI – material + PST + minimax + opening book support */
window.ChessAI = (function () {
  const PIECE_VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
  const PST = {
    p: [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
    n: [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
    b: [[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
    r: [[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
    q: [[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
    k: [[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]]
  };

  function evaluate(game) {
    if (game.in_checkmate()) return game.turn() === 'w' ? -99999 : 99999;
    if (game.in_draw()) return 0;
    let score = 0;
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (!p) continue;
        const val = PIECE_VAL[p.type] || 0;
        const table = PST[p.type];
        const pst = table ? table[p.color === 'w' ? r : 7 - r][f] : 0;
        score += p.color === 'w' ? (val + pst) : -(val + pst);
      }
    }
    score += (game.turn() === 'w' ? 1 : -1) * game.moves().length * 2;
    return score;
  }

  function orderMoves(moves) {
    return moves.sort((a, b) => {
      const ca = a.captured ? (PIECE_VAL[a.captured] || 0) : 0;
      const cb = b.captured ? (PIECE_VAL[b.captured] || 0) : 0;
      return cb - ca;
    });
  }

  function minimax(game, depth, alpha, beta, maximizing) {
    if (depth === 0 || game.game_over()) return evaluate(game);
    const moves = orderMoves(game.moves({ verbose: true }));
    if (maximizing) {
      let maxEval = -Infinity;
      for (const m of moves) {
        game.move(m);
        const ev = minimax(game, depth - 1, alpha, beta, false);
        game.undo();
        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const m of moves) {
        game.move(m);
        const ev = minimax(game, depth - 1, alpha, beta, true);
        game.undo();
        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  function getBestMove(game, depth) {
    const moves = orderMoves(game.moves({ verbose: true }));
    if (!moves.length) return null;
    const isWhite = game.turn() === 'w';
    let best = null, bestScore = isWhite ? -Infinity : Infinity;
    for (const m of moves) {
      game.move(m);
      const score = minimax(game, depth - 1, -Infinity, Infinity, !isWhite);
      game.undo();
      if (isWhite ? score > bestScore : score < bestScore) {
        bestScore = score; best = m;
      }
    }
    return best || moves[0];
  }

  function chooseMove(game, level, useBook) {
    if (useBook && window.OpeningBook) {
      const bookPick = OpeningBook.pick(game);
      if (bookPick && bookPick.move) return bookPick.move;
    }
    if (level <= 1) {
      const moves = game.moves({ verbose: true });
      return moves[Math.floor(Math.random() * moves.length)];
    }
    const depth = level >= 4 ? 3 : Math.min(level, 3);
    return getBestMove(game, depth);
  }

  /** Convert evaluation to 0–100 for bar (50 = equal) */
  function toBarPercent(score) {
    // squash with tanh-ish
    const clamped = Math.max(-800, Math.min(800, score));
    const p = 50 + (clamped / 800) * 45;
    return Math.max(2, Math.min(98, p));
  }

  function formatScore(score) {
    if (Math.abs(score) > 9000) return score > 0 ? 'M' : '-M';
    const pawns = (score / 100).toFixed(1);
    return (score > 0 ? '+' : '') + pawns;
  }

  return { chooseMove, evaluate, toBarPercent, formatScore };
})();
