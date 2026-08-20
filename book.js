/* Simple opening book – common replies from starting position and early branches */
window.OpeningBook = (function () {
  // Key = FEN without move counters (first 4 fields), Value = array of { from, to, san, name? }
  const BOOK = {
    // Starting position
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq': [
      { from: 'e2', to: 'e4', san: 'e4', name: "King's Pawn" },
      { from: 'd2', to: 'd4', san: 'd4', name: "Queen's Pawn" },
      { from: 'c2', to: 'c4', san: 'c4', name: 'English' },
      { from: 'g1', to: 'f3', san: 'Nf3', name: 'Réti / Nf3' }
    ],
    // 1.e4
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq': [
      { from: 'e7', to: 'e5', san: 'e5', name: 'Open Game' },
      { from: 'c7', to: 'c5', san: 'c5', name: 'Sicilian' },
      { from: 'e7', to: 'e6', san: 'e6', name: 'French' },
      { from: 'c7', to: 'c6', san: 'c6', name: 'Caro-Kann' },
      { from: 'g8', to: 'f6', san: 'Nf6', name: 'Alekhine' }
    ],
    // 1.e4 e5
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq': [
      { from: 'g1', to: 'f3', san: 'Nf3', name: 'King\'s Knight' },
      { from: 'f1', to: 'c4', san: 'Bc4', name: 'Italian setup' },
      { from: 'b1', to: 'c3', san: 'Nc3', name: 'Vienna' }
    ],
    // 1.e4 e5 2.Nf3
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq': [
      { from: 'b8', to: 'c6', san: 'Nc6', name: 'Italian / Spanish' },
      { from: 'g8', to: 'f6', san: 'Nf6', name: 'Petrov' },
      { from: 'd7', to: 'd6', san: 'd6', name: 'Philidor' }
    ],
    // 1.e4 e5 2.Nf3 Nc6
    'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq': [
      { from: 'f1', to: 'b5', san: 'Bb5', name: 'Ruy Lopez' },
      { from: 'f1', to: 'c4', san: 'Bc4', name: 'Italian' },
      { from: 'd2', to: 'd4', san: 'd4', name: 'Scotch' },
      { from: 'b1', to: 'c3', san: 'Nc3', name: 'Three Knights' }
    ],
    // 1.e4 c5 (Sicilian)
    'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq': [
      { from: 'g1', to: 'f3', san: 'Nf3', name: 'Open Sicilian' },
      { from: 'b1', to: 'c3', san: 'Nc3', name: 'Closed Sicilian' },
      { from: 'c2', to: 'c3', san: 'c3', name: 'Alapin' }
    ],
    // 1.d4
    'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq': [
      { from: 'd7', to: 'd5', san: 'd5', name: "Queen's Gambit" },
      { from: 'g8', to: 'f6', san: 'Nf6', name: 'Indian Defences' },
      { from: 'f7', to: 'f5', san: 'f5', name: 'Dutch' },
      { from: 'e7', to: 'e6', san: 'e6', name: 'French-ish' }
    ],
    // 1.d4 d5
    'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq': [
      { from: 'c2', to: 'c4', san: 'c4', name: "Queen's Gambit" },
      { from: 'g1', to: 'f3', san: 'Nf3', name: 'Quiet' },
      { from: 'b1', to: 'c3', san: 'Nc3', name: 'Jobava / others' }
    ],
    // 1.d4 Nf6
    'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq': [
      { from: 'c2', to: 'c4', san: 'c4', name: 'Indian systems' },
      { from: 'g1', to: 'f3', san: 'Nf3', name: 'Quiet' },
      { from: 'b1', to: 'c3', san: 'Nc3', name: 'Jobava' }
    ],
    // 1.d4 d5 2.c4
    'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq': [
      { from: 'e7', to: 'e6', san: 'e6', name: "Queen's Gambit Declined" },
      { from: 'c7', to: 'c6', san: 'c6', name: 'Slav' },
      { from: 'd5', to: 'c4', san: 'dxc4', name: "Queen's Gambit Accepted" }
    ]
  };

  function fenKey(fen) {
    // Keep only piece placement, turn, castling, en-passant
    return fen.split(' ').slice(0, 4).join(' ');
  }

  function getMoves(game) {
    const key = fenKey(game.fen());
    return BOOK[key] || null;
  }

  function pick(game) {
    const entries = getMoves(game);
    if (!entries || !entries.length) return null;
    // Prefer named popular lines a bit more
    const weighted = [];
    entries.forEach((e, i) => {
      const w = e.name ? 3 : 1;
      for (let k = 0; k < w; k++) weighted.push(e);
    });
    const choice = weighted[Math.floor(Math.random() * weighted.length)];
    // Validate still legal
    const legal = game.moves({ verbose: true }).find(m => m.from === choice.from && m.to === choice.to);
    return legal ? { ...choice, move: legal } : null;
  }

  function info(game) {
    const entries = getMoves(game);
    if (!entries) return null;
    return entries.map(e => e.name || e.san).join(' · ');
  }

  return { getMoves, pick, info, fenKey };
})();
