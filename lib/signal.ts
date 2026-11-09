// Fungsi sinyal tunggal: dipakai backtest DAN bot /api/tick. Jangan diduplikasi.
// Setara AmiBroker: Buy = Cross(RSI,30) AND Close>MA200 ; Sell = Cross(70,RSI)
// ExRem ditangani state posisi: beli hanya saat flat, jual hanya saat punya posisi.
export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
export interface Params { rsiPeriod: number; maPeriod: number; rsiBuy: number; rsiSell: number }
export const DEFAULT_PARAMS: Params = { rsiPeriod: 14, maPeriod: 200, rsiBuy: 30, rsiSell: 70 };
export interface SignalBar { buy: boolean; sell: boolean; rsi: number | null; ma: number | null }

export function sma(v: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(v.length).fill(null);
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i];
    if (i >= n) sum -= v[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

// RSI Wilder (smoothing 1/n), sama seperti RSI() di AmiBroker.
export function rsiWilder(v: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(v.length).fill(null);
  if (v.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = v[i] - v[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    g = (g * (n - 1) + (d > 0 ? d : 0)) / n;
    l = (l * (n - 1) + (d < 0 ? -d : 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

// Input HARUS candle yang sudah tertutup, urut waktu naik.
export function computeSignals(candles: Candle[], p: Params = DEFAULT_PARAMS): SignalBar[] {
  const close = candles.map(c => c.close);
  const rsi = rsiWilder(close, p.rsiPeriod);
  const ma = sma(close, p.maPeriod);
  return candles.map((c, i) => {
    const r = rsi[i], rp = i > 0 ? rsi[i - 1] : null, m = ma[i];
    const buy = r !== null && rp !== null && m !== null && r > p.rsiBuy && rp <= p.rsiBuy && c.close > m;
    const sell = r !== null && rp !== null && r < p.rsiSell && rp >= p.rsiSell;
    return { buy, sell, rsi: r, ma: m };
  });
}
