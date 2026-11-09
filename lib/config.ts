// ATURAN YANG DIBEKUKAN. Setelah freeze date, file ini tidak boleh diubah (kecuali perbaikan bug, dicatat).
// Harus sama dengan config/strategy.json yang dipakai backtest.
export const CFG = {
  pairs: ["btcidr", "ethidr", "solidr", "xrpidr", "dogeidr"], // universe (3-10 pasangan)
  tf: "240" as const,
  tfSec: 4 * 3600,
  params: { rsiPeriod: 14, maPeriod: 200, rsiBuy: 30, rsiSell: 70 },
  initialCapital: 100_000_000,
  positionPct: 10, // % ekuitas per posisi
  maxPositions: 5,
  dailyLossLimitPct: 3, // hari WIB (UTC+7)
  minOrderIDR: 25_000,
  // ISI sebelum freeze: tarif taker all-in dalam persen (yang lebih mahal antara /api/pairs dan halaman biaya resmi).
  // Selama null, bot tidak membuka posisi baru.
  takerFeePct: null as number | null,
  historyBars: 600,
  maxCatchUp: 6, // candle tertinggal yang diproses sekaligus bila penjadwal terlambat
};
