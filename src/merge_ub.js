// merge Unblock bank parts: node src/merge_ub.js out.json part1.json part2.json ...
const fs = require('fs');
const [, , out, ...parts] = process.argv;
const banks = [[], [], [], []], seen = new Set();
for (const p of parts) { let b; try { b = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
  b.forEach((list, t) => list.forEach((x) => { const k = x.split(':')[1]; if (!seen.has(k)) { seen.add(k); banks[t].push(x); } })); }
// order each tier from easier to harder so #1 is a gentle start inside the tier
banks.forEach((l) => l.sort((a, b) => (+a.split(':')[0]) - (+b.split(':')[0]) || (a < b ? -1 : 1)));
// interleave so consecutive numbers aren't monotonic: deterministic shuffle by hash
banks.forEach((l, t) => { let s = 12345 + t; for (let i = l.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) & 0x7fffffff; const j = s % (i + 1); [l[i], l[j]] = [l[j], l[i]]; } });
banks[0] = banks[0].slice(0, 500); banks[1] = banks[1].slice(0, 500); banks[2] = banks[2].slice(0, 800);
fs.writeFileSync(out, JSON.stringify(banks));
console.log(banks.map((b) => b.length).join('/'));
