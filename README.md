# UAS Algoritma Trading - Bot Dry Run Indodax (Vercel)

Status: kerangka awal (koneksi + pengumpul snapshot order book). Strategi, bot `/api/tick`, backtest, dashboard menyusul.

## Setup
1. `npm install`, lalu `npm run typecheck`.
2. Buat database Upstash Redis (Vercel Marketplace). Isi env var di Vercel: `CRON_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `PAIRS`.
3. Deploy ke Vercel (repo GitHub -> Import Project).
4. Di GitHub: Settings > Secrets and variables > Actions, buat `CRON_SECRET` (nilai sama) dan `BOT_BASE_URL` (mis. https://nama-proyek.vercel.app).
5. Uji koneksi: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/health`
6. Jalankan workflow `snapshot` manual sekali (Actions > snapshot > Run workflow), lalu cek `/api/health` -> `storage` bertambah.

## Catatan
- Semua secret hanya di environment variable / GitHub Secrets. `.env` tidak pernah di-commit.
- Catat URL dan tanggal akses untuk tarif taker & minimum order (dari `/api/pairs` dan halaman biaya resmi) di dokumen strategi.
