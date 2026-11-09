// Storage via Upstash Redis REST (tanpa SDK). State & log disimpan di sini karena filesystem Vercel tidak permanen.
async function cmd(args: (string | number)[]): Promise<any> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL/TOKEN belum diisi");
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
