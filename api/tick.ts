import { authorized, json } from "../lib/auth.js";
import { Book, Level, getClosedCandles, getDepth, getServerTime, sleep, validateMarket } from "../lib/indodax.js";
import type { Candle } from "../lib/indodax.js";
import { computeSignals } from "../lib/signal.js";
import { CFG } from "../lib/config.js";
import { del, get, rpush, set, setnx } from "../lib/store.js";

type Pos = { qty: number; entryTs: string; entryFill: number; entryFee: number };
type State = { cash: number; pos: Record<string, Pos>; last: Record<string, number>; day: { key: number; startEquity: number; blocked: boolean }; startedAt: string };

function walkBuy(asks: Level[], budget: number) {
  let spent = 0, qty = 0;
  for (const [p, q] of asks) {
    const take = Math.min(q, (budget - spent) / p);
    if (take <= 0) break;
    qty += take; spent += take * p;
  }
  const avg = qty > 0 ? spent / qty : 0;
  const q8 = Math.floor(qty * 1e8) / 1e8;
  return { qty: q8, avg };
}
function walkSell(bids: Level[], want: number) {
  let left = want, got = 0;
  for (const [p, q] of bids) {
    const take = Math.min(q, left);
    if (take <= 0) break;
    got += take * p; left -= take;
  }
  const qty = want - left;
  return { qty, avg: qty > 0 ? got / qty : 0 };
}

