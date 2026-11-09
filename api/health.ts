import { authorized, json } from "../lib/auth.js";
import { getClosedCandles, getDepth, getJson, getServerTime } from "../lib/indodax.js";
import { llen } from "../lib/store.js";

async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: boolean; data?: T; error?: string }> {
  try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: String(e) }; }
}

// Uji koneksi: apakah Indodax & storage bisa diakses dari fungsi Vercel? Laporkan ke dosen bila gagal sebelum freeze.
export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);
  const st = await attempt(getServerTime);
  const now = st.ok ? st.data! : Math.floor(Date.now() / 1000);
  const depth = await attempt(async () => { const b = await getDepth("btcidr"); return { bid: b.bids[0], ask: b.asks[0] }; });
  const candles = await attempt(async () => {
    const c = await getClosedCandles("BTCIDR", "60", now - 6 * 3600, now, now);
    return { n: c.length, last: c[c.length - 1] };
  });
  const pairs = await attempt(async () => {
    const all = await getJson<any[]>("/api/pairs");
    const want = (process.env.PAIRS ?? "btcidr").split(",").map((s) => s.trim());
    return all
      .filter((p) => want.some((w) => JSON.stringify(p).toLowerCase().includes(`"${w}"`)))
      .map((p) => ({ id: p.id ?? p.ticker_id, taker: p.trade_fee_percent_taker, minBase: p.trade_min_base_currency, raw: p }));
  });
  const storage = await attempt(() => llen("snapshots"));
  return json({ serverTime: st, depth, candles, pairs, storage, killSwitch: process.env.KILL_SWITCH ?? "0" });
}
