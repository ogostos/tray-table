// ===== Bloom: match-3 engine (Homescapes/Gardenscapes-style rules). Pure logic + event log; works in browser and node =====
const M3 = (() => {
  // ---------- seeded rng kept inside the state, so a state can be cloned ----------
  const rnd = (st) => {
    st.seed = (st.seed + 0x6D2B79F5) | 0;
    let t = Math.imul(st.seed ^ (st.seed >>> 15), 1 | st.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ri = (st, n) => Math.floor(rnd(st) * n);
  const hash = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const SPECIALS = ['rh', 'rv', 'bomb', 'plane', 'rain'];

  // ---------- level generator: endless, seeded by (tier, number) ----------
  const SHAPES = [
    [[0, 8], [0, 8], [0, 8], [0, 8], [0, 8], [0, 8], [0, 8], [0, 8]],
    [[1, 8], [0, 8], [0, 8], [0, 8], [0, 8], [0, 8], [0, 8], [1, 8]],
    [[0, 7], [0, 8], [0, 8], [0, 8], [0, 8], [0, 8], [0, 8], [0, 7]],
    [[1, 7], [0, 8], [0, 8], [0, 8], [0, 8], [0, 8], [0, 8], [1, 7]],
    [[2, 8], [1, 8], [0, 8], [0, 8], [0, 8], [0, 8], [1, 8], [2, 8]],
    [[0, 9], [0, 9], [0, 9], [0, 9], [0, 9], [0, 9], [0, 9], [0, 9]],
    [[1, 9], [0, 9], [0, 9], [0, 9], [0, 9], [0, 9], [0, 9], [1, 9]],
  ];
  // ---------- one endless level path: each level number decides its own difficulty and which elements appear ----------
  // when each element first shows up (the level gets a "New!" card)
  const INTRO = { box: 4, carpet: 7, glass: 10, chain: 14, box2: 18, colors6: 21, chain2: 26, box3: 30, glass2: 34 };
  const INTRO_AT = new Set(Object.values(INTRO));
  const isHard = (n) => n >= 10 && n % 5 === 0 && !INTRO_AT.has(n); // a level that introduces something new is never a hard one
  const isSuper = (n) => isHard(n) && n % 25 === 0;
  function level(tier, num) {
    const n = Math.max(1, num);
    const g = { seed: hash(`bloom2|${n}`) | 0 };
    const R = () => rnd(g), RI = (k) => Math.floor(R() * k);
    const has = (k) => n >= INTRO[k];
    const hard = isHard(n), sup = isSuper(n);
    // board shape: plain early on, shaped later, taller boards in the hard ones
    let shape = SHAPES[0];
    if (n >= 8) shape = SHAPES[1 + RI(4)];
    if (n >= 20 && (hard || R() < 0.35)) shape = SHAPES[5 + RI(2)];
    if (n <= 7) shape = SHAPES[n >= 5 && n % 2 ? 1 : 0];
    const W = 8, H = Math.max(...shape.map(([, b]) => b));
    const mask = Array(W * H).fill(0);
    shape.forEach(([a, b], c) => { for (let r = a; r < b; r++) mask[r * W + c] = 1; });
    const ncol = n === INTRO.colors6 || (has('colors6') && (hard || sup || R() < Math.min(0.6, (n - 20) / 40))) ? 6 : 5;
    const box = Array(W * H).fill(0), chain = Array(W * H).fill(0), grass = Array(W * H).fill(0), ice = Array(W * H).fill(0);
    const mirror = (i) => { const r = Math.floor(i / W), c = i % W; return r * W + (W - 1 - c); };
    // which goals: the newest element is featured on its intro level
    const pool = ['col'];
    if (has('box')) pool.push('box'); if (has('carpet')) pool.push('grass'); if (has('glass')) pool.push('ice'); if (has('chain')) pool.push('chain');
    let kinds;
    const intro = Object.entries(INTRO).find(([, v]) => v === n);
    if (n <= 3) kinds = n === 3 ? ['col', 'col'] : ['col'];
    else if (intro) kinds = [{ box: 'box', carpet: 'grass', glass: 'ice', chain: 'chain', box2: 'box', colors6: 'col', chain2: 'chain', box3: 'box', glass2: 'ice' }[intro[0]]];
    else {
      const nGoals = n < 12 ? 1 + (R() < 0.4 ? 1 : 0) : n < 30 ? 2 : 2 + (R() < 0.35 || sup ? 1 : 0);
      kinds = [];
      const opts = pool.slice();
      while (kinds.length < nGoals && opts.length) { const k = opts.splice(RI(opts.length), 1)[0]; kinds.push(k); }
    }
    const ramp = Math.min(1, n / 40); // 0 → 1 over the first 40 levels
    const goals = []; let colsUsed = [];
    // obstacles first (boxes, chains, glass) so collect goals know the board
    for (const kind of kinds.filter((k) => k !== 'col')) {
      if (kind === 'box') {
        const maxL = has('box3') ? 3 : has('box2') ? 2 : 1;
        const pairs = 4 + Math.round(ramp * 4) + RI(2) + (hard ? 2 : 0);
        let placed = 0;
        const band = 2 + RI(Math.max(1, H - 4)); // boxes come in a band or block, like the real thing
        for (let t = 0; placed < pairs && t < 300; t++) {
          const r = t < 120 ? Math.min(H - 1, band + RI(3)) : 2 + RI(H - 2), c = RI(W / 2), i = r * W + c, j = mirror(i);
          if (!mask[i] || box[i] || !mask[j] || chain[i] || chain[j] || grass[i] || grass[j] || ice[i] || ice[j]) continue;
          const L = 1 + (maxL > 1 && R() < 0.35 + ramp * 0.3 ? RI(maxL) : 0); box[i] = L; box[j] = L; placed++;
        }
        goals.push({ t: 'box', n: placed * 2 });
      } else if (kind === 'chain') {
        const maxL = has('chain2') ? 2 : 1, cnt = 5 + Math.round(ramp * 6) + RI(3) + (hard ? 2 : 0);
        let placed = 0;
        for (let t = 0; placed < cnt && t < 300; t++) { const i = W + RI(W * (H - 1)); if (!mask[i] || box[i] || chain[i]) continue; chain[i] = 1 + (maxL > 1 && R() < 0.4 ? 1 : 0); placed++; }
        goals.push({ t: 'chain', n: placed });
      } else if (kind === 'ice') {
        const maxL = has('glass2') ? 2 : 1;
        // glass in a symmetric patch
        const r0 = 1 + RI(Math.max(1, H - 4)), h = 2 + RI(3), w = 2 + RI(2);
        let cnt = 0;
        for (let r = r0; r < Math.min(H, r0 + h); r++) for (let c = 0; c < w; c++) for (const cc of [c, W - 1 - c]) { const i = r * W + cc; if (mask[i] && !box[i] && !ice[i]) { ice[i] = 1 + (maxL > 1 && R() < 0.45 ? 1 : 0); cnt++; } }
        if (n >= 16 && R() < 0.5) for (let r = r0; r < Math.min(H, r0 + h); r++) for (const cc of [3, 4]) { const i = r * W + cc; if (mask[i] && !box[i] && !ice[i]) { ice[i] = 1; cnt++; } }
        goals.push({ t: 'ice', n: cnt });
      } else if (kind === 'grass') {
        const cells = []; for (let i = 0; i < W * H; i++) if (mask[i] && !box[i]) cells.push(i);
        const seeds = 1 + RI(2);
        for (let k = 0; k < seeds; k++) { const i = cells[RI(cells.length)]; grass[i] = 1; grass[mirror(i)] = 1; }
        let left = 0; for (let i = 0; i < W * H; i++) if (mask[i] && !grass[i]) left++;
        goals.push({ t: 'grass', n: left });
      }
    }
    for (const kind of kinds.filter((k) => k === 'col')) {
      let k = RI(ncol); while (colsUsed.includes(k)) k = (k + 1) % ncol; colsUsed.push(k);
      const cnt = Math.round((n <= 3 ? 14 + n * 3 : 18 + ramp * 14) + RI(6) - (kinds.length > 1 ? 4 : 0) + (hard ? 4 : 0));
      goals.push({ t: 'col', k, n: cnt });
    }
    const spec = { W, H, mask, box, chain, grass, ice, ncol, goals, moves: 99, seed: hash(`bloom2-play|${n}`) | 0, hard: hard ? (sup ? 2 : 1) : 0, intro: intro ? intro[0] : null, num: n };
    // move limit: a fair robot plays it twice; early levels get a lot of slack, later ones (and hard ones) much less
    const used = [1, 2, 3].map((salt) => botPlay(spec, salt));
    const avg = (used[0] + used[1] + used[2]) / 3, worst = Math.max(...used);
    const base = (avg + worst) / 2; // lean towards the unlucky run, so a bad refill doesn't make it unwinnable
    const slack = (n <= 3 ? 1.9 : 1.6 - ramp * 0.34) + (intro ? 0.3 : 0); // 1.6 → 1.26; a new element gets extra room
    const extra = Math.max(1, Math.round(5 - ramp * 3));
    spec.moves = Math.round(Math.max(12, Math.min(kinds.includes('grass') ? 52 : 45, base * slack * (sup ? 0.92 : hard ? 0.97 : 1) + extra)));
    return spec;
  }
  function botValue(st0, st) {
    let v = 0;
    st.goals.forEach((g, j) => { v += (st0.goals[j].left - g.left) * (g.t === 'col' ? 1 : g.t === 'grass' ? 1.2 : g.t === 'ice' ? 1.6 : 3); });
    return v + st.score / 400 + (won(st) ? 1000 : 0);
  }
  function botPlay(spec, salt) {
    const st = init({ ...spec, seed: (spec.seed ^ (salt * 7919)) | 0 });
    let used = 0;
    while (!won(st) && used < 99) {
      const ms = allMoves(st); if (!ms.length) break;
      let best = -1, m = ms[0];
      for (const x of ms) {
        const c = clone(st); c.seed = (c.seed ^ 0x5bd1e995 ^ used) | 0; // unknown refills
        if (x.length === 2) swap(c, x[0], x[1]); else tap(c, x[0]);
        const v = botValue(st, c); if (v > best) { best = v; m = x; }
      }
      if (m.length === 2) swap(st, m[0], m[1]); else tap(st, m[0]);
      used++;
    }
    return used;
  }

  // ---------- state ----------
  function init(spec) {
    const st = { W: spec.W, H: spec.H, mask: spec.mask.slice(), box: spec.box.slice(), chain: spec.chain.slice(), grass: spec.grass.slice(), ice: (spec.ice || Array(spec.W * spec.H).fill(0)).slice(),
      ncol: spec.ncol, seed: spec.seed, nid: 1, moves: spec.moves, score: 0, p: Array(spec.W * spec.H).fill(null),
      goals: spec.goals.map((g) => ({ ...g, left: g.n })), hasGrass: spec.goals.some((g) => g.t === 'grass') };
    fillFresh(st);
    return st;
  }
  const clone = (st) => ({ ...st, mask: st.mask, box: st.box.slice(), chain: st.chain.slice(), grass: st.grass.slice(), ice: st.ice.slice(), p: st.p.map((q) => (q ? { ...q } : null)), goals: st.goals.map((g) => ({ ...g })) });
  const color = (st, i) => { const q = st.p[i]; return q && !q.sp ? q.k : -1; }; // power-ups are colourless: they never match
  const movable = (st, i) => st.mask[i] && !st.box[i] && st.p[i] && !st.chain[i];
  function fillFresh(st) {
    const { W, H } = st;
    for (let tries = 0; tries < 50; tries++) {
      for (let i = 0; i < W * H; i++) {
        st.p[i] = null;
        if (!st.mask[i] || st.box[i]) continue;
        const r = Math.floor(i / W), c = i % W;
        const bad = new Set();
        if (c >= 2 && color(st, i - 1) >= 0 && color(st, i - 1) === color(st, i - 2)) bad.add(color(st, i - 1));
        if (r >= 2 && color(st, i - W) >= 0 && color(st, i - W) === color(st, i - 2 * W)) bad.add(color(st, i - W));
        if (r >= 1 && c >= 1 && color(st, i - 1) >= 0 && color(st, i - 1) === color(st, i - W) && color(st, i - 1) === color(st, i - W - 1)) bad.add(color(st, i - 1));
        let k = ri(st, st.ncol); for (let n = 0; n < 8 && bad.has(k); n++) k = (k + 1) % st.ncol;
        st.p[i] = { id: st.nid++, k, sp: 0 };
      }
      if (hasMove(st)) return;
    }
  }
  const goalOf = (st, t, k) => st.goals.find((g) => g.t === t && (k == null || g.k === k));
  const prog = (st, t, k, by = 1) => { const g = goalOf(st, t, k); if (g && g.left > 0) g.left = Math.max(0, g.left - by); };
  const won = (st) => st.goals.every((g) => g.left <= 0);

  // ---------- matching ----------
  function findGroups(st) {
    const { W, H } = st, N = W * H;
    const par = Array(N).fill(-1);
    const find = (a) => (par[a] === a ? a : (par[a] = find(par[a])));
    const add = (a) => { if (par[a] < 0) par[a] = a; };
    const uni = (a, b) => { add(a); add(b); const x = find(a), y = find(b); if (x !== y) par[x] = y; };
    const runs = [], squares = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W;) {
      const k = color(st, r * W + c); let e = c + 1;
      while (k >= 0 && e < W && color(st, r * W + e) === k) e++;
      if (k >= 0 && e - c >= 3) { const cells = []; for (let x = c; x < e; x++) cells.push(r * W + x); runs.push({ cells, d: 'h' }); }
      c = e;
    }
    for (let c = 0; c < W; c++) for (let r = 0; r < H;) {
      const k = color(st, r * W + c); let e = r + 1;
      while (k >= 0 && e < H && color(st, e * W + c) === k) e++;
      if (k >= 0 && e - r >= 3) { const cells = []; for (let y = r; y < e; y++) cells.push(y * W + c); runs.push({ cells, d: 'v' }); }
      r = e;
    }
    for (let r = 0; r < H - 1; r++) for (let c = 0; c < W - 1; c++) {
      const i = r * W + c, k = color(st, i);
      if (k >= 0 && color(st, i + 1) === k && color(st, i + W) === k && color(st, i + W + 1) === k) squares.push({ cells: [i, i + 1, i + W, i + W + 1] });
    }
    for (const x of [...runs, ...squares]) for (let j = 1; j < x.cells.length; j++) uni(x.cells[0], x.cells[j]);
    const groups = new Map();
    const gOf = (i) => { const root = find(i); if (!groups.has(root)) groups.set(root, { cells: new Set(), runs: [], squares: [] }); return groups.get(root); };
    for (const x of runs) { const g = gOf(x.cells[0]); g.runs.push(x); x.cells.forEach((i) => g.cells.add(i)); }
    for (const x of squares) { const g = gOf(x.cells[0]); g.squares.push(x); x.cells.forEach((i) => g.cells.add(i)); }
    return [...groups.values()];
  }
  function planSpecial(st, g, prefer) {
    const long = g.runs.find((x) => x.cells.length >= 5);
    const hs = g.runs.filter((x) => x.d === 'h'), vs = g.runs.filter((x) => x.d === 'v');
    let sp = 0, loc = null, cross = null;
    if (hs.length && vs.length) for (const a of hs) for (const b of vs) { const i = a.cells.find((x) => b.cells.includes(x)); if (i != null) cross = i; }
    if (long) { sp = 'rain'; loc = long.cells[2]; }
    else if (cross != null && g.cells.size >= 5) { sp = 'bomb'; loc = cross; }
    else if (g.runs.find((x) => x.cells.length === 4)) { const x = g.runs.find((y) => y.cells.length === 4); sp = x.d === 'h' ? 'rh' : 'rv'; loc = x.cells[1]; }
    else if (g.squares.length) { sp = 'plane'; loc = g.squares[0].cells[0]; }
    if (!sp) return null;
    const pref = prefer.find((i) => g.cells.has(i) && !st.chain[i]);
    if (pref != null) loc = pref;
    if (st.chain[loc]) { const alt = [...g.cells].find((i) => !st.chain[i]); if (alt == null) return null; loc = alt; }
    const k = color(st, [...g.cells][0]);
    return { sp, loc, k };
  }
  // would the board have a match touching cell i?
  function matchAt(st, i) {
    const { W, H } = st, k = color(st, i); if (k < 0) return false;
    const r = Math.floor(i / W), c = i % W;
    let a = c, b = c; while (a > 0 && color(st, i - (c - a) - 1) === k) a--; while (b < W - 1 && color(st, i + (b - c) + 1) === k) b++;
    if (b - a >= 2) return true;
    a = r; b = r; while (a > 0 && color(st, (a - 1) * W + c) === k) a--; while (b < H - 1 && color(st, (b + 1) * W + c) === k) b++;
    if (b - a >= 2) return true;
    for (const [dr, dc] of [[0, 0], [0, -1], [-1, 0], [-1, -1]]) {
      const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H - 1 || cc >= W - 1) continue;
      const j = rr * W + cc; if (color(st, j) === k && color(st, j + 1) === k && color(st, j + W) === k && color(st, j + W + 1) === k) return true;
    }
    return false;
  }
  const adj = (st, a, b) => { const { W } = st; const ra = Math.floor(a / W), rb = Math.floor(b / W); return (ra === rb && Math.abs(a - b) === 1) || (a % W === b % W && Math.abs(ra - rb) === 1); };
  function swapValid(st, a, b) {
    if (!adj(st, a, b) || !movable(st, a) || !movable(st, b)) return false;
    if (st.p[a].sp || st.p[b].sp) return true;
    [st.p[a], st.p[b]] = [st.p[b], st.p[a]];
    const ok = matchAt(st, a) || matchAt(st, b);
    [st.p[a], st.p[b]] = [st.p[b], st.p[a]];
    return ok;
  }
  function allMoves(st) {
    const out = [], { W, H } = st;
    for (let i = 0; i < W * H; i++) {
      if (!movable(st, i)) continue;
      if (st.p[i].sp) out.push([i]);
      const c = i % W;
      if (c < W - 1 && swapValid(st, i, i + 1)) out.push([i, i + 1]);
      if (i + W < W * H && swapValid(st, i, i + W)) out.push([i, i + W]);
    }
    return out;
  }
  function hasMove(st) {
    const { W, H } = st;
    for (let i = 0; i < W * H; i++) {
      if (!movable(st, i)) continue;
      if (st.p[i].sp) return true;
      if (i % W < W - 1 && swapValid(st, i, i + 1)) return true;
      if (i + W < W * H && swapValid(st, i, i + W)) return true;
    }
    return false;
  }

  // ---------- blasts ----------
  function effectCells(st, sp, i, opt = {}) {
    const { W, H } = st, r = Math.floor(i / W), c = i % W, out = [];
    const ok = (rr, cc) => rr >= 0 && cc >= 0 && rr < H && cc < W && st.mask[rr * W + cc];
    const push = (rr, cc) => { if (ok(rr, cc)) out.push(rr * W + cc); };
    if (sp === 'rh') for (let x = 0; x < W; x++) push(r, x);
    else if (sp === 'rv') for (let y = 0; y < H; y++) push(y, c);
    else if (sp === 'bomb') { const R = opt.radius || 2; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (!(Math.abs(dy) === R && Math.abs(dx) === R) || R > 2) push(r + dy, c + dx); }
    else if (sp === 'cross') { for (let x = 0; x < W; x++) push(r, x); for (let y = 0; y < H; y++) if (y !== r) push(y, c); }
    else if (sp === 'cross3') { for (let y = r - 1; y <= r + 1; y++) for (let x = 0; x < W; x++) push(y, x); for (let x = c - 1; x <= c + 1; x++) for (let y = 0; y < H; y++) if (Math.abs(y - r) > 1) push(y, x); }
    else if (sp === 'plus') { push(r, c); push(r - 1, c); push(r + 1, c); push(r, c - 1); push(r, c + 1); }
    else if (sp === 'all') { for (let j = 0; j < W * H; j++) if (st.mask[j]) out.push(j); }
    return out;
  }
  function commonColor(st) {
    const cnt = Array(st.ncol).fill(0); st.p.forEach((q) => { if (q && !q.sp) cnt[q.k]++; });
    let best = 0; cnt.forEach((v, k) => { if (v > cnt[best]) best = k; }); return best;
  }
  function planeTarget(st, avoid) {
    const { W, H } = st, tiers = [[], [], [], []];
    const want = st.goals.filter((g) => g.left > 0);
    for (let i = 0; i < W * H; i++) {
      if (!st.mask[i] || avoid.has(i)) continue;
      if (st.box[i] && want.some((g) => g.t === 'box')) tiers[0].push(i);
      else if (st.chain[i] && want.some((g) => g.t === 'chain')) tiers[0].push(i);
      else if (st.ice[i] && st.p[i] && want.some((g) => g.t === 'ice')) tiers[0].push(i);
      else if (st.hasGrass && !st.grass[i] && want.some((g) => g.t === 'grass')) tiers[1].push(i);
      else if (st.p[i] && !st.p[i].sp && want.some((g) => g.t === 'col' && g.k === st.p[i].k)) tiers[2].push(i);
      else if (st.p[i] || st.box[i]) tiers[3].push(i);
    }
    const t = tiers.find((x) => x.length); return t ? t[ri(st, t.length)] : null;
  }

  // ---------- resolution (mutates state, appends events) ----------
  // events: clear {items:[{id,i,k,sp}], box:[{i,left}], chain:[{i,left}], grass:[i], col:[{i,k}]}, fx {kind,i,...}, make {id,i,k,sp,from?}, fall {moves:[{id,k,sp,path,spawn}]}, shuffle {to:[{id,i}]}
  function run(st, ev, firstWave, swapCells = [], depth0 = 0) {
    let depth = depth0;
    let wave = firstWave; // {hits:[{i,g:grassy}], match:Set|null, creates:[]}
    for (;;) {
      if (wave) { depth++; blastWaves(st, ev, wave, depth); wave = null; }
      gravity(st, ev);
      const groups = findGroups(st);
      if (!groups.length) break;
      const creates = [], hits = [], match = new Set();
      for (const g of groups) {
        const grassy = st.hasGrass && [...g.cells].some((i) => st.grass[i]);
        const plan = planSpecial(st, g, swapCells);
        if (plan) creates.push(plan);
        for (const i of g.cells) { hits.push({ i, g: grassy }); match.add(i); }
      }
      swapCells = [];
      wave = { hits, match, creates };
    }
    if (!hasMove(st) && !won(st)) shuffle(st, ev);
  }
  function blastWaves(st, ev, wave, depth) {
    const mult = 1 + (depth - 1) * 0.5;
    const reserved = new Set((wave.creates || []).map((x) => x.loc));
    let hits = wave.hits, first = true;
    const seen = new Set();
    while (hits.length) {
      const ce = { t: 'clear', items: [], box: [], chain: [], grass: [], col: [], ice: [] };
      const trig = [];
      const boxHit = new Set();
      for (const { i, g } of hits) {
        if (g && st.hasGrass && st.mask[i] && !st.grass[i]) { st.grass[i] = 1; ce.grass.push(i); prog(st, 'grass'); st.score += 15; }
        if (seen.has(i)) continue; seen.add(i);
        hitOne(st, i, ce, trig, mult, boxHit);
      }
      if (first && wave.match) { // matches also crack boxes next to them
        const { W, H } = st;
        for (const i of wave.match) {
          const r = Math.floor(i / W), c = i % W;
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
            const j = rr * W + cc; if (st.box[j] && !boxHit.has(j) && !wave.match.has(j)) { boxHit.add(j); damageBox(st, j, ce); }
          }
        }
      }
      ev.push(ce);
      if (first && wave.creates) {
        for (const x of wave.creates) {
          if (st.p[x.loc] || st.box[x.loc]) continue;
          const q = { id: st.nid++, k: -1, sp: x.sp };
          st.p[x.loc] = q; st.score += 50; ev.push({ t: 'make', id: q.id, i: x.loc, k: q.k, sp: q.sp });
        }
      }
      first = false;
      hits = [];
      for (const s of trig) hits.push(...fire(st, ev, s, seen, reserved));
    }
  }
  function damageBox(st, i, ce) {
    st.box[i]--; st.score += 30; ce.box.push({ i, left: st.box[i] });
    if (!st.box[i]) prog(st, 'box');
  }
  function hitOne(st, i, ce, trig, mult, boxHit) {
    if (!st.mask[i]) return;
    if (st.box[i]) { if (!boxHit.has(i)) { boxHit.add(i); damageBox(st, i, ce); } return; }
    const q = st.p[i]; if (!q) return;
    if (st.chain[i]) { st.chain[i]--; st.score += 30; ce.chain.push({ i, left: st.chain[i] }); if (!st.chain[i]) prog(st, 'chain'); return; }
    st.p[i] = null; ce.items.push({ id: q.id, i, k: q.k, sp: q.sp });
    if (st.ice[i]) { st.ice[i]--; st.score += 25; ce.ice.push({ i, left: st.ice[i] }); if (!st.ice[i]) prog(st, 'ice'); }
    st.score += Math.round(10 * mult);
    if (!q.sp) { const g = goalOf(st, 'col', q.k); if (g && g.left > 0) { g.left--; ce.col.push({ i, k: q.k }); } }
    if (q.sp) trig.push({ sp: q.sp, i, k: q.k, grassy: st.hasGrass && !!st.grass[i] });
  }
  // a power-up goes off at i; returns the cells it hits (next wave)
  function fire(st, ev, s, seen, reserved, payload) {
    const g = s.grassy;
    const wrap = (cells) => cells.filter((j) => !reserved.has(j)).map((j) => ({ i: j, g }));
    if (s.sp === 'rh' || s.sp === 'rv' || s.sp === 'bomb') { ev.push({ t: 'fx', kind: s.sp, i: s.i }); return wrap(effectCells(st, s.sp, s.i)); }
    if (s.sp === 'cross' || s.sp === 'cross3' || s.sp === 'bigbomb' || s.sp === 'all') {
      ev.push({ t: 'fx', kind: s.sp, i: s.i });
      return wrap(s.sp === 'bigbomb' ? effectCells(st, 'bomb', s.i, { radius: 3 }) : effectCells(st, s.sp, s.i));
    }
    if (s.sp === 'plane') {
      const near = effectCells(st, 'plus', s.i);
      const avoid = new Set([...seen, ...near]);
      const tgt = planeTarget(st, avoid);
      ev.push({ t: 'fx', kind: 'plane', i: s.i, to: tgt, carry: s.carry || null });
      const out = wrap(near.filter((j) => j !== s.i));
      if (tgt != null) {
        if (s.carry) out.push(...fire(st, ev, { sp: s.carry, i: tgt, grassy: g }, seen, reserved));
        else out.push({ i: tgt, g });
      }
      return out;
    }
    if (s.sp === 'rain') {
      const k = s.k >= 0 && s.withK == null ? commonColor(st) : s.withK != null ? s.withK : commonColor(st);
      const cells = []; st.p.forEach((q, j) => { if (q && q.k === k && !q.sp) cells.push(j); });
      ev.push({ t: 'fx', kind: 'rain', i: s.i, cells, k });
      return wrap(cells);
    }
    return [];
  }

  // ---------- gravity with diagonal slides ----------
  function gravity(st, ev) {
    const { W, H } = st, paths = new Map();
    const stuck = new Set(); // empty cells nothing can reach (under boxes) count as walls
    const blocked = (i) => !st.mask[i] || st.box[i] > 0 || (st.p[i] && st.chain[i] > 0) || (stuck.has(i) && !st.p[i]);
    const topOf = (c) => { for (let r = 0; r < H; r++) if (st.mask[r * W + c]) return r; return H; };
    const tops = Array.from({ length: W }, (_, c) => topOf(c));
    const spawnN = Array(W).fill(0);
    const rec = (q, from, to) => { if (!paths.has(q.id)) paths.set(q.id, { q, path: [from] }); paths.get(q.id).path.push(to); };
    for (let tick = 0; tick < 60; tick++) {
      let moved = false; const done = new Set();
      for (let r = H - 1; r >= 0; r--) for (let c = 0; c < W; c++) {
        const i = r * W + c;
        if (!st.mask[i] || st.box[i] || st.p[i]) continue;
        const up = (r - 1) * W + c;
        if (r - 1 >= 0 && st.mask[up] && !blocked(up)) {
          if (st.p[up] && !done.has(st.p[up].id)) { const q = st.p[up]; st.p[i] = q; st.p[up] = null; rec(q, up, i); done.add(q.id); moved = true; }
          continue; // empty above: wait for it to fill
        }
        if (r === tops[c]) { // spawn from the top
          const q = { id: st.nid++, k: ri(st, st.ncol), sp: 0 };
          st.p[i] = q; spawnN[c]++; paths.set(q.id, { q, path: [(tops[c] - spawnN[c]) * W + c, i], spawn: true }); done.add(q.id); moved = true; continue;
        }
        // above is blocked: slide in diagonally from a piece that can't fall straight down
        for (const dc of [-1, 1]) {
          const cc = c + dc; if (cc < 0 || cc >= W || r - 1 < 0) continue;
          const s = (r - 1) * W + cc, below = r * W + cc;
          if (!st.mask[s] || blocked(s) || !st.p[s] || done.has(st.p[s].id)) continue;
          if (st.mask[below] && !st.box[below] && !st.p[below]) continue;
          const q = st.p[s]; st.p[i] = q; st.p[s] = null; rec(q, s, i); done.add(q.id); moved = true; break;
        }
      }
      if (!moved) {
        let more = false;
        for (let i = W; i < W * H; i++) if (st.mask[i] && !st.box[i] && !st.p[i] && st.mask[i - W] && !st.box[i - W] && !st.p[i - W] && !stuck.has(i - W)) { stuck.add(i - W); more = true; }
        if (!more) break;
      }
    }
    if (paths.size) ev.push({ t: 'fall', moves: [...paths.values()].map((x) => ({ id: x.q.id, k: x.q.k, sp: x.q.sp, path: x.path, spawn: !!x.spawn })) });
  }
  function shuffle(st, ev) {
    const idx = []; for (let i = 0; i < st.W * st.H; i++) if (movable(st, i) && !st.p[i].sp) idx.push(i);
    for (let t = 0; t < 40; t++) {
      const qs = idx.map((i) => st.p[i]);
      for (let j = qs.length - 1; j > 0; j--) { const x = ri(st, j + 1); [qs[j], qs[x]] = [qs[x], qs[j]]; }
      idx.forEach((i, j) => (st.p[i] = qs[j]));
      if (!findGroups(st).length && hasMove(st)) break;
    }
    if (!hasMove(st)) { idx.forEach((i) => (st.p[i] = { id: st.nid++, k: ri(st, st.ncol), sp: 0 })); }
    ev.push({ t: 'shuffle', to: idx.map((i) => ({ id: st.p[i].id, i, k: st.p[i].k })) });
  }

  // ---------- player actions ----------
  function swap(st, a, b) {
    const ev = [];
    if (st.moves <= 0 || won(st) || !swapValid(st, a, b)) { ev.push({ t: 'bad', a, b }); return { ok: false, ev }; }
    st.moves--;
    const qa = st.p[a], qb = st.p[b];
    [st.p[a], st.p[b]] = [qb, qa];
    ev.push({ t: 'swap', a, b, ida: qa.id, idb: qb.id });
    const A = st.p[b], B = st.p[a]; // A moved to b, B moved to a
    const grassy = st.hasGrass && (!!st.grass[a] || !!st.grass[b]);
    if (A.sp && B.sp) { combo(st, ev, A, B, b, a, grassy); }
    else if (A.sp === 'rain' || B.sp === 'rain') {
      const R = A.sp === 'rain' ? A : B, other = R === A ? B : A, ri_ = R === A ? b : a;
      st.p[ri_] = null; ev.push({ t: 'clear', items: [{ id: R.id, i: ri_, k: -1, sp: 'rain' }], box: [], chain: [], grass: [], col: [], ice: [] });
      const seen = new Set([ri_]);
      const hits = fire(st, ev, { sp: 'rain', i: ri_, withK: other.k, grassy }, seen, new Set());
      run(st, ev, { hits, match: null, creates: [] }, [a, b]);
    } else if (A.sp || B.sp) {
      const S = A.sp ? A : B, si = S === A ? b : a;
      const hits = [{ i: si, g: grassy }];
      // the normal piece may also complete a match; resolve that after the blast
      run(st, ev, { hits, match: null, creates: [] }, [a, b]);
    } else run(st, ev, null, [b, a]);
    return { ok: true, ev };
  }
  function combo(st, ev, A, B, at, other, grassy) {
    st.p[other] = null; st.p[at] = null;
    ev.push({ t: 'clear', items: [{ id: B.id, i: other, k: B.k, sp: B.sp }, { id: A.id, i: at, k: A.k, sp: A.sp }], box: [], chain: [], grass: [], col: [], ice: [] });
    const kind = (q) => (q.sp === 'rh' || q.sp === 'rv' ? 'r' : q.sp);
    const ks = [kind(A), kind(B)].sort().join('+');
    const seen = new Set([at, other]), res = new Set();
    let hits = [];
    const go = (s) => hits.push(...fire(st, ev, { ...s, grassy }, seen, res));
    if (ks === 'rain+rain') go({ sp: 'all', i: at });
    else if (ks.includes('rain')) {
      const X = A.sp === 'rain' ? B : A, k = commonColor(st);
      const made = [];
      st.p.forEach((q, j) => {
        if (q && !q.sp && q.k === k && !st.chain[j]) { const sp = kind(X) === 'r' ? (rnd(st) < 0.5 ? 'rh' : 'rv') : X.sp; q.sp = sp; made.push(j); ev.push({ t: 'make', id: q.id, i: j, k: q.k, sp, from: at }); }
      });
      ev.push({ t: 'fx', kind: 'rain', i: at, cells: made, k });
      hits = made.map((j) => ({ i: j, g: grassy }));
    } else if (ks === 'r+r') go({ sp: 'cross', i: at });
    else if (ks === 'bomb+r') go({ sp: 'cross3', i: at });
    else if (ks === 'bomb+bomb') go({ sp: 'bigbomb', i: at });
    else if (ks === 'plane+plane') { for (let n = 0; n < 3; n++) go({ sp: 'plane', i: at }); }
    else if (ks === 'bomb+plane' || ks === 'plane+r') { const X = A.sp === 'plane' ? B : A; go({ sp: 'plane', i: at, carry: X.sp }); }
    run(st, ev, { hits, match: null, creates: [] }, []);
  }
  function tap(st, i) {
    const ev = [];
    if (st.moves <= 0 || won(st) || !movable(st, i) || !st.p[i].sp) return { ok: false, ev };
    st.moves--;
    const grassy = st.hasGrass && !!st.grass[i];
    run(st, ev, { hits: [{ i, g: grassy }], match: null, creates: [] }, []);
    return { ok: true, ev };
  }
  // level won: every move left becomes a rocket, then every power-up on the board goes off
  function finale(st) {
    const ev = [];
    let guard = 0;
    while (st.moves > 0 && guard++ < 60) {
      const cand = []; st.p.forEach((q, j) => { if (q && !q.sp && !st.chain[j]) cand.push(j); });
      if (!cand.length) break;
      const j = cand[ri(st, cand.length)];
      st.p[j].sp = rnd(st) < 0.5 ? 'rh' : 'rv'; st.moves--; st.score += 100;
      ev.push({ t: 'make', id: st.p[j].id, i: j, k: st.p[j].k, sp: st.p[j].sp, bonus: true });
    }
    for (let n = 0; n < 80; n++) {
      const j = st.p.findIndex((q, x) => q && q.sp && !st.chain[x]);
      if (j < 0) break;
      run(st, ev, { hits: [{ i: j, g: false }], match: null, creates: [] }, []);
    }
    return ev;
  }
  function hint(st) {
    const ms = allMoves(st).filter((m) => m.length === 2);
    if (ms.length) return ms[ri({ seed: st.seed ^ 77 }, ms.length)];
    const t = allMoves(st)[0]; return t || null;
  }
  const status = (st) => (won(st) ? 'win' : st.moves <= 0 ? 'lose' : 'play');
  return { INTRO, isHard, level, init, clone, swap, tap, finale, hint, status, allMoves, swapValid, movable, won, SPECIALS, findGroups, hasMove };
})();
if (typeof module !== 'undefined') module.exports = M3;
