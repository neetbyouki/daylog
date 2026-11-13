// Daylog の通知係：毎分呼ばれ、予定の15分前・就寝目安の45分前に、ホーム画面のDaylogへ直接通知（Web Push）を送る
// ・毎分の呼び出しは データベースの pg_cron から（合言葉 x-cron-secret 付き。合言葉と通知の鍵は push_keys 表）
// ・ログインした本人からの { action: "test" } は、テストの通知を送る
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GSECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
// 通知の鍵と、毎分の呼び出しの合言葉は、データベースの push_keys（サーバーだけが読める）に置いてある
let KEYS: Record<string, string> | null = null;
async function keys(): Promise<Record<string, string>> {
  if (KEYS) return KEYS;
  const { data, error } = await admin.from("push_keys").select("key,value");
  if (error) throw error;
  const k: Record<string, string> = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
  webpush.setVapidDetails("https://neetbyouki.github.io/daylog/", k.vapid_public, k.vapid_private);
  KEYS = k; return k;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const H = 3600e3, M = 60e3;
const pad = (n: number) => String(n).padStart(2, "0");
const jst = (t: number) => new Date(t + 9 * H);
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const logicalDate = (t: number) => ymd(jst(t - 6 * H));
const hm = (t: number) => { const d = jst(t); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
// 論理日 d の "HH:MM"（0〜6時は次の日の深夜）
const slot = (d: string, t: string) => { const [h, m] = t.split(":").map(Number); const base = Date.parse(d + "T00:00:00+09:00"); return base + ((h < 6 ? 24 : 0) + h) * H + m * M; };
const EVENT_BEFORE = 15, BED_BEFORE = 45, LATE_OK = 10; // 分。少し遅れても10分以内なら送る

// ── Google のアクセストークン
async function accessToken(uid: string): Promise<string | null> {
  const { data } = await admin.from("google_tokens").select("refresh_token").eq("user_id", uid).maybeSingle();
  if (!data || !GID || !GSECRET) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: GID, client_secret: GSECRET, refresh_token: data.refresh_token, grant_type: "refresh_token" }) });
  const j = await r.json().catch(() => ({}));
  return r.ok && j.access_token ? j.access_token : null;
}
// Daylogで表示しているカレンダー（boot.js と同じ決まりで名前から探す）
const CAL_NAMES: Record<string, string> = { app: ".｡oO", star: "★", i1lz: "𖦹", panda: "🐼" };
const DEFAULT_CALS: Record<string, boolean> = { app: true, star: true, i1lz: true, panda: true, holiday: true, main: false };
async function upcomingEvents(uid: string, settings: any, now: number) {
  // 5分以内に読んだ分があればそれを使う（毎分Googleに聞かない）
  const { data: c } = await admin.from("push_cache").select("data,fetched_at").eq("user_id", uid).maybeSingle();
  if (c && now - Date.parse(c.fetched_at) < 5 * M && (c.data as any).until > now + (BED_BEFORE + 5) * M) return (c.data as any).events as any[];
  const tok = await accessToken(uid); if (!tok) return [];
  const g = async (path: string, q: Record<string, string> = {}) => {
    const u = new URL("https://www.googleapis.com/calendar/v3" + path); for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
    const r = await fetch(u, { headers: { Authorization: "Bearer " + tok } }); return r.ok ? r.json() : {};
  };
  const list = (await g("/users/me/calendarList", { maxResults: "250" })).items || [];
  const on = { ...DEFAULT_CALS, ...((settings && settings.cals) || {}) };
  const cals: { key: string; id: string }[] = [];
  for (const [key, name] of Object.entries(CAL_NAMES)) { const it = list.find((x: any) => (x.summaryOverride || x.summary || "").trim() === name); if (it && on[key] !== false) cals.push({ key, id: it.id }); }
  const main = list.find((x: any) => x.primary); if (main && on.main !== false && on.main) cals.push({ key: "main", id: main.id });
  const from = new Date(now - 20 * M).toISOString(), until = now + 90 * M, to = new Date(until).toISOString();
  const events: any[] = [];
  for (const cal of cals) {
    const j = await g(`/calendars/${encodeURIComponent(cal.id)}/events`, { timeMin: from, timeMax: to, singleEvents: "true", orderBy: "startTime", maxResults: "50" });
    for (const e of j.items || []) {
      if (!e || e.status === "cancelled" || !e.start || !e.start.dateTime) continue; // 終日の予定は出さない
      events.push({ cal: cal.key, id: e.id, title: e.summary || "（タイトルなし）", start: Date.parse(e.start.dateTime), end: Date.parse((e.end && e.end.dateTime) || e.start.dateTime) });
    }
  }
  await admin.from("push_cache").upsert({ user_id: uid, data: { events, until }, fetched_at: new Date(now).toISOString() });
  return events;
}

