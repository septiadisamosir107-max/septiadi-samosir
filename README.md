# UAS Algoritma Trading - Bot Dry Run Indodax (Vercel)

## Strategi (dibekukan)
- Sumber: strategi UTS (RSI + MA 200, AmiBroker), disesuaikan untuk kripto.
- Beli: RSI(14) menembus naik 30 dan harga tutup di atas MA(200).
- Jual: RSI(14) menembus turun 70.
- Long-only, tanpa short, margin, atau leverage.
- Timeframe: 4 jam. Sinyal hanya dari candle yang sudah tertutup.
- Ukuran posisi: 10% ekuitas. Maksimal 5 posisi terbuka.
- Daily loss limit: 3% (hari WIB, ganti pukul 00.00 WIB).
- Universe: BTC/IDR, ETH/IDR, SOL/IDR, XRP/IDR, DOGE/IDR.
- Modal awal virtual: Rp100.000.000.

## Perubahan dari versi UTS
- Ditambah batas 5 posisi dan daily loss limit 3% (wajib dari soal UAS).
- Disesuaikan untuk kripto: timeframe 4 jam, fill di bid/ask order book.

## Eksekusi
- Beli di ask, jual di bid dari order book live. Tidak ada fill di mid atau close.
- Fee taker: 0,45% (angka konservatif sementara). /api/pairs menunjukkan trade_fee_percent_taker 0,2 (diakses 9 Nov 2026). Angka all-in resmi dari menu Profil Indodax masih akan diverifikasi.
- Minimum order: Rp25.000 (/api/pairs menunjukkan 10.000, dipakai yang lebih ketat).

## Risk management di kode
- Idempotency per candle, kill switch (/api/kill), retry terbatas, endpoint dilindungi CRON_SECRET.

## Jadwal
- Catatan: freeze dilakukan pada 12 November 2026 (commit 2170950), setelah tanggal yang ditetapkan soal (4 November 2026) karena persiapan terlambat. Tick pertama berjalan 12 November 2026 sekitar 11.42 WIB, jadi forward test 10 hari selesai sekitar 22 November 2026, setelah tenggat pengumpulan.
## Setup
1. Isi environment variable di Vercel: CRON_SECRET, KV_REST_API_URL, KV_REST_API_TOKEN, PAIRS.
2. Isi GitHub Secrets: CRON_SECRET dan BOT_BASE_URL.
3. Uji koneksi: GET /api/health dengan header Authorization: Bearer <CRON_SECRET>.
4. Jadwal: GitHub Actions (snapshot tiap 30 menit, tick tiap jam).
