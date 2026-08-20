# Chess Pro

Full-featured browser chess with opening book, evaluation bar, multiple themes and mobile-first gestures.

## Features

### Core
- Local 2-player & vs Computer (4 levels)
- Click + **drag-and-drop** (Pointer Events – works great on phone)
- Legal move / capture highlights
- Promotion dialog
- Check / mate / draw detection
- Undo, Flip, Resign, Draw offer
- Optional clocks

### Analysis & Book
- **Live evaluation bar** (centipawn / mate scores)
- **Opening book** for early moves (e4, d4, Sicilian, Ruy Lopez, QG, etc.)
- Hint button (shows recommended move)
- Full PGN export

### Look & Feel
- 10 board themes (Classic, Green, Blue, Purple, Wood, Dark, Coral, Midnight, Neon, Marble)
- High-quality SVG pieces
- Captured pieces + material advantage
- Sound effects
- Settings panel
- Mobile-first layout & safe-area support

## Run

```bash
open public/index.html
# or
npx serve public
```

## Files

```
public/
  index.html
  styles.css
  pieces.js   – SVG pieces
  book.js     – opening book
  ai.js       – minimax + PST + eval helpers
  client.js   – game logic, gestures, UI
```