async function sendTo(uid: string, msg: { title: string; body: string; tag?: string; url?: string }) {
  const { data: subs } = await admin.from("push_subs").select("id,endpoint,p256dh,auth,fails").eq("user_id", uid);
  let sent = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 600, urgency: "high" });
      sent++; await admin.from("push_subs").update({ last_ok: new Date().toISOString(), fails: 0 }).eq("id", s.id);
    } catch (e: any) {
      const code = e && e.statusCode;
      // もう使えない通知先（アプリを消した・通知を切った）は片付ける
      if (code === 404 || code === 410 || (s.fails || 0) >= 20) await admin.from("push_subs").delete().eq("id", s.id);
      else await admin.from("push_subs").update({ fails: (s.fails || 0) + 1 }).eq("id", s.id);
      console.warn("push failed", code, e && e.body);
    }
  }
  return sent;
}
// 同じ通知を2回送らない
async function once(uid: string, key: string) {
  const { error } = await admin.from("push_sent").insert({ key, user_id: uid });
  return !error;
}

async function runFor(uid: string, now: number, dry: boolean) {
  const out: any[] = [];
  const d = logicalDate(now);
  const { data: docs } = await admin.from("docs").select("collection,id,data").eq("user_id", uid).in("collection", ["settings", "days"]).in("id", ["main", d]);
  const settings = (docs || []).find((r: any) => r.collection === "settings")?.data || {};
  const day = (docs || []).find((r: any) => r.collection === "days")?.data || {};
  const evlog = day.evlog || {};
  // 予定の15分前
  for (const e of await upcomingEvents(uid, settings, now)) {
    if (/^(🌙|☀)/.test(e.title)) continue; // 就寝目安は下で、起きる予定は通知しない
    const l = evlog[`${e.cal}|${e.id}`]; if (l && (l.canceled || l.endedAt)) continue;
    const fire = e.start - EVENT_BEFORE * M;
    if (now >= fire && now < fire + LATE_OK * M && e.start > now - M) {
      const mins = Math.max(1, Math.round((e.start - now) / M));
      const msg = { title: e.title, body: `${mins}分後に始まる（${hm(e.start)}〜${hm(e.end)}）`, tag: `ev-${e.id}`, url: "./" };
      out.push(msg);
      if (!dry && await once(uid, `ev:${e.cal}:${e.id}:${e.start}`)) await sendTo(uid, msg);
    }
  }
  // 就寝目安の45分前（休養の日・夜モードを終えた日・通知オフの日は出さない）
  const bt = day.bedtime;
  if (bt && bt.time && settings.bedtimeNotify !== false && day.mode !== "rest" && !(day.close && day.close.done)) {
    const at = slot(d, bt.time), fire = at - BED_BEFORE * M;
    if (now >= fire && now < fire + LATE_OK * M) {
      const msg = { title: "🌙 就寝の目安まであと45分", body: `目安は${bt.time}。そろそろ切り上げる準備を。`, tag: `bed-${d}`, url: "./" };
      out.push(msg);
      if (!dry && await once(uid, `bed:${d}:${bt.time}`)) await sendTo(uid, msg);
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const now = Date.now();
    const b = await req.json().catch(() => ({}));
    const k = await keys();
    if (k.cron_secret && req.headers.get("x-cron-secret") === k.cron_secret) {
      // 毎分：通知先がある人ぶんだけ見る
      const { data: subs } = await admin.from("push_subs").select("user_id");
      const users = [...new Set((subs || []).map((s: any) => s.user_id))];
      const res: Record<string, unknown> = {};
      for (const uid of users) { try { res[uid] = await runFor(uid as string, b.at ? Number(b.at) : now, !!b.dry); } catch (e) { console.error(uid, e); } }
      // 古い控えは片付ける
      if (new Date(now).getUTCMinutes() === 0) await admin.from("push_sent").delete().lt("sent_at", new Date(now - 3 * 24 * H).toISOString());
      return json({ ok: true, users: users.length, res: b.dry ? res : undefined });
    }
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u || !u.user) return json({ error: { code: "not_signed_in" } }, 401);
    if (b.action === "test") {
      const sent = await sendTo(u.user.id, { title: "Daylog", body: `テストの通知（${hm(now)}）。ここに予定と就寝目安の通知が来る。`, tag: "test", url: "./" });
      return json({ sent });
    }
    return json({ error: { code: "bad_request" } }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: { code: "internal", message: String((e as Error)?.message || e) } }, 500);
  }
});
