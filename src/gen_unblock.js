// Builds the Unblock puzzle bank: node src/gen_unblock.js <seedStart> <count> <outfile>
// For a random set of vehicles it explores the whole reachable state space, measures every state's
// distance to a solved state (BFS from all goal states), and keeps one board per difficulty band.
const fs = require('fs');
const [, , seedArg = '1', countArg = '400', out = 'ub_part.json', secArg = '1200'] = process.argv;
const T0 = Date.now(), LIMIT = +secArg * 1000;
let seed = +seedArg >>> 0;
const R = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rint = (n) => Math.floor(R() * n);
const BANDS = [[5, 8], [9, 13], [14, 19], [20, 99]];

function randomVehicles() {
  const occ = new Array(36).fill(false), vs = [];
  const redC = rint(3);
  vs.push({ r: 2, c: redC, len: 2, h: true }); occ[12 + redC] = occ[13 + redC] = true;
  const count = 10 + rint(5);
  let guard = 0;
  while (vs.length < count && guard++ < 300) {
    const len = R() < 0.7 ? 2 : 3, h = R() < 0.5;
    const r = h ? rint(6) : rint(7 - len), c = h ? rint(7 - len) : rint(6);
    if (h && r === 2) continue;
    let ok = true;
    for (let k = 0; k < len; k++) if (occ[(h ? r : r + k) * 6 + (h ? c + k : c)]) { ok = false; break; }
    if (!ok) continue;
    for (let k = 0; k < len; k++) occ[(h ? r : r + k) * 6 + (h ? c + k : c)] = true;
    vs.push({ r, c, len, h });
  }
  return vs;
}
function neighbours(vs, p) {
  const grid = new Int8Array(36).fill(-1);
  vs.forEach((v, i) => { for (let k = 0; k < v.len; k++) grid[(v.h ? v.r : p[i] + k) * 6 + (v.h ? p[i] + k : v.c)] = i; });
  const out = [];
  vs.forEach((v, i) => {
    for (const dir of [-1, 1]) {
      let pos = p[i];
      while (true) {
        const np = pos + dir; if (np < 0 || np + v.len > 6) break;
        const edge = dir < 0 ? np : np + v.len - 1;
        if (grid[(v.h ? v.r : edge) * 6 + (v.h ? edge : v.c)] !== -1) break;
        pos = np; const q = p.slice(); q[i] = pos; out.push(q);
      }
    }
  });
  return out;
}
function analyse(vs) {
  const start = vs.map((v) => (v.h ? v.c : v.r));
  const idx = new Map(), states = [], adj = [];
  const key = (p) => p.join(',');
  idx.set(key(start), 0); states.push(start);
  for (let s = 0; s < states.length; s++) {
    if (states.length > 120000) return null;
    const nb = neighbours(vs, states[s]).map((q) => { const k = key(q); if (!idx.has(k)) { idx.set(k, states.length); states.push(q); } return idx.get(k); });
    adj.push(nb);
  }
  const dist = new Int32Array(states.length).fill(-1);
  let frontier = [];
  states.forEach((p, s) => { if (p[0] === 4) { dist[s] = 0; frontier.push(s); } });
  if (!frontier.length) return null;
  let d = 0;
  while (frontier.length) {
    const next = [];
    for (const s of frontier) for (const t of adj[s]) if (dist[t] < 0) { dist[t] = d + 1; next.push(t); }
    frontier = next; d++;
  }
  return { states, dist };
}
const enc = (vs, p) => vs.map((v, i) => `${v.h ? v.r : p[i]}${v.h ? p[i] : v.c}${v.len}${v.h ? 'h' : 'v'}`).join('');
const want = +countArg, banks = [[], [], [], []], seen = new Set();
let tries = 0;
while (banks.some((b) => b.length < want) && Date.now() - T0 < LIMIT) {
  tries++;
  const vs = randomVehicles();
  const a = analyse(vs); if (!a) continue;
  BANDS.forEach(([lo, hi], t) => {
    if (banks[t].length >= want) return;
    // hardest states inside the band (up to 1 per config for easy/medium, 3 for hard/expert)
    const cands = [];
    for (let s = 0; s < a.states.length; s++) if (a.dist[s] >= lo && a.dist[s] <= hi) cands.push(s);
    cands.sort((x, y) => a.dist[y] - a.dist[x]);
    let took = 0;
    for (const s of cands.slice(0, 40)) {
      if (took >= (t >= 2 ? 3 : 1) || banks[t].length >= want) break;
      const e = enc(vs, a.states[s]);
      if (seen.has(e)) continue; seen.add(e);
      banks[t].push(a.dist[s] + ':' + e); took++;
      // skip near-duplicates: next pick must differ by at least 3 vehicle positions
      const p0 = a.states[s];
      cands.splice(0, cands.length, ...cands.filter((q) => a.states[q].filter((x, i) => x !== p0[i]).length >= 3));
    }
  });
  if (tries % 500 === 0) { fs.writeFileSync(out, JSON.stringify(banks)); } if (tries % 500 === 0) console.error(tries, banks.map((b) => b.length).join('/'));
}
fs.writeFileSync(out, JSON.stringify(banks));
console.error('done', tries, banks.map((b) => b.length).join('/'));
