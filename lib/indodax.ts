const BASE = "https://indodax.com";
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry terbatas (3x) dengan backoff + timeout; batas API publik 180 req/menit.
export async function getJson<T>(path: string, tries = 3, timeoutMs = 10_000): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(BASE + path, { signal: ctrl.signal, headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      await sleep(500 * 2 ** i);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`gagal setelah ${tries} percobaan: ${String(lastErr)}`);
}

export type Level = [price: number, qty: number];
export type Book = { bids: Level[]; asks: Level[] };

export async function getServerTime(): Promise<number> {
  const r = await getJson<{ server_time: number }>("/api/server_time");
     const t = Number(r.server_time);
   return t > 1e12 ? Math.floor(t / 1000) : t;
}

export async function getDepth(pair: string): Promise<Book> {
  const d = await getJson<{ buy?: [string, string][]; sell?: [string, string][] }>(`/api/depth/${pair}`);
  const bids = (d.buy ?? []).map(([p, q]) => [Number(p), Number(q)] as Level).sort((a, b) => b[0] - a[0]);
  const asks = (d.sell ?? []).map(([p, q]) => [Number(p), Number(q)] as Level).sort((a, b) => a[0] - b[0]);
  return { bids, asks };
}

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

// Mengembalikan HANYA candle yang sudah tertutup: Time + durasi <= server_time.
export async function getClosedCandles(
  symbol: string, // contoh: BTCIDR
  tf: "1" | "15" | "30" | "60" | "240" | "1D",
  from: number,
  to: number,
  serverTime: number,
): Promise<Candle[]> {
  const rows = await getJson<any[]>(`/tradingview/history_v2?symbol=${symbol}&tf=${tf}&from=${from}&to=${to}`);
  const tfSec = tf === "1D" ? 86400 : Number(tf) * 60;
  return rows
    .map((r) => ({
      time: Number(r.Time), open: Number(r.Open), high: Number(r.High),
      low: Number(r.Low), close: Number(r.Close), volume: Number(r.Volume),
    }))
    .filter((c) => c.time + tfSec <= serverTime)
    .sort((a, b) => a.time - b.time);
}

// Validasi data sesuai soal. Bot TIDAK boleh membuka posisi bila reasons tidak kosong (catat reasons di log).
export function validateMarket(candles: Candle[], tfSec: number, serverTime: number, book: Book, window: number): string[] {
  const reasons: string[] = [];
  const last = candles[candles.length - 1];
  if (!last) return ["tidak ada candle tertutup"];
  if (serverTime - (last.time + tfSec) > 2 * tfSec) reasons.push("candle tertutup terakhir lebih tua dari 2x timeframe");
  const w = candles.slice(-window);
  if (w.length < window) reasons.push("candle kurang dari jendela indikator");
  for (let i = 1; i < w.length; i++) if (w[i].time - w[i - 1].time !== tfSec) { reasons.push("ada candle hilang di jendela indikator"); break; }
  if (w.some((c) => !(c.close > 0) || !(c.volume > 0))) reasons.push("harga atau volume nol");
  if (!book.bids.length || !book.asks.length) reasons.push("order book kosong");
  else {
    const bid = book.bids[0][0], ask = book.asks[0][0];
    if ((ask - bid) / ((ask + bid) / 2) > 0.02) reasons.push("selisih bid-ask > 2%");
  }
  return reasons;
}
