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
  const TIER_NAMES = ['Easy', 'Medium', 'Hard', 'Expert'];
  const seedOf = (id, t, num) => rng(hashStr(`${id}-${t}-${num}`));

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
  function genLightsOut(t, num) {
    const R = seedOf('lo', t, num);
    const n = t === 3 ? 6 : 5;
    const presses = [5, 8, 11, 15][t] + rint(R, 3);
    const board = new Array(n * n).fill(0);
    const cells = shuffle(R, [...Array(n * n).keys()]).slice(0, presses);
    cells.forEach((i) => loToggle(board, n, i));
    if (board.every((v) => v === 0)) loToggle(board, n, Math.floor(n * n / 2));
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
  function genQueens(t, num) {
    const R = seedOf('qn', t, num);
    const n = [6, 7, 8, 9][t];
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
  // hand pools, classified offline over every 1..13 multiset (hex digits):
  // easy = no division needed, max <= 9; medium = no division, has 10-13; hard = needs ÷; frac = needs a fraction
  const H24 = {"easy":["1118","1126","1127","1128","1129","1134","1135","1136","1137","1138","1139","1144","1145","1146","1147","1148","1149","1155","1156","1157","1158","1166","1169","1188","1224","1225","1226","1227","1228","1229","1233","1234","1235","1236","1237","1238","1239","1244","1245","1246","1247","1248","1249","1255","1256","1257","1258","1259","1266","1267","1268","1269","1278","1279","1288","1289","1333","1334","1335","1336","1337","1338","1339","1344","1345","1347","1348","1349","1356","1357","1358","1359","1366","1367","1368","1369","1377","1378","1388","1444","1445","1446","1447","1448","1449","1455","1457","1458","1459","1466","1467","1468","1469","1477","1478","1479","1488","1489","1556","1559","1566","1567","1568","1569","1578","1579","1588","1589","1599","1666","1669","1679","1688","1689","1699","1779","1788","1789","1799","1888","1889","2223","2224","2225","2227","2228","2229","2233","2234","2235","2236","2237","2238","2239","2244","2245","2246","2247","2248","2249","2255","2256","2257","2258","2259","2266","2267","2268","2269","2277","2278","2288","2289","2333","2335","2336","2337","2338","2339","2344","2345","2346","2347","2348","2349","2355","2356","2357","2358","2359","2366","2367","2368","2369","2377","2378","2379","2388","2389","2399","2444","2445","2446","2447","2448","2449","2455","2456","2457","2458","2459","2466","2467","2468","2469","2477","2478","2479","2488","2489","2499","2557","2559","2566","2567","2568","2577","2578","2579","2588","2589","2666","2667","2668","2669","2678","2679","2688","2689","2699","2778","2788","2789","2888","2889","2899","3333","3334","3335","3336","3337","3338","3344","3345","3346","3347","3348","3349","3356","3357","3359","3367","3368","3369","3378","3379","3389","3399","3444","3445","3446","3447","3448","3449","3455","3456","3457","3458","3459","3466","3468","3469","3477","3478","3479","3489","3499","3556","3557","3558","3566","3567","3568","3569","3578","3579","3588","3589","3599","3666","3667","3668","3669","3677","3678","3679","3688","3689","3699","3777","3778","3788","3789","3799","3888","3889","3899","3999","4444","4446","4447","4448","4449","4455","4456","4457","4458","4468","4469","4478","4479","4488","4489","4555","4556","4559","4566","4567","4568","4569","4577","4578","4579","4589","4666","4667","4668","4669","4677","4678","4688","4689","4699","4778","4788","4789","4888","4889","5556","5559","5566","5567","5568","5577","5578","5589","5667","5668","5669","5678","5679","5688","5689","5699","5779","5788","5789","5888","5889","6666","6668","6669","6679","6689","6799","6888","6889","7889"],"medium":["111b","111c","111d","112a","112b","112c","112d","113a","113b","113c","113d","114a","114c","116c","117a","119d","11ac","11ad","11bb","11bc","11bd","11cc","11cd","11dd","122a","122b","122c","122d","123a","123b","123c","123d","124a","124b","124c","124d","125a","125c","125d","126a","126b","126c","126d","127a","127b","127c","128a","128d","129b","129c","129d","12ab","12ac","12ad","12bb","12bc","12bd","12cc","12cd","12dd","133a","133b","133c","134a","134b","134c","134d","135a","135b","135c","135d","136a","136b","136c","136d","137a","137d","138b","138c","138d","139a","139b","139c","139d","13aa","13ab","13ac","13bb","13bc","13cc","13cd","13dd","144a","144b","144c","145a","145b","145c","145d","146a","146b","146c","146d","147b","147c","147d","148b","148c","148d","149a","149b","149c","149d","14aa","14ab","14ac","14cc","155a","155b","155d","156a","156b","156c","156d","157a","157b","157c","157d","158a","158b","158c","158d","159a","159b","159c","159d","15aa","166a","166b","166c","166d","167a","167b","167c","168a","168b","168c","168d","169a","169c","169d","16ad","177a","177b","178a","178b","178c","179a","179b","179c","179d","17ac","17ad","188a","188b","188c","189b","189c","189d","18ab","18ac","18ad","18bc","18bd","199c","19ac","19ad","19bb","19bc","19bd","19cc","1abc","1acc","1acd","1bbd","1bcc","1bcd","1bdd","1ccd","222a","222b","222c","222d","223a","223b","223c","223d","224a","224b","224c","224d","225a","225b","225c","226a","226b","226c","226d","227c","227d","228a","228c","229a","229b","229c","22aa","22ab","22bd","22cc","233a","233b","233c","233d","234a","234b","234c","234d","235a","235b","235d","236a","236c","236d","237a","237b","237c","237d","238a","238b","238c","238d","239a","239c","239d","23aa","23ac","23ad","23bb","23bc","23bd","23cc","23cd","23dd","244a","244c","245a","245b","245c","245d","246a","246b","246c","246d","247a","247b","247c","248a","248b","248c","249a","249c","249d","24ab","24ac","24ad","24bb","24bc","24cc","24dd","255b","255c","255d","256a","256b","256c","256d","257a","257b","257d","258a","258b","258c","258d","259a","259b","259c","25ab","25ac","25ad","25bc","25cc","25cd","266a","266c","267a","267b","267c","267d","268a","268b","268c","268d","269a","269b","269c","26aa","26ab","26ac","26ad","26bd","26cc","277b","277c","278b","278c","278d","279a","279b","279d","27aa","27ab","27bc","27cc","27cd","288a","288c","288d","289a","289b","289c","289d","28aa","28ab","28ac","28ad","28bc","28cc","28cd","299c","29ab","29ac","29ad","29bb","29bd","29cd","2aac","2aad","2abb","2abc","2abd","2acd","2bbc","2bbd","2bcc","2bcd","2bdd","2ccc","2ccd","2cdd","333a","333b","333c","334b","334c","334d","335a","335c","335d","336a","336b","336c","336d","337b","337c","337d","338a","338c","338d","339a","339c","339d","33bc","33bd","33cc","33cd","344a","344b","344d","345a","345b","345c","345d","346a","346b","346c","347a","347b","348a","348b","348c","349b","349c","349d","34aa","34ac","34ad","34bc","34bd","34cc","34cd","355b","356a","356b","356c","356d","357a","357b","357c","358b","358c","358d","359a","359c","359d","35ab","35ac","35ad","35bb","35cc","35cd","35dd","366a","366c","366d","367c","367d","368a","368c","368d","369a","369b","369c","369d","36ab","36ac","36bc","36bd","36cc","36cd","377a","377d","378b","378c","378d","379a","379b","379c","379d","37aa","37ab","37ad","37bc","37cc","37cd","388b","389a","389b","389c","389d","38aa","38ab","38bb","38bc","38cc","38cd","38dd","399a","399b","399c","399d","39ab","39ac","39ad","39bc","39bd","39cd","3aac","3abc","3abd","3bcc","3ccd","444a","444b","444c","445a","445b","445c","445d","446a","446b","446c","446d","447a","447c","447d","448a","448b","448c","448d","449b","449c","44ac","44ad","44bd","44cc","44cd","455a","456a","456d","457a","457b","457c","457d","458b","458c","458d","459a","459c","459d","45ab","45ad","45bb","45bc","45bd","45cc","45cd","466c","467a","468a","468c","468d","469a","469c","469d","46aa","46ab","46ac","46bb","46bc","46cc","46cd","46dd","477b","478b","478c","478d","479a","479b","479c","479d","47ab","47ac","47bc","47bd","47cc","47cd","488a","488c","489a","489b","489c","489d","48aa","48ab","48ac","48bc","48bd","48cd","499a","499c","49ab","49ad","49bb","49bc","49cc","4aab","4aac","4abd","4acc","4acd","4bcd","4ccc","556b","558b","558c","558d","559a","559b","55ab","55bc","55bd","55cc","55cd","566a","566c","567c","567d","568a","569a","569c","569d","56ab","56ad","56bc","56bd","56cc","56cd","577a","578a","579a","579b","579d","57ab","57ac","57ad","57bb","57bd","57cc","57dd","588a","588d","589b","589c","589d","58ab","58ac","58bc","58bd","58cc","599b","599c","59aa","59ab","59ad","59bd","59cc","59cd","5acd","5add","666a","666b","667a","667b","667c","668a","668b","668c","668d","669a","669b","669c","669d","66ac","66ad","66bd","66cc","677a","677b","678a","678b","679c","67aa","67ac","67ad","67bb","67bc","67bd","67cc","67cd","688a","688b","688c","689a","689c","689d","68ab","68ac","68ad","68bb","68bd","68cc","68dd","699b","699c","69ab","69ac","69bc","69bd","69cc","69cd","6aaa","6aad","6acc","6bcd","778b","779a","77bc","77bd","77cc","77cd","788a","788b","788c","789d","78aa","78ad","78bc","78bd","78cc","78cd","799d","79ab","79ac","79bb","79bc","79cc","79dd","7aab","7aac","7abd","7acc","888a","888b","888c","888d","889b","889c","889d","88ac","88ad","88bd","88cc","89ad","89bb","89bc","89bd","89cc","89cd","8aac","8abb","8acc","8add","8bcc","99bc","99bd","99cc","99cd","9aad","9abc","9abd","9acc","9acd","9bbb","9bcc","9bdd","9ccc","aabd","aacc","abbc","abbd","abcc","abcd","accc","accd","acdd","bbbd","bbcc","bbcd","bccc","bccd","bcdd","bddd","cccc","cccd","ccdd"],"hard":["1168","1277","1379","137c","1389","138a","1399","155c","15ab","15ac","15ad","15bb","15bc","15cc","16ac","16bc","16bd","16cc","16cd","177c","17cc","17cd","17dd","1aac","1bbc","1ccc","1cdd","227a","22ad","22bc","22cd","236b","244b","244d","248d","2558","2569","25aa","266b","266d","26bc","26cd","277d","27ac","288b","28bb","28dd","299b","299d","29aa","29dd","2aab","2bbb","2ddd","3339","3355","3366","339b","33ad","344c","346d","347c","348d","3559","355c","357d","35aa","35bc","366b","367a","36aa","36bb","36dd","3779","377c","37bb","37dd","388a","388c","38ac","39aa","39bb","39cc","39dd","3bbc","3ccc","3cdd","4445","44aa","44bc","4557","4558","456b","456c","4588","458a","4599","45aa","45ac","45dd","466a","4679","467c","4777","478a","4799","47aa","47bb","47dd","488b","488d","4899","48bb","48cc","48dd","49ac","4abc","5555","555c","557a","5588","558a","5599","55aa","55ad","55bb","55dd","5666","5677","568c","568d","569b","56aa","56ac","56bb","56dd","579c","57aa","5aab","5aac","5aad","5abb","5bcc","666c","6688","66bc","66cd","6789","678c","6899","689b","68bc","699a","6abc","6acd","6bbc","6bcc","6ccc","6ccd","6cdd","777c","77ad","788d","789a","789c","78ab","7acd","7ccd","88bc","88cd","899c","89ac","8acd","999c","99ad","9bcd","aaac","aaad","aabc","aacd","addd","bbbc","cddd"],"expert":["1346","1456","1555","1668","18cc","22bb","22dd","235c","24aa","255a","277a","3377","3388","4477","557b","577b"]};
  function gen24(t, num) {
    const R = seedOf('24', t, num);
    const pool = [H24.easy, H24.medium, H24.hard, H24.hard][t];
    const hands = [];
    for (let i = 0; i < 5; i++) {
      const src = t === 3 && (i === 1 || i === 3) ? H24.expert : pool;
      const h = shuffle(R, src[rint(R, src.length)].split('').map((x) => parseInt(x, 16)));
      hands.push({ nums: h, solution: solve24(h) });
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
  function genKenKen(t, num) {
    const R = seedOf('kk', t, num);
    const n = [4, 5, 6, 6][t];
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
        const size = t === 3 ? (x < 0.04 ? 1 : x < 0.4 ? 2 : x < 0.85 ? 3 : 4) : (x < 0.1 ? 1 : x < 0.6 ? 2 : x < (t === 2 ? 0.9 : 0.95) ? 3 : 4);
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
  function genLinks(t, num) {
    const R = seedOf('lk', t, num);
    const n = [5, 6, 7, 9][t];
    const k = [4, 5, 6, 8][t] + rint(R, 2);
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
  function genPipes(t, num) {
    const R = seedOf('pp', t, num);
    const n = [5, 6, 7, 8][t];
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
  function genPour(t, num) {
    const R = seedOf('pr', t, num);
    const k = [4, 6, 8, 10][t] + rint(R, 2);
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
  function genFlood(t, num) {
    const R = seedOf('fl', t, num);
    const n = [10, 12, 14, 16][t], colors = [5, 6, 6, 7][t];
    const g = Array.from({ length: n * n }, () => rint(R, colors));
    return { n, colors, grid: g, target: floodGreedy(g, n, colors), tier: t };
  }


  // ---------- ONE LINE (draw the figure in one stroke) ----------
  function genOneLine(t, num) {
    const R = seedOf('ol', t, num);
    const [W, Hh] = [[3, 3], [4, 4], [4, 5], [5, 5]][t];
    const [lo, hi] = [[7, 9], [11, 14], [16, 19], [21, 26]][t];
    const id = (x, y) => y * W + x;
    for (let attempt = 0; attempt < 2000; attempt++) {
      const target = lo + rint(R, hi - lo + 1);
      const edges = new Set();
      const ek = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
      let cur = id(rint(R, W), rint(R, Hh));
      const trail = [cur];
      let guard = 0;
      while (edges.size < target && guard++ < 400) {
        const x = cur % W, y = Math.floor(cur / W);
        const opts = [];
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= Hh) continue;
          const nb = id(nx, ny);
          if (edges.has(ek(cur, nb))) continue;
          if (dx && dy && edges.has(ek(id(x + dx, y), id(x, y + dy)))) continue; // no crossing diagonals
          opts.push(nb);
        }
        if (!opts.length) break;
        const nb = opts[rint(R, opts.length)];
        edges.add(ek(cur, nb)); cur = nb; trail.push(cur);
      }
      if (edges.size < lo) continue;
      const deg = new Map();
      for (const e of edges) for (const v of e.split('-').map(Number)) deg.set(v, (deg.get(v) || 0) + 1);
      const branchy = [...deg.values()].filter((d) => d >= 3).length;
      if (branchy < [1, 2, 3, 4][t]) continue;
      const odd = [...deg.entries()].filter(([, d]) => d % 2).map(([v]) => v);
      return { W, H: Hh, edges: [...edges].map((e) => e.split('-').map(Number)), nodes: [...deg.keys()], odd, trail, tier: t };
    }
  }

  // ---------- TANGO (suns & moons) ----------
  // values 0 = sun, 1 = moon. rows/cols: three of each, never three in a line. '=' same, '×' opposite.
  function tangoCount(n, givens, signs, limit = 2) {
    const g = new Array(n * n).fill(-1);
    const sg = new Map(); // cell -> [[other, type]]
    for (const [a, b, ty] of signs) { (sg.get(a) || sg.set(a, []).get(a)).push([b, ty]); (sg.get(b) || sg.set(b, []).get(b)).push([a, ty]); }
    let count = 0;
    const half = n / 2;
    const ok = (i) => {
      const r = Math.floor(i / n), c = i % n, v = g[i];
      if (c >= 2 && g[i - 1] === v && g[i - 2] === v) return false;
      if (r >= 2 && g[i - n] === v && g[i - 2 * n] === v) return false;
      let rc = 0, cc = 0; for (let k = 0; k < n; k++) { if (g[r * n + k] === v) rc++; if (g[k * n + c] === v) cc++; }
      if (rc > half || cc > half) return false;
      for (const [o, ty] of sg.get(i) || []) if (g[o] >= 0 && (ty === '=' ? g[o] !== v : g[o] === v)) return false;
      return true;
    };
    (function rec(i) {
      if (count >= limit) return;
      if (i === n * n) { count++; return; }
      for (const v of givens[i] >= 0 ? [givens[i]] : [0, 1]) {
        g[i] = v;
        if (ok(i)) rec(i + 1);
        g[i] = -1;
        if (count >= limit) return;
      }
    })(0);
    return count;
  }
  function genTango(t, num) {
    const R = seedOf('tg', t, num);
    const n = 6;
    // random valid solution
    const sol = new Array(n * n).fill(-1);
    const none = new Array(n * n).fill(-1);
    (function fill(i) {
      if (i === n * n) return true;
      for (const v of shuffle(R, [0, 1])) { sol[i] = v; if (tangoCountPartialOk(sol, n, i) && fill(i + 1)) return true; }
      sol[i] = -1; return false;
    })(0);
    const pool = [];
    for (let i = 0; i < n * n; i++) pool.push(['g', i]);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (c < n - 1) pool.push(['s', i, i + 1]);
      if (r < n - 1) pool.push(['s', i, i + n]);
    }
    const build = (set) => {
      const giv = new Array(n * n).fill(-1), signs = [];
      for (const cl of set) { if (cl[0] === 'g') giv[cl[1]] = sol[cl[1]]; else signs.push([cl[1], cl[2], sol[cl[1]] === sol[cl[2]] ? '=' : '×']); }
      return [giv, signs];
    };
    const signBias = [0.3, 0.45, 0.55, 0.65][t];
    const order = shuffle(R, pool.slice()).sort((a, b) => (a[0] === 's' ? signBias : 1 - signBias) * R() - (b[0] === 's' ? signBias : 1 - signBias) * R());
    let set = [];
    for (const cl of order) { set.push(cl); if (set.length >= 6 && tangoCount(n, ...build(set)) === 1) break; }
    // minimise
    for (const cl of shuffle(R, set.slice())) {
      const trial = set.filter((x) => x !== cl);
      if (tangoCount(n, ...build(trial)) === 1) set = trial;
    }
    // easier tiers keep extra givens
    const extra = [7, 4, 1, 0][t];
    const rest = shuffle(R, pool.filter((cl) => cl[0] === 'g' && !set.includes(cl)));
    set = set.concat(rest.slice(0, extra));
    const [givens, signs] = build(set);
    return { n, givens, signs, solution: sol, tier: t };
  }
  function tangoCountPartialOk(g, n, i) {
    const r = Math.floor(i / n), c = i % n, v = g[i];
    if (c >= 2 && g[i - 1] === v && g[i - 2] === v) return false;
    if (r >= 2 && g[i - n] === v && g[i - 2 * n] === v) return false;
    let rc = 0, cc = 0; for (let k = 0; k < n; k++) { if (g[r * n + k] === v) rc++; if (g[k * n + c] === v) cc++; }
    return rc <= n / 2 && cc <= n / 2;
  }
  function tangoCheck(n, g) { // -> {bad:Set, full}
    const bad = new Set(); let full = true;
    for (let i = 0; i < n * n; i++) if (g[i] < 0) full = false;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = r * n + c, v = g[i]; if (v < 0) continue;
      if (c >= 2 && g[i - 1] === v && g[i - 2] === v) [i, i - 1, i - 2].forEach((x) => bad.add(x));
      if (r >= 2 && g[i - n] === v && g[i - 2 * n] === v) [i, i - n, i - 2 * n].forEach((x) => bad.add(x));
    }
    for (let k = 0; k < n; k++) for (const v of [0, 1]) {
      const row = [], col = [];
      for (let j = 0; j < n; j++) { if (g[k * n + j] === v) row.push(k * n + j); if (g[j * n + k] === v) col.push(j * n + k); }
      if (row.length > n / 2) row.forEach((x) => bad.add(x));
      if (col.length > n / 2) col.forEach((x) => bad.add(x));
    }
    return { bad, full };
  }

  // ---------- HUE (restore the gradient) ----------
  function genHue(t, num) {
    const R = seedOf('hu', t, num);
    const [W, Hh] = [[5, 6], [5, 7], [6, 8], [7, 9]][t];
    const h0 = R() * 360;
    const hsl = (h, s, l) => { h = ((h % 360) + 360) % 360 / 360; const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)].map((x) => Math.round(x * 255)); };
    const spread = [110, 95, 80, 70][t];
    const corners = [hsl(h0, 0.85, 0.72), hsl(h0 + spread, 0.8, 0.55), hsl(h0 - spread, 0.75, 0.45), hsl(h0 + 180, 0.8, 0.3)];
    const colors = [];
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const u = x / (W - 1), v = y / (Hh - 1);
      colors.push([0, 1, 2].map((k) => Math.round(corners[0][k] * (1 - u) * (1 - v) + corners[1][k] * u * (1 - v) + corners[2][k] * (1 - u) * v + corners[3][k] * u * v)));
    }
    const fixed = new Array(W * Hh).fill(false);
    const corner = (i) => [0, W - 1, W * (Hh - 1), W * Hh - 1].includes(i);
    for (let i = 0; i < W * Hh; i++) {
      const x = i % W, y = Math.floor(i / W), border = x === 0 || y === 0 || x === W - 1 || y === Hh - 1;
      if (corner(i)) fixed[i] = true;
      else if (t === 0 && border) fixed[i] = true;
      else if (t === 1 && border && (x + y) % 2 === 0) fixed[i] = true;
      else if (t === 2 && border && (x + y) % 3 === 0) fixed[i] = true;
    }
    const movable = [...Array(W * Hh).keys()].filter((i) => !fixed[i]);
    const perm = shuffle(R, movable.slice());
    // board[pos] = tile id (tile id = home position)
    const board = [...Array(W * Hh).keys()];
    movable.forEach((pos, k) => (board[pos] = perm[k]));
    // par = movable - cycles
    const seen = new Set(); let cycles = 0;
    for (const p of movable) { if (seen.has(p)) continue; cycles++; let q = p; while (!seen.has(q)) { seen.add(q); q = board[q]; } }
    const misplaced = movable.filter((p) => board[p] !== p).length;
    return { W, H: Hh, colors: colors.map((c) => `rgb(${c[0]},${c[1]},${c[2]})`), fixed, board, par: movable.length - cycles, misplaced, tier: t };
  }

  // ---------- shared: random Hamiltonian path on an n×n grid (backbite moves) ----------
  function hamPath(R, n, iters) {
    let path = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) path.push(r * n + (r % 2 ? n - 1 - c : c));
    for (let it = 0; it < (iters || n * n * 30); it++) {
      if (R() < 0.5) path.reverse();
      const e = path[0], r = Math.floor(e / n), c = e % n;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dr, dc]) => [r + dr, c + dc]).filter(([rr, cc]) => rr >= 0 && cc >= 0 && rr < n && cc < n).map(([rr, cc]) => rr * n + cc);
      const x = nb[rint(R, nb.length)], i = path.indexOf(x);
      if (i >= 2) path = path.slice(0, i).reverse().concat(path.slice(i));
    }
    return path;
  }

  // ---------- ZIP (one path through every cell, numbers in order) ----------
  function genZip(t, num) {
    const R = seedOf('zp', t, num);
    const n = [5, 6, 7, 8][t];
    const path = hamPath(R, n);
    const L = n * n, K = [9, 9, 9, 10][t] + rint(R, 2);
    // spread checkpoints along the path with some jitter
    const idx = new Set([0, L - 1]);
    for (let k = 1; k < K - 1; k++) { const base = Math.round(k * (L - 1) / (K - 1)); idx.add(Math.max(1, Math.min(L - 2, base + rint(R, 3) - 1))); }
    const order = [...idx].sort((a, b) => a - b);
    const numbers = new Map(order.map((pi, k) => [path[pi], k + 1]));
    return { n, numbers: [...numbers.entries()], count: order.length, solution: path, tier: t };
  }

  // ---------- BRIDGES (Hashi) ----------
  function genBridges(t, num) {
    const R = seedOf('hb', t, num);
    const n = [7, 8, 9, 10][t], want = [9, 13, 18, 24][t];
    for (let attempt = 0; attempt < 200; attempt++) {
      const isl = [], at = new Map(), occ = new Map(); // occ: cell -> 'h'|'v' bridge passing
      const br = new Map(); // "a-b" -> count
      const key = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
      const add = (x, y) => { at.set(y * n + x, isl.length); isl.push([x, y]); };
      add(rint(R, n), rint(R, n));
      const clearPath = (x1, y1, x2, y2) => {
        const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
        for (let x = x1 + dx, y = y1 + dy; x !== x2 || y !== y2; x += dx, y += dy) { const c = y * n + x; if (at.has(c) || occ.has(c)) return false; }
        return true;
      };
      const lay = (a, b, cnt) => {
        const [x1, y1] = isl[a], [x2, y2] = isl[b], dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
        for (let x = x1 + dx, y = y1 + dy; x !== x2 || y !== y2; x += dx, y += dy) occ.set(y * n + x, dx ? 'h' : 'v');
        br.set(key(a, b), cnt);
      };
      let guard = 0;
      while (isl.length < want && guard++ < 3000) {
        const a = rint(R, isl.length), [x, y] = isl[a];
        const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][rint(R, 4)];
        const d = 2 + rint(R, Math.max(1, Math.floor(n / 2)));
        const nx = x + dx * d, ny = y + dy * d;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const c = ny * n + nx;
        if (at.has(c) || occ.has(c)) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ex, ey]) => at.has((ny + ey) * n + nx + ex) && nx + ex >= 0 && nx + ex < n)) continue;
        if (!clearPath(x, y, nx, ny)) continue;
        add(nx, ny);
        lay(a, isl.length - 1, R() < 0.35 ? 2 : 1);
      }
      if (isl.length < want) continue;
      // extra links between existing neighbours (creates loops -> more interesting)
      for (let a = 0; a < isl.length; a++) for (const [dx, dy] of [[1, 0], [0, 1]]) {
        let [x, y] = isl[a]; x += dx; y += dy;
        while (x < n && y < n && !at.has(y * n + x) && !occ.has(y * n + x)) { x += dx; y += dy; }
        if (x >= n || y >= n || !at.has(y * n + x)) continue;
        const b = at.get(y * n + x);
        if (br.has(key(a, b)) || R() > 0.3) continue;
        lay(a, b, R() < 0.3 ? 2 : 1);
      }
      const need = isl.map(() => 0);
      for (const [k, v] of br) { const [a, b] = k.split('-').map(Number); need[a] += v; need[b] += v; }
      return { n, islands: isl, need, solution: [...br.entries()], tier: t };
    }
  }
  // neighbours of each island (first island straight along each direction)
  function bridgeNeighbours(n, islands) {
    const at = new Map(islands.map(([x, y], i) => [y * n + x, i]));
    return islands.map(([x, y]) => [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => {
      let cx = x + dx, cy = y + dy;
      while (cx >= 0 && cy >= 0 && cx < n && cy < n) { if (at.has(cy * n + cx)) return at.get(cy * n + cx); cx += dx; cy += dy; }
      return -1;
    }));
  }
  function bridgesCross(n, islands, a, b, c, d) {
    const [ax, ay] = islands[a], [bx, by] = islands[b], [cx, cy] = islands[c], [dx, dy] = islands[d];
    const h1 = ay === by, h2 = cy === dy;
    if (h1 === h2) return false;
    const [H, V] = h1 ? [[ax, bx, ay], [cy, dy, cx]] : [[cx, dx, cy], [ay, by, ax]];
    const [hx1, hx2] = [Math.min(H[0], H[1]), Math.max(H[0], H[1])], [vy1, vy2] = [Math.min(V[0], V[1]), Math.max(V[0], V[1])];
    return V[2] > hx1 && V[2] < hx2 && H[2] > vy1 && H[2] < vy2;
  }

  // ---------- NONOGRAM ----------
  function lineClue(cells) { const out = []; let run = 0; for (const v of cells) { if (v === 1) run++; else if (run) { out.push(run); run = 0; } } if (run) out.push(run); return out; }
  // line solver: known: -1 unknown, 0 empty, 1 filled. returns new array or null if contradiction
  function solveLine(clue, known) {
    const L = known.length, canF = new Array(L).fill(false), canE = new Array(L).fill(false);
    let any = false;
    const cur = new Array(L).fill(0);
    const memo = new Map();
    // place(k, pos): can blocks k.. be placed from pos on, consistent?  fills canF/canE via reconstruction
    function ok(k, pos) {
      const mk = k * 64 + pos; if (memo.has(mk)) return memo.get(mk);
      let res = false;
      if (k === clue.length) { res = true; for (let i = pos; i < L; i++) if (known[i] === 1) { res = false; break; } }
      else {
        const len = clue[k];
        for (let s = pos; s + len <= L; s++) {
          if (known[s - 1] === 1 && s - 1 >= pos) break;
          let fits = true;
          for (let i = s; i < s + len; i++) if (known[i] === 0) { fits = false; break; }
          if (fits && s + len < L && known[s + len] === 1) fits = false;
          if (fits && ok(k + 1, s + len + 1)) { res = true; break; }
          if (known[s] === 1) break;
        }
      }
      memo.set(mk, res); return res;
    }
    function mark(k, pos) {
      const mk = 100000 + k * 64 + pos; if (memo.has(mk)) return; memo.set(mk, true);
      if (k === clue.length) { for (let i = pos; i < L; i++) canE[i] = true; any = true; return; }
      const len = clue[k];
      for (let s = pos; s + len <= L; s++) {
        if (known[s - 1] === 1 && s - 1 >= pos) break;
        let fits = true;
        for (let i = s; i < s + len; i++) if (known[i] === 0) { fits = false; break; }
        if (fits && s + len < L && known[s + len] === 1) fits = false;
        if (fits && ok(k + 1, s + len + 1)) {
          for (let i = pos; i < s; i++) canE[i] = true;
          for (let i = s; i < s + len; i++) canF[i] = true;
          if (s + len < L) canE[s + len] = true;
          mark(k + 1, s + len + 1);
        }
        if (known[s] === 1) break;
      }
    }
    if (!ok(0, 0)) return null;
    mark(0, 0);
    return known.map((v, i) => (v !== -1 ? v : canF[i] && !canE[i] ? 1 : canE[i] && !canF[i] ? 0 : -1));
  }
  function nonogramSolvable(W, H, rows, cols) {
    const g = new Array(W * H).fill(-1);
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < H; r++) {
        const line = g.slice(r * W, r * W + W), res = solveLine(rows[r], line);
        if (!res) return false;
        res.forEach((v, c) => { if (v !== line[c]) { g[r * W + c] = v; changed = true; } });
      }
      for (let c = 0; c < W; c++) {
        const line = []; for (let r = 0; r < H; r++) line.push(g[r * W + c]);
        const res = solveLine(cols[c], line);
        if (!res) return false;
        res.forEach((v, r) => { if (v !== line[r]) { g[r * W + c] = v; changed = true; } });
      }
    }
    return g.every((v) => v !== -1);
  }
  function genNonogram(t, num) {
    const R = seedOf('ng', t, num);
    const W = [5, 8, 10, 12][t], H = W;
    for (let attempt = 0; attempt < 400; attempt++) {
      // blobby picture: random seeds smoothed once, so it looks like shapes rather than noise
      let g = Array.from({ length: W * H }, () => (R() < [0.62, 0.58, 0.55, 0.52][t] ? 1 : 0));
      if (t > 0) g = g.map((v, i) => { const r = Math.floor(i / W), c = i % W; let s = 0, k = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < H && cc < W) { s += g[rr * W + cc]; k++; } } return s * 2 > k ? 1 : s * 2 === k ? v : 0; });
      const filled = g.filter(Boolean).length;
      if (filled < W * H * 0.35 || filled > W * H * 0.75) continue;
      const rows = [], cols = [];
      for (let r = 0; r < H; r++) rows.push(lineClue(g.slice(r * W, r * W + W)));
      for (let c = 0; c < W; c++) { const col = []; for (let r = 0; r < H; r++) col.push(g[r * W + c]); cols.push(lineClue(col)); }
      if (!nonogramSolvable(W, H, rows, cols)) continue;
      return { W, H, rows, cols, solution: g, tier: t };
    }
  }

  // ---------- SHIKAKU ----------
  function shikakuCount(W, H, clues, limit = 2) {
    // clues: [[cell, area]]; candidates per clue: rectangles of that area containing only that clue
    const clueAt = new Map(clues.map(([c, a], k) => [c, k]));
    const cands = clues.map(([cell, area]) => {
      const cx = cell % W, cy = Math.floor(cell / W), out = [];
      for (let w = 1; w <= area; w++) {
        if (area % w) continue; const h = area / w;
        if (w > W || h > H) continue;
        for (let x0 = cx - w + 1; x0 <= cx; x0++) for (let y0 = cy - h + 1; y0 <= cy; y0++) {
          if (x0 < 0 || y0 < 0 || x0 + w > W || y0 + h > H) continue;
          const cells = []; let bad = false;
          for (let y = y0; y < y0 + h && !bad; y++) for (let x = x0; x < x0 + w; x++) { const c = y * W + x; if (c !== cell && clueAt.has(c)) { bad = true; break; } cells.push(c); }
          if (!bad) out.push(cells);
        }
      }
      return out;
    });
    const cover = new Int8Array(W * H);
    let count = 0;
    const done = new Array(clues.length).fill(false);
    (function rec(placed) {
      if (count >= limit) return;
      if (placed === clues.length) { if (cover.every((v) => v)) count++; return; }
      // most constrained clue first
      let best = -1, bestOpts = null;
      for (let k = 0; k < clues.length; k++) {
        if (done[k]) continue;
        const opts = cands[k].filter((cs) => cs.every((c) => !cover[c]));
        if (!opts.length) return;
        if (!bestOpts || opts.length < bestOpts.length) { best = k; bestOpts = opts; }
      }
      done[best] = true;
      for (const cs of bestOpts) { cs.forEach((c) => (cover[c] = 1)); rec(placed + 1); cs.forEach((c) => (cover[c] = 0)); if (count >= limit) break; }
      done[best] = false;
    })(0);
    return count;
  }
  function genShikaku(t, num) {
    const R = seedOf('sk', t, num);
    const [W, H] = [[5, 5], [6, 7], [8, 9], [9, 11]][t];
    const maxA = [6, 8, 10, 12][t];
    for (let attempt = 0; attempt < 600; attempt++) {
      const owner = new Int16Array(W * H).fill(-1), rects = [];
      let ok = true;
      for (let i = 0; i < W * H && ok; i++) {
        if (owner[i] >= 0) continue;
        const x0 = i % W, y0 = Math.floor(i / W);
        let maxW = 0; while (x0 + maxW < W && owner[y0 * W + x0 + maxW] < 0) maxW++;
        const opts = [];
        for (let w = 1; w <= maxW; w++) for (let h = 1; y0 + h <= H; h++) {
          let free = true; for (let x = x0; x < x0 + w; x++) if (owner[(y0 + h - 1) * W + x] >= 0) { free = false; break; }
          if (!free) break;
          const a = w * h; if (a > maxA) break;
          if (a >= 2 || R() < 0.15) opts.push([w, h]);
        }
        if (!opts.length) { ok = false; break; }
        const [w, h] = opts[rint(R, opts.length)];
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) owner[y * W + x] = rects.length;
        rects.push([x0, y0, w, h]);
      }
      if (!ok) continue;
      const clues = rects.map(([x, y, w, h]) => [(y + rint(R, h)) * W + x + rint(R, w), w * h]);
      if (shikakuCount(W, H, clues, 2) !== 1) continue;
      return { W, H, clues, solution: rects, tier: t };
    }
  }

  // ---------- MINESWEEPER (no guessing) ----------
  function msNeighbours(W, H, i) { const x = i % W, y = Math.floor(i / W), out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) out.push(ny * W + nx); } return out; }
  function msReveal(W, H, mines, counts, open, i) { const st = [i]; while (st.length) { const c = st.pop(); if (open[c] || mines[c]) continue; open[c] = 1; if (counts[c] === 0) for (const nb of msNeighbours(W, H, c)) if (!open[nb]) st.push(nb); } }
  function msSolvable(W, H, mines, counts, start) {
    const N = W * H, open = new Uint8Array(N), flag = new Uint8Array(N), total = mines.reduce((a, b) => a + b, 0);
    msReveal(W, H, mines, counts, open, start);
    let progress = true;
    while (progress) {
      progress = false;
      const cons = [];
      for (let i = 0; i < N; i++) {
        if (!open[i] || !counts[i]) continue;
        const nb = msNeighbours(W, H, i), unk = nb.filter((c) => !open[c] && !flag[c]), f = nb.filter((c) => flag[c]).length;
        if (!unk.length) continue;
        const need = counts[i] - f;
        if (need === 0) { unk.forEach((c) => msReveal(W, H, mines, counts, open, c)); progress = true; }
        else if (need === unk.length) { unk.forEach((c) => (flag[c] = 1)); progress = true; }
        else cons.push([unk, need]);
      }
      if (progress) continue;
      // subset rule
      for (let a = 0; a < cons.length && !progress; a++) for (let b = 0; b < cons.length && !progress; b++) {
        if (a === b) continue;
        const [ua, na] = cons[a], [ub, nb] = cons[b];
        if (ua.length >= ub.length || !ua.every((c) => ub.includes(c))) continue;
        const rest = ub.filter((c) => !ua.includes(c)), d = nb - na;
        if (d === 0) { rest.forEach((c) => msReveal(W, H, mines, counts, open, c)); progress = true; }
        else if (d === rest.length) { rest.forEach((c) => (flag[c] = 1)); progress = true; }
      }
      if (progress) continue;
      // global count
      const unknown = []; for (let i = 0; i < N; i++) if (!open[i] && !flag[i]) unknown.push(i);
      const left = total - flag.reduce((a, b) => a + b, 0);
      if (unknown.length && left === 0) { unknown.forEach((c) => msReveal(W, H, mines, counts, open, c)); progress = true; }
      else if (unknown.length && left === unknown.length) { unknown.forEach((c) => (flag[c] = 1)); progress = true; }
    }
    for (let i = 0; i < N; i++) if (!mines[i] && !open[i]) return false;
    return true;
  }
  function genMines(t, num) {
    const R = seedOf('ms', t, num);
    const [W, H, M] = [[8, 9, 10], [9, 11, 18], [10, 13, 26], [11, 15, 36]][t];
    for (let attempt = 0; attempt < 3000; attempt++) {
      const start = rint(R, W * H);
      const safe = new Set([start, ...msNeighbours(W, H, start)]);
      const pool = shuffle(R, [...Array(W * H).keys()].filter((c) => !safe.has(c)));
      const mines = new Uint8Array(W * H); pool.slice(0, M).forEach((c) => (mines[c] = 1));
      const counts = [...Array(W * H).keys()].map((i) => msNeighbours(W, H, i).filter((c) => mines[c]).length);
      if (!msSolvable(W, H, mines, counts, start)) continue;
      return { W, H, M, mines: [...mines], counts, start, tier: t };
    }
  }

  // ---------- UNBLOCK (bank lookup) ----------
  function getUnblock(bank, t, num) {
    const list = bank[t];
    const [par, enc] = list[(num - 1) % list.length].split(':');
    const vehicles = [];
    for (let k = 0; k < enc.length; k += 4) vehicles.push({ r: +enc[k], c: +enc[k + 1], len: +enc[k + 2], h: enc[k + 3] === 'h' });
    return { par: +par, vehicles, tier: t, bankSize: list.length };
  }

  return { rng, hashStr, TIER_NAMES, seedOf, genZip, genBridges, bridgeNeighbours, bridgesCross, genNonogram, lineClue, nonogramSolvable, genShikaku, shikakuCount, genMines, msNeighbours, genOneLine, genTango, tangoCount, tangoCheck, genHue, getUnblock, loToggle, genLightsOut, ubSolve, genQueens, queensCount, gen24, solve24, fr, fop, genKenKen, cageOk,
    genLinks, genPipes, pipesConnected, rotCW, genPour, pourOK, pourSolved, pourSolve, CAP, genFlood, floodRegion, floodApply };
})();
if (typeof module !== 'undefined') module.exports = Core;
