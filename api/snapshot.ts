import { authorized, json } from "../lib/auth.js";
import { getDepth, sleep } from "../lib/indodax.js";
import { rpush } from "../lib/store.js";

const PAIRS = (process.env.PAIRS ?? "btcidr,ethidr,solidr,xrpidr,dogeidr,bnbidr,adaidr,trxidr")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// Dipanggil penjadwal luar (GitHub Actions). Menyimpan snapshot mentah order book untuk estimasi spread & slippage.
export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);
  const startedAt = new Date().toISOString();
  const errors: { pair: string; error: string }[] = [];
  let ok = 0;
  for (const pair of PAIRS) {
    try {
      const { bids, asks } = await getDepth(pair);
      if (!bids.length || !asks.length) { errors.push({ pair, error: "order book kosong" }); continue; }
      const bid = bids[0][0], ask = asks[0][0];
      await rpush("snapshots", {
        ts: new Date().toISOString(), pair, bid, ask,
        spreadPct: ((ask - bid) / ((ask + bid) / 2)) * 100, // relatif terhadap mid
        bids: bids.slice(0, 10), asks: asks.slice(0, 10),
      });
      ok++;
    } catch (e) {
      errors.push({ pair, error: String(e) });
    }
    await sleep(400);
  }
  await rpush("calls", { ts: startedAt, endpoint: "snapshot", ok, errors });
  return json({ ok, total: PAIRS.length, errors });
}
