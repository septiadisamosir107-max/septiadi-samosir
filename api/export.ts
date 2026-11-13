
import { authorized, json } from "../lib/auth.js";
import { get, llen, lrange } from "../lib/store.js";

const KEYS = ["calls", "signals", "orders", "trades", "equity", "equity_ticks", "errors", "events", "snapshots"];

// Ekspor log mentah (dipakai scripts/export-logs.ts). Dilindungi CRON_SECRET. Tidak mengubah aturan bot.
export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);
  const u = new URL(req.url);
  const key = u.searchParams.get("key") ?? "";
  if (key === "state") return json({ key, item: await get("state") });
  if (!KEYS.includes(key)) return json({ error: "key tidak dikenal", keys: [...KEYS, "state"] }, 400);
  const start = Math.max(0, Number(u.searchParams.get("start") ?? 0));
  const count = Math.min(500, Math.max(1, Number(u.searchParams.get("count") ?? 500)));
  const total = await llen(key);
  const items = await lrange(key, start, start + count - 1);
  return json({ key, total, start, items });
}