export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);
  const t0 = new Date().toISOString();
  if (!(await setnx("lock:tick", 120))) {
    await rpush("calls", { ts: t0, endpoint: "tick", skipped: "tick lain sedang berjalan" });
    return json({ skipped: "tick lain sedang berjalan" });
  }
  const log: any = { ts: t0, endpoint: "tick", notes: [] as string[], errors: [] as any[], processed: 0 };
  let st: State | undefined;
  try {
    const now = await getServerTime();
    log.serverTime = now;
    const killed = process.env.KILL_SWITCH === "1" || (await get<number>("killswitch")) === 1;
    if (killed) { log.notes.push("kill_switch_active"); await rpush("events", { ts: t0, type: "kill_switch_active" }); }
    const feeRate = CFG.takerFeePct == null ? null : CFG.takerFeePct / 100;
    if (feeRate == null) log.notes.push("takerFeePct belum diisi: tidak membuka posisi");

    st = (await get<State>("state")) ?? {
      cash: CFG.initialCapital, pos: {}, last: {}, startedAt: t0,
      day: { key: -1, startEquity: CFG.initialCapital, blocked: false },
    };

    // 1) Ambil data (retry terbatas ada di getJson). Error satu pasangan tidak menghentikan yang lain.
    const books: Record<string, Book> = {};
    const candles: Record<string, Candle[]> = {};
    for (const pair of CFG.pairs) {
      try {
        books[pair] = await getDepth(pair); await sleep(300);
        candles[pair] = await getClosedCandles(pair.toUpperCase(), CFG.tf, now - CFG.historyBars * CFG.tfSec, now, now); await sleep(300);
        const b = books[pair];
        if (b.bids.length && b.asks.length) {
          await rpush("snapshots", { ts: t0, pair, bid: b.bids[0][0], ask: b.asks[0][0],
            spreadPct: ((b.asks[0][0] - b.bids[0][0]) / ((b.asks[0][0] + b.bids[0][0]) / 2)) * 100,
            bids: b.bids.slice(0, 10), asks: b.asks.slice(0, 10) });
        }
      } catch (e) {
        log.errors.push({ pair, error: String(e) });
        await rpush("errors", { ts: t0, pair, error: String(e) });
      }
    }

    // 2) Ekuitas: posisi dinilai pada best bid.
    const equity = () => {
      let e = st!.cash;
      for (const [p, x] of Object.entries(st!.pos)) e += x.qty * (books[p]?.bids[0]?.[0] ?? x.entryFill);
      return e;
    };
    const dayKey = Math.floor((now + 7 * 3600) / 86400); // hari WIB
    if (st.day.key !== dayKey) {
      st.day = { key: dayKey, startEquity: equity(), blocked: false };
      await rpush("equity", { ts: t0, dayKey, equity: st.day.startEquity });
    }
    if (!st.day.blocked && equity() < st.day.startEquity * (1 - CFG.dailyLossLimitPct / 100)) {
      st.day.blocked = true;
      await rpush("events", { ts: t0, type: "daily_loss_limit", equity: equity(), dayStart: st.day.startEquity });
    }

    // 3) Proses candle tertutup yang belum diproses; idempotent per (pair, candle).
    for (const pair of CFG.pairs) {
      const cs = candles[pair], book = books[pair];
      if (!cs?.length || !book) continue;
      const sigs = computeSignals(cs, CFG.params);
      const lastT = st.last[pair];
      const idxs = lastT === undefined ? [cs.length - 1] : cs.map((_, i) => i).filter((i) => cs[i].time > lastT).slice(-CFG.maxCatchUp);
      for (const i of idxs) {
        const c = cs[i], s = sigs[i];
        const key = `done:${pair}:${c.time}`;
        if (!(await setnx(key, 30 * 86400))) { log.notes.push(`duplikat dilewati ${pair} ${c.time}`); continue; }
        try {
          const closeT = c.time + CFG.tfSec;
          const reasons = validateMarket(cs.slice(0, i + 1), CFG.tfSec, now, book, CFG.params.maPeriod + 1);
          await rpush("signals", { ts: t0, pair, candleTime: c.time, close: c.close, rsi: s.rsi, ma: s.ma, buy: s.buy, sell: s.sell,
            lateSec: now - closeT, onTime: now <= closeT + CFG.tfSec, invalid: reasons });
          if (reasons.length) await rpush("events", { ts: t0, type: "data_invalid", pair, candleTime: c.time, reasons });
          log.processed++;
          const held = st.pos[pair];
          const bestBid = book.bids[0]?.[0], bestAsk = book.asks[0]?.[0];

          if (held && s.sell && book.bids.length) {
            const w = walkSell(book.bids, held.qty);
            if (w.qty > 0) {
              const gross = w.avg * w.qty, fee = gross * (feeRate ?? 0);
              const share = w.qty / held.qty;
              await rpush("orders", { ts: t0, pair, side: "sell", qty: w.qty, bestBid, bestAsk, avgFill: w.avg, fee, signalPrice: c.close,
                diffVsSignalPct: (w.avg / c.close - 1) * 100, candleTime: c.time, lateSec: now - closeT });
              await rpush("trades", { pair, entryTs: held.entryTs, exitTs: t0, qty: w.qty, entryFill: held.entryFill, exitFill: w.avg,
                pnl: gross - fee - w.qty * held.entryFill - held.entryFee * share });
              st.cash += gross - fee;
              held.entryFee -= held.entryFee * share; held.qty -= w.qty;
              if (held.qty < 1e-8) delete st.pos[pair];
            }
          } else if (!held && s.buy) {
            const why = killed ? "kill_switch" : feeRate == null ? "fee_belum_diisi" : reasons.length ? "data_invalid"
              : st.day.blocked ? "daily_loss_limit" : Object.keys(st.pos).length >= CFG.maxPositions ? "max_posisi" : null;
            if (why) {
              await rpush("events", { ts: t0, type: "buy_skipped", pair, candleTime: c.time, reason: why });
            } else {
              const budget = Math.min((equity() * CFG.positionPct) / 100, st.cash / (1 + feeRate!));
              const w = budget >= CFG.minOrderIDR ? walkBuy(book.asks, budget) : { qty: 0, avg: 0 };
              const notional = w.avg * w.qty;
              if (notional < CFG.minOrderIDR) {
                await rpush("events", { ts: t0, type: "buy_skipped", pair, candleTime: c.time, reason: "di_bawah_minimum", budget });
              } else {
                const fee = notional * feeRate!;
                await rpush("orders", { ts: t0, pair, side: "buy", qty: w.qty, bestBid, bestAsk, avgFill: w.avg, fee, signalPrice: c.close,
                  diffVsSignalPct: (w.avg / c.close - 1) * 100, candleTime: c.time, lateSec: now - closeT });
                st.cash -= notional + fee;
                st.pos[pair] = { qty: w.qty, entryTs: t0, entryFill: w.avg, entryFee: fee };
              }
            }
          }
          st.last[pair] = c.time;
        } catch (e) {
          await del(key); // izinkan percobaan ulang pada panggilan berikutnya
          log.errors.push({ pair, error: String(e) });
          await rpush("errors", { ts: t0, pair, error: String(e) });
          break;
        }
      }
    }
    await set("state", st);
    const eq = equity();
    await rpush("equity_ticks", { ts: t0, equity: eq, cash: st.cash, positions: Object.keys(st.pos) });
    log.equity = eq;
    return json({ ok: true, now, equity: eq, positions: Object.keys(st.pos), processed: log.processed, notes: log.notes, errors: log.errors });
  } catch (e) {
    log.errors.push({ error: String(e) });
    await rpush("errors", { ts: t0, error: String(e) }).catch(() => {});
    return json({ ok: false, error: String(e) }, 500);
  } finally {
    await del("lock:tick").catch(() => {});
    await rpush("calls", log).catch(() => {});
  }
}
