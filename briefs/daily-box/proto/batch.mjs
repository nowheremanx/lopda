import { generate } from "./gen.mjs";
const N = +process.argv[2] || 30, nb = +process.argv[3] || 3, K = +process.argv[4] || 30;
// solve() and show() aren't exported; re-import via dynamic eval of module
const m = await import("./gen.mjs");
const res = []; const t0 = performance.now();
for (let s = 1; s <= N; s++) {
  let best = null;
  for (let k = 0; k < K; k++) {
    const L = generate(s * 100003 + k, nb);
    const gs = new Set(L.goals); if (L.bl.some(x => gs.has(x))) continue;
    const v = m.solve(L.g, L.goals, L.bl, L.p);
    const score = v.pushes + 2 * v.lines + Math.log2(v.explored + 1);
    if (!best || score > best.score) best = { ...L, ...v, score };
  }
  res.push(best);
}
const ms = (performance.now() - t0) / N;
const q = a => { a = a.slice().sort((x, y) => x - y); return [a[0], a[a.length >> 2], a[a.length >> 1], a[(a.length * 3) >> 2], a.at(-1)].join(" / "); };
console.log(`boxes=${nb} K=${K} N=${N}  ms/level=${ms.toFixed(0)}`);
console.log("pushes  min/q1/med/q3/max", q(res.map(r => r.pushes)));
console.log("lines   ", q(res.map(r => r.lines)));
console.log("explored", q(res.map(r => r.explored)));
if (process.env.SHOW) for (const r of res.slice(0, +process.env.SHOW)) console.log(m.show(r.g, r.goals, r.bl, r.p), `pushes ${r.pushes} lines ${r.lines} explored ${r.explored}`);
