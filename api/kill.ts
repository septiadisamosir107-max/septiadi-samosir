import { authorized, json } from "../lib/auth.js";
import { get, rpush, set } from "../lib/store.js";

// Kill switch tanpa deploy ulang. Nyalakan: /api/kill?on=1   Matikan: /api/kill?on=0   Lihat status: /api/kill
export async function GET(req: Request) {
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);
  const on = new URL(req.url).searchParams.get("on");
  if (on !== "1" && on !== "0") return json({ killSwitch: (await get<number>("killswitch")) ?? 0 });
  await set("killswitch", on === "1" ? 1 : 0);
  await rpush("events", { ts: new Date().toISOString(), type: "kill_switch_set", value: on });
  return json({ killSwitch: Number(on) });
}
