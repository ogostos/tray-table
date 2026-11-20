// ===== Shared puzzle core: seeded generators + solvers (works in browser and node) =====
const Core = (() => {
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rint = (R, n) => Math.floor(R() * n);
  function shuffle(R, arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = rint(R, i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  const tier = (n) => (n <= 10 ? 0 : n <= 30 ? 1 : 2); // easy / medium / hard
  const TIER_NAMES = ['Easy', 'Medium', 'Hard'];

  // ---------- LIGHTS OUT ----------
  function loToggle(board, n, i) {
    const r = Math.floor(i / n), c = i % n;
    board[i] ^= 1;
    if (r > 0) board[i - n] ^= 1;
    if (r < n - 1) board[i + n] ^= 1;
    if (c > 0) board[i - 1] ^= 1;
    if (c < n - 1) board[i + 1] ^= 1;
  }
  // all solutions over GF(2); returns min number of presses
  function loMinPresses(board, n) {
    const N = n * n;
    const rows = [];
    for (let i = 0; i < N; i++) {
      const row = new Array(N + 1).fill(0);
      const tmp = new Array(N).fill(0);
      loToggle(tmp, n, i); // column i effect, symmetric matrix so row i == col i
      for (let j = 0; j < N; j++) row[j] = tmp[j];
      row[N] = board[i];
      rows.push(row);
    }
    const pivotCol = [];
    let r = 0;
    for (let c = 0; c < N && r < N; c++) {
      let p = -1;
      for (let k = r; k < N; k++) if (rows[k][c]) { p = k; break; }
      if (p < 0) continue;
      [rows[r], rows[p]] = [rows[p], rows[r]];
      for (let k = 0; k < N; k++) if (k !== r && rows[k][c]) for (let j = c; j <= N; j++) rows[k][j] ^= rows[r][j];
      pivotCol.push(c); r++;
    }
    for (let k = r; k < N; k++) if (rows[k][N]) return -1; // unsolvable
    const isPivot = new Set(pivotCol);
    const free = [];
    for (let c = 0; c < N; c++) if (!isPivot.has(c)) free.push(c);
    let best = Infinity;
    for (let mask = 0; mask < (1 << free.length); mask++) {
      const x = new Array(N).fill(0);
      free.forEach((c, i) => (x[c] = (mask >> i) & 1));
      for (let k = 0; k < r; k++) {
        let v = rows[k][N];
        for (const c of free) if (rows[k][c] && x[c]) v ^= 1;
        x[pivotCol[k]] = v;
      }
      best = Math.min(best, x.reduce((a, b) => a + b, 0));
    }
    return best;
  }
  function genLightsOut(num) {
    const R = rng(hashStr('lo-' + num));
    const t = tier(num);
    const n = 5;
    const presses = [5, 8, 11][t] + rint(R, 3);
    const board = new Array(n * n).fill(0);
    const cells = shuffle(R, [...Array(n * n).keys()]).slice(0, presses);
    cells.forEach((i) => loToggle(board, n, i));
    if (board.every((v) => v === 0)) loToggle(board, n, 12);
    return { n, board, par: loMinPresses(board, n), tier: t };
  }

  // ---------- UNBLOCK (Rush Hour) ----------
  // vehicle: {r, c, len, h}; vehicle 0 = red, horizontal on row 2; exit on the right.
  function ubSolve(vs, maxStates = 60000) {
    const S = 6;
    const start = vs.map((v) => (v.h ? v.c : v.r));
    const key = (p) => p.join(',');
    const seen = new Map([[key(start), null]]);
    let frontier = [start], depth = 0;
    while (frontier.length) {
      const next = [];
      for (const p of frontier) {
        if (p[0] === S - vs[0].len) return { moves: depth, states: seen.size };
        const grid = new Int8Array(36).fill(-1);
        vs.forEach((v, i) => {
          for (let k = 0; k < v.len; k++) {
            const r = v.h ? v.r : p[i] + k, c = v.h ? p[i] + k : v.c;
            grid[r * 6 + c] = i;
          }
        });
        vs.forEach((v, i) => {
          for (const dir of [-1, 1]) {
            let pos = p[i];
            while (true) {
              const np = pos + dir;
              if (np < 0 || np + v.len > S) break;
              const edge = dir < 0 ? np : np + v.len - 1;
              const r = v.h ? v.r : edge, c = v.h ? edge : v.c;
              if (grid[r * 6 + c] !== -1) break;
              pos = np;
              const q = p.slice(); q[i] = pos;
              const k = key(q);
              if (!seen.has(k)) { seen.set(k, 1); next.push(q); }
            }
          }
        });
        if (seen.size > maxStates) return { moves: -1, states: seen.size };
      }
      frontier = next; depth++;
    }
    return { moves: -1, states: seen.size };
  }
  function genUnblock(num, maxTries = 250) {
    const R = rng(hashStr('ub-' + num));
    const t = tier(num);
    const target = [6, 10, 14][t];
    let best = null;
    let tries = 0;
    while (tries < maxTries) { // fixed count -> same puzzle on every device
      tries++;
      const occ = new Array(36).fill(false);
      const vs = [];
      const redC = rint(R, 3);
      vs.push({ r: 2, c: redC, len: 2, h: true });
      occ[12 + redC] = occ[12 + redC + 1] = true;
      const count = 9 + rint(R, 5);
      let guard = 0;
      while (vs.length < count && guard++ < 200) {
        const len = R() < 0.72 ? 2 : 3;
        const h = R() < 0.5;
        const r = h ? rint(R, 6) : rint(R, 7 - len);
        const c = h ? rint(R, 7 - len) : rint(R, 6);
        if (h && r === 2) continue;
        let ok = true;
        for (let k = 0; k < len; k++) if (occ[(h ? r : r + k) * 6 + (h ? c + k : c)]) { ok = false; break; }
        if (!ok) continue;
        for (let k = 0; k < len; k++) occ[(h ? r : r + k) * 6 + (h ? c + k : c)] = true;
        vs.push({ r, c, len, h });
      }
      const res = ubSolve(vs);
      if (res.moves < 2) continue;
      if (!best || res.moves > best.par) best = { vehicles: vs, par: res.moves };
      if (best.par >= target && tries >= 20) break;
    }
    best.tier = t;
    return best;
  }

  // ---------- QUEENS ----------
  function queensCount(n, region, limit = 2) {
    let count = 0, sol = null; const sols = [];
    const colUsed = new Array(n).fill(false), regUsed = new Array(n).fill(false);
    const pos = new Array(n).fill(-1);
    (function rec(r) {
      if (count >= limit) return;
      if (r === n) { count++; if (!sol) sol = pos.slice(); sols.push(pos.slice()); return; }
      for (let c = 0; c < n; c++) {
        if (colUsed[c]) continue;
        const g = region[r * n + c];
        if (regUsed[g]) continue;
        if (r > 0 && Math.abs(pos[r - 1] - c) <= 1) continue;
        colUsed[c] = regUsed[g] = true; pos[r] = c;
        rec(r + 1);
        colUsed[c] = regUsed[g] = false; pos[r] = -1;
        if (count >= limit) return;
      }
    })(0);
    return { count, sol, sols };
  }
  function genQueens(num) {
    const R = rng(hashStr('qn-' + num));
    const t = tier(num);
    const n = [6, 7, 8][t];
    let fallback = null;
    for (let attempt = 0; attempt < 3000; attempt++) {
      // random valid placement
      const pos = new Array(n).fill(-1), used = new Array(n).fill(false);
      const place = (r) => {
        if (r === n) return true;
        for (const c of shuffle(R, [...Array(n).keys()])) {
          if (used[c] || (r > 0 && Math.abs(pos[r - 1] - c) <= 1)) continue;
          used[c] = true; pos[r] = c;
          if (place(r + 1)) return true;
          used[c] = false;
        }
        return false;
      };
      if (!place(0)) continue;
      // grow regions from queens; smaller regions grow more often -> balanced but irregular shapes
      const region = new Array(n * n).fill(-1);
      const size = new Array(n).fill(1);
      const bias = [];
      for (let r = 0; r < n; r++) { region[r * n + pos[r]] = r; bias.push(0.6 + R() * 0.8); }
      let left = n * n - n;
      while (left > 0) {
        const front = Array.from({ length: n }, () => []);
        for (let i = 0; i < n * n; i++) {
          if (region[i] !== -1) continue;
          const r = Math.floor(i / n), c = i % n;
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
            const g = region[rr * n + cc];
            if (g !== -1) front[g].push(i);
          }
        }
        const w = front.map((f, g) => (f.length ? bias[g] / Math.pow(size[g], 1.2) : 0));
        const total = w.reduce((a, b) => a + b, 0);
        let pick = R() * total, g = 0;
        for (; g < n; g++) { pick -= w[g]; if (pick <= 0 && w[g] > 0) break; }
        if (g >= n) g = w.findIndex((x) => x > 0);
        const cell = front[g][rint(R, front[g].length)];
        region[cell] = g; size[g]++;
        left--;
      }
      // repair: while another solution exists, steal one of its queen cells into a neighbouring region
      const connected = (g, without) => {
        const cellsG = []; for (let i = 0; i < n * n; i++) if (region[i] === g && i !== without) cellsG.push(i);
        if (!cellsG.length) return false;
        const seen = new Set([cellsG[0]]), st = [cellsG[0]];
        while (st.length) { const i = st.pop(), r = Math.floor(i / n), c = i % n;
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc, j = rr * n + cc;
            if (rr < 0 || cc < 0 || rr >= n || cc >= n || j === without || region[j] !== g || seen.has(j)) continue; seen.add(j); st.push(j); } }
        return seen.size === cellsG.length;
      };
      let res = queensCount(n, region, 2), fixes = 0;
      while (res.count > 1 && fixes < 80) {
        const alt = res.sols.find((sl) => sl.some((c, r) => c !== pos[r]));
        const opts = [];
        for (let r = 0; r < n; r++) {
          if (alt[r] === pos[r]) continue;
          const i = r * n + alt[r], g = region[i];
          if (!connected(g, i)) continue;
          for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = alt[r] + dc;
            if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue; const h = region[rr * n + cc]; if (h !== g) opts.push([i, h]); }
        }
        if (!opts.length) break;
        const [i, h] = opts[rint(R, opts.length)];
        region[i] = h; fixes++;
        res = queensCount(n, region, 2);
      }
      if (res.count === 1) return { n, region, solution: pos, unique: true, tier: t, attempts: attempt + 1, fixes };
      if (!fallback) fallback = { n, region, solution: pos, unique: false, tier: t };
    }
    return fallback;
  }

  // ---------- 24 ----------
  // fractions as [num, den]
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
  function fr(n, d = 1) { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); return [n / g, d / g]; }
  function fop(a, b, op) {
    switch (op) {
      case '+': return fr(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
      case '-': return fr(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
      case '×': return fr(a[0] * b[0], a[1] * b[1]);
      case '÷': return b[0] === 0 ? null : fr(a[0] * b[1], a[1] * b[0]);
    }
  }
  function solve24(nums) {
    const items = nums.map((v) => ({ v: fr(v), e: String(v) }));
    let found = null;
    (function rec(list) {
      if (found) return;
      if (list.length === 1) { if (list[0].v[0] === 24 && list[0].v[1] === 1) found = list[0].e; return; }
      for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const rest = list.filter((_, k) => k !== i && k !== j);
        for (const op of ['+', '-', '×', '÷']) {
          if ((op === '+' || op === '×') && j < i) continue;
          const v = fop(list[i].v, list[j].v, op);
          if (!v) continue;
          rec([...rest, { v, e: `(${list[i].e} ${op} ${list[j].e})` }]);
          if (found) return;
        }
      }
    })(items);
    return found ? found.replace(/^\((.*)\)$/, '$1') : null;
  }
  function gen24(num) {
    const R = rng(hashStr('24-' + num));
    const t = tier(num);
    const maxN = [9, 10, 13][t];
    const hands = [];
    while (hands.length < 5) {
      const h = [1, 2, 3, 4].map(() => 1 + rint(R, maxN));
      const sol = solve24(h);
      if (sol) hands.push({ nums: h, solution: sol });
    }
    return { hands, tier: t };
  }

  // ---------- KENKEN ----------
  function cageOk(op, target, vals) {
    switch (op) {
      case '': return vals[0] === target;
      case '+': return vals.reduce((a, b) => a + b, 0) === target;
      case '×': return vals.reduce((a, b) => a * b, 1) === target;
      case '−': return Math.abs(vals[0] - vals[1]) === target;
      case '÷': return Math.max(...vals) / Math.min(...vals) === target;
    }
  }
  function kenkenCount(n, cages, cageOf, limit = 2) {
    const g = new Array(n * n).fill(0);
    const rowM = new Array(n).fill(0), colM = new Array(n).fill(0);
    const remaining = cages.map((c) => c.cells.length);
    let count = 0;
    (function rec(i) {
      if (count >= limit) return;
      if (i === n * n) { count++; return; }
      const r = Math.floor(i / n), c = i % n, ci = cageOf[i], cage = cages[ci];
      for (let v = 1; v <= n; v++) {
        const bit = 1 << v;
        if (rowM[r] & bit || colM[c] & bit) continue;
        g[i] = v; remaining[ci]--;
        let ok = true;
        if (remaining[ci] === 0) ok = cageOk(cage.op, cage.target, cage.cells.map((k) => g[k]));
        else if (cage.op === '+') ok = cage.cells.reduce((a, k) => a + g[k], 0) < cage.target;
        else if (cage.op === '×') ok = cage.target % cage.cells.reduce((a, k) => a * (g[k] || 1), 1) === 0;
        if (ok) { rowM[r] |= bit; colM[c] |= bit; rec(i + 1); rowM[r] &= ~bit; colM[c] &= ~bit; }
        g[i] = 0; remaining[ci]++;
        if (count >= limit) return;
      }
    })(0);
    return count;
  }
  function genKenKen(num) {
    const R = rng(hashStr('kk-' + num));
    const t = tier(num);
    const n = [4, 5, 5][t];
    for (let attempt = 0; attempt < 500; attempt++) {
      const rows = shuffle(R, [...Array(n).keys()]), cols = shuffle(R, [...Array(n).keys()]);
      const sym = shuffle(R, [...Array(n).keys()].map((x) => x + 1));
      const sol = new Array(n * n);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) sol[r * n + c] = sym[(rows[r] + cols[c]) % n];
      const cageOf = new Array(n * n).fill(-1);
      const cages = [];
      for (const start of shuffle(R, [...Array(n * n).keys()])) {
        if (cageOf[start] !== -1) continue;
        const x = R();
        const size = x < 0.1 ? 1 : x < 0.6 ? 2 : x < (t === 2 ? 0.9 : 0.95) ? 3 : 4;
        const cells = [start]; cageOf[start] = cages.length;
        while (cells.length < size) {
          const opts = [];
          for (const k of cells) {
            const r = Math.floor(k / n), c = k % n;
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const rr = r + dr, cc = c + dc;
              if (rr >= 0 && cc >= 0 && rr < n && cc < n && cageOf[rr * n + cc] === -1) opts.push(rr * n + cc);
            }
          }
          if (!opts.length) break;
          const k = opts[rint(R, opts.length)];
          cageOf[k] = cages.length; cells.push(k);
        }
        const vals = cells.map((k) => sol[k]);
        let op, target;
        if (cells.length === 1) { op = ''; target = vals[0]; }
        else if (cells.length === 2) {
          const [a, b] = [Math.max(...vals), Math.min(...vals)];
          const choices = ['−', '+', '×'];
          if (a % b === 0) choices.push('÷', '÷');
          op = choices[rint(R, choices.length)];
          target = op === '−' ? a - b : op === '÷' ? a / b : op === '+' ? a + b : a * b;
        } else {
          op = R() < 0.5 ? '+' : '×';
          target = op === '+' ? vals.reduce((p, q) => p + q, 0) : vals.reduce((p, q) => p * q, 1);
        }
        cells.sort((p, q) => p - q);
        cages.push({ cells, op, target });
      }
      if (kenkenCount(n, cages, cageOf, 2) === 1) return { n, cages, cageOf, solution: sol, tier: t, attempts: attempt + 1 };
    }
    return null;
  }

  // ---------- LINKS (connect colours, fill the board) ----------
  function genLinks(num) {
    const R = rng(hashStr('lk-' + num));
    const t = tier(num);
    const n = [5, 6, 7][t] + (t === 2 && R() < 0.5 ? 1 : 0);
    const k = Math.min(9, [4, 5, 6][t] + rint(R, 2) + (n === 8 ? 1 : 0));
    const adj = (a, b) => Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs((a % n) - (b % n)) === 1;
    for (let attempt = 0; attempt < 400; attempt++) {
      // boustrophedon Hamiltonian path, randomised with backbite moves
      let path = [];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) path.push(r * n + (r % 2 ? n - 1 - c : c));
      for (let it = 0; it < n * n * 30; it++) {
        const atStart = R() < 0.5;
        if (!atStart) path.reverse();
        const e = path[0], r = Math.floor(e / n), c = e % n;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dr, dc]) => [r + dr, c + dc]).filter(([rr, cc]) => rr >= 0 && cc >= 0 && rr < n && cc < n).map(([rr, cc]) => rr * n + cc);
        const x = nb[rint(R, nb.length)];
        const i = path.indexOf(x);
        if (i >= 2) path = path.slice(0, i).reverse().concat(path.slice(i));
      }
      // cut into k segments, each >= 3 long
      const L = n * n, lens = new Array(k).fill(3);
      for (let rest = L - 3 * k; rest > 0; rest--) lens[rint(R, k)]++;
      const segs = []; let p = 0;
      for (const len of lens) { segs.push(path.slice(p, p + len)); p += len; }
      if (segs.some((s) => adj(s[0], s[s.length - 1]))) continue;
      return { n, k, dots: segs.map((s) => [s[0], s[s.length - 1]]), solution: segs, tier: t };
    }
  }

  // ---------- PIPES (Net) ----------
  // bits: 1=N 2=E 4=S 8=W
  const rotCW = (m) => ((m << 1) | (m >> 3)) & 15;
  function genPipes(num) {
    const R = rng(hashStr('pp-' + num));
    const t = tier(num);
    const n = [5, 6, 7][t];
    const DIRS = [[-1, 0, 1, 4], [0, 1, 2, 8], [1, 0, 4, 1], [0, -1, 8, 2]];
    for (let attempt = 0; attempt < 100; attempt++) {
      const m = new Array(n * n).fill(0), inT = new Array(n * n).fill(false);
      const src = Math.floor(n / 2) * n + Math.floor(n / 2);
      inT[src] = true;
      let front = [];
      const addFront = (i) => { const r = Math.floor(i / n), c = i % n; for (const [dr, dc, b, ob] of DIRS) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < n && cc < n) front.push([i, rr * n + cc, b, ob]); } };
      addFront(src);
      let added = 1;
      const deg = (x) => [1, 2, 4, 8].filter((b) => m[x] & b).length;
      while (front.length) {
        const idx = rint(R, front.length);
        const [a, b, bit, obit] = front[idx];
        front.splice(idx, 1);
        if (inT[b] || deg(a) >= 3) continue;
        m[a] |= bit; m[b] |= obit; inT[b] = true; added++;
        addFront(b);
      }
      if (added < n * n) continue;
      const rot = m.map(() => rint(R, 4));
      const tiles = m.map((x, i) => { let y = x; for (let k = 0; k < rot[i]; k++) y = rotCW(y); return y; });
      const par = m.reduce((a, x, i) => { const straight = x === 5 || x === 10; const need = (4 - rot[i]) % 4; return a + (straight ? need % 2 : need); }, 0);
      if (par < n * 1.5) continue;
      return { n, src, tiles, solution: m, par, tier: t };
    }
  }
  function pipesConnected(n, src, tiles) {
    const DIRS = [[-1, 0, 1, 4], [0, 1, 2, 8], [1, 0, 4, 1], [0, -1, 8, 2]];
    const seen = new Set([src]), st = [src];
    let loose = 0;
    while (st.length) {
      const i = st.pop(), r = Math.floor(i / n), c = i % n;
      for (const [dr, dc, b, ob] of DIRS) {
        if (!(tiles[i] & b)) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) { loose++; continue; }
        const j = rr * n + cc;
        if (!(tiles[j] & ob)) { loose++; continue; }
        if (!seen.has(j)) { seen.add(j); st.push(j); }
      }
    }
    return { seen, solved: seen.size === n * n && loose === 0 };
  }

  // ---------- POUR (water sort) ----------
  const CAP = 4;
  function pourOK(tubes, a, b) {
    const A = tubes[a], B = tubes[b];
    if (a === b || !A.length || B.length >= CAP) return 0;
    const top = A[A.length - 1];
    if (B.length && B[B.length - 1] !== top) return 0;
    let run = 0; for (let i = A.length - 1; i >= 0 && A[i] === top; i--) run++;
    return Math.min(run, CAP - B.length);
  }
  function pourSolved(tubes) { return tubes.every((t) => !t.length || (t.length === CAP && t.every((x) => x === t[0]))); }
  function pourSolve(tubes0, limit = 150000) {
    const key = (ts) => ts.map((t) => t.join('')).sort().join('|');
    const seen = new Set();
    let found = null, nodes = 0;
    (function dfs(ts, depth) {
      if (found || nodes > limit) return;
      if (pourSolved(ts)) { found = depth; return; }
      const k = key(ts); if (seen.has(k)) return; seen.add(k); nodes++;
      for (let a = 0; a < ts.length; a++) {
        const A = ts[a];
        if (!A.length || (A.length === CAP && A.every((x) => x === A[0]))) continue;
        const uniform = A.every((x) => x === A[0]);
        let triedEmpty = false;
        for (let b = 0; b < ts.length; b++) {
          const q = pourOK(ts, a, b); if (!q) continue;
          if (!ts[b].length) { if (uniform || triedEmpty) continue; triedEmpty = true; }
          const nt = ts.map((t) => t.slice());
          for (let i = 0; i < q; i++) nt[b].push(nt[a].pop());
          dfs(nt, depth + 1);
          if (found) return;
        }
      }
    })(tubes0.map((t) => t.slice()), 0);
    return found;
  }
  function genPour(num) {
    const R = rng(hashStr('pr-' + num));
    const t = tier(num);
    const k = [4, 6, 8][t] + (t < 2 ? rint(R, 2) : rint(R, 2));
    for (let attempt = 0; attempt < 200; attempt++) {
      const balls = []; for (let c = 0; c < k; c++) for (let i = 0; i < CAP; i++) balls.push(c);
      shuffle(R, balls);
      const tubes = [];
      for (let i = 0; i < k; i++) tubes.push(balls.slice(i * CAP, i * CAP + CAP));
      tubes.push([], []);
      if (tubes.some((tb) => tb.length === CAP && tb.every((x) => x === tb[0]))) continue;
      // avoid tubes with 3+ of same colour already stacked on top (too easy)
      const sol = pourSolve(tubes);
      if (sol == null) continue;
      return { k, tubes, tier: t };
    }
  }

  // ---------- FLOOD ----------
  function floodRegion(g, n) {
    const c0 = g[0], seen = new Set([0]), st = [0];
    while (st.length) { const i = st.pop(), r = Math.floor(i / n), c = i % n;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc, j = rr * n + cc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n || seen.has(j) || g[j] !== c0) continue; seen.add(j); st.push(j); } }
    return seen;
  }
  function floodApply(g, n, col) { const reg = floodRegion(g, n); const ng = g.slice(); reg.forEach((i) => (ng[i] = col)); return ng; }
  function floodGreedy(g0, n, colors) {
    let g = g0.slice(), moves = 0;
    while (floodRegion(g, n).size < n * n && moves < 200) {
      let best = null, bs = -1;
      for (let c = 0; c < colors; c++) {
        if (c === g[0]) continue;
        const g1 = floodApply(g, n, c);
        let s = floodRegion(g1, n).size * 100;
        // one-step lookahead
        let s2 = 0; for (let d = 0; d < colors; d++) if (d !== c) s2 = Math.max(s2, floodRegion(floodApply(g1, n, d), n).size);
        s += s2;
        if (s > bs) { bs = s; best = g1; }
      }
      g = best; moves++;
    }
    return moves;
  }
  function genFlood(num) {
    const R = rng(hashStr('fl-' + num));
    const t = tier(num);
    const n = [10, 12, 14][t], colors = [5, 6, 6][t];
    const g = Array.from({ length: n * n }, () => rint(R, colors));
    return { n, colors, grid: g, target: floodGreedy(g, n, colors), tier: t };
  }

  return { rng, hashStr, tier, TIER_NAMES, loToggle, genLightsOut, genUnblock, ubSolve, genQueens, queensCount, gen24, solve24, fr, fop, genKenKen, cageOk,
    genLinks, genPipes, pipesConnected, rotCW, genPour, pourOK, pourSolved, pourSolve, CAP, genFlood, floodRegion, floodApply };
})();
if (typeof module !== 'undefined') module.exports = Core;
