# Tray Table

Offline puzzle arcade for the phone — 18 games: Links, Pipes, Pour, Flood, Hue, One Line, Zip, Bridges, Shikaku, 2048, Lights Out, Unblock, Queens, Tango, Nonogram, Minesweeper, 24, KenKen.
One static page (`index.html`) plus a service worker, so it works in airplane mode once installed.

Install on iPhone: open the site in Safari → Share → **Add to Home Screen**. Open it once while online; after that it runs offline.

- Four difficulty levels per game; puzzles are generated from (difficulty, number), so the same # is the same board on every device and they never run out.
- Unblock uses a precomputed bank (`src/unblock_bank.json`, built with `src/gen_unblock.js` + `src/merge_ub.js`).
- Rebuild `index.html` after editing `src/`: `python3 src/build.py`.
