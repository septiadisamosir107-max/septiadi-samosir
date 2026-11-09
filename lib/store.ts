// Storage via Upstash Redis REST (tanpa SDK). Menerima nama variabel dari Vercel (KV_REST_API_*) maupun Upstash (UPSTASH_REDIS_REST_*).
async function cmd(args: (string | number)[]): Promise<any> {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("KV_REST_API_URL/KV_REST_API_TOKEN belum diisi");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const j = (await res.json()) as { result?: unknown; error?: string };
  if (j.error) throw new Error(`Upstash: ${j.error}`);
  return j.result;
}

export const rpush = (key: string, value: unknown) => cmd(["RPUSH", key, JSON.stringify(value)]);
export const llen = (key: string): Promise<number> => cmd(["LLEN", key]);
export async function lrange<T = unknown>(key: string, start = 0, stop = -1): Promise<T[]> {
  const arr = (await cmd(["LRANGE", key, start, stop])) as string[];
  return arr.map((s) => JSON.parse(s) as T);
}
export async function get<T = unknown>(key: string): Promise<T | null> {
  const r = await cmd(["GET", key]);
  return r == null ? null : (JSON.parse(r as string) as T);
}
export const set = (key: string, value: unknown) => cmd(["SET", key, JSON.stringify(value)]);
export const del = (key: string) => cmd(["DEL", key]);
// true bila kunci berhasil dibuat (belum ada). Dipakai untuk idempotency dan lock.
export async function setnx(key: string, ttlSec: number): Promise<boolean> {
  return (await cmd(["SET", key, "1", "NX", "EX", ttlSec])) === "OK";
}
