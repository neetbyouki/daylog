// Daylog のサーバー側の関数：Googleカレンダーへの中継と、PCの記録のまとめ
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GSECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class Fail extends Error { constructor(public code: string, msg: string, public status = 400) { super(msg); } }

// ── Google のアクセストークン（ユーザーごとに少しの間だけ覚えておく）
const tokenCache = new Map<string, { token: string; exp: number }>();
async function accessToken(uid: string): Promise<string> {
  const c = tokenCache.get(uid);
  if (c && c.exp > Date.now() + 60_000) return c.token;
  const { data } = await admin.from("google_tokens").select("refresh_token").eq("user_id", uid).maybeSingle();
  if (!data) throw new Fail("needs_reauth", "Googleカレンダーの許可がまだ。ログインし直すと戻る。", 401);
  if (!GID || !GSECRET) throw new Fail("server_not_connected", "サーバーにGoogleの設定（GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）がまだない。", 500);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: GID, client_secret: GSECRET, refresh_token: data.refresh_token, grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Fail("needs_reauth", "Googleの許可が切れた。ログインし直すと戻る。", 401);
  tokenCache.set(uid, { token: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 });
  return j.access_token;
}
async function g(uid: string, method: string, path: string, body?: unknown, query?: Record<string, string>) {
  const tok = await accessToken(uid);
  const u = new URL("https://www.googleapis.com/calendar/v3" + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== "") u.searchParams.set(k, v);
  const r = await fetch(u, { method, headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) { tokenCache.delete(uid); throw new Fail("needs_reauth", "Googleの許可が切れた。", 401); }
    throw new Fail("google_error", (j && j.error && j.error.message) || "Googleカレンダーのエラー", r.status);
  }
  return j;
}
// 「2026-11-11T10:00:00」のようなオフセットなしの時刻は日本時間として扱う
const tz = (s?: string) => (!s ? s : /([+-]\d\d:\d\d|Z)$/.test(s) ? s : s + "+09:00");
const enc = encodeURIComponent;

async function callTool(uid: string, tool: string, a: Record<string, any>) {
  const cal = enc(a.calendarId || "primary");
  if (tool === "list_events") {
    const j = await g(uid, "GET", `/calendars/${cal}/events`, undefined, {
      timeMin: tz(a.startTime) || "", timeMax: tz(a.endTime) || "", singleEvents: "true",
      orderBy: a.orderBy === "startTime" ? "startTime" : "", maxResults: String(Math.min(a.pageSize || 250, 2500)), timeZone: "Asia/Tokyo",
    });
    return { events: j.items || [] };
  }
  if (tool === "create_event") {
    const body: Record<string, unknown> = {
      summary: a.summary, description: a.description,
      start: { dateTime: a.startTime, timeZone: "Asia/Tokyo" }, end: { dateTime: a.endTime, timeZone: "Asia/Tokyo" },
    };
    if (a.overrideReminders) body.reminders = { useDefault: false, overrides: a.overrideReminders };
    const j = await g(uid, "POST", `/calendars/${cal}/events`, body);
    return { id: j.id, event: j };
  }
  if (tool === "update_event") {
    const body: Record<string, unknown> = {};
    if (a.summary != null) body.summary = a.summary;
    if (a.description != null) body.description = a.description;
    if (a.startTime) body.start = { dateTime: a.startTime, timeZone: "Asia/Tokyo" };
    if (a.endTime) body.end = { dateTime: a.endTime, timeZone: "Asia/Tokyo" };
    if (a.overrideReminders) body.reminders = { useDefault: false, overrides: a.overrideReminders };
    const j = await g(uid, "PATCH", `/calendars/${cal}/events/${enc(a.eventId)}`, body);
    return { id: j.id, event: j };
  }
  if (tool === "delete_event") {
    await g(uid, "DELETE", `/calendars/${cal}/events/${enc(a.eventId)}`);
    return { ok: true };
  }
  throw new Fail("unknown_tool", "unknown tool: " + tool);
}

// ── PCの記録のまとめ（見張り役の1分ごとの記録 → 日ごとの起きた・寝た・ゲーム時間）
const SLEEP_GAP = 180 * 60e3, NAP_GAP = 60 * 60e3, ACTIVE_IDLE_SEC = 300, H = 3600e3;
const pad = (n: number) => String(n).padStart(2, "0");
const jst = (t: number) => new Date(t + 9 * H);
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const dayStart = (s: string) => Date.parse(s + "T06:00:00+09:00");
const logicalDate = (t: number) => ymd(jst(t - 6 * H));

async function pcSummary(uid: string, from: string, to: string) {
  const t0 = dayStart(addDays(from, -1)), t1 = dayStart(addDays(to, 2));
  const samples: { t: number; idle: number; game: string | null }[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await admin.from("pc_log").select("t,idle,game").eq("user_id", uid).gte("t", t0).lt("t", t1).order("t").range(off, off + 999);
    if (error) throw new Fail("db_error", error.message, 500);
    samples.push(...(data || []).map((r) => ({ t: Number(r.t), idle: r.idle || 0, game: r.game })));
    if (!data || data.length < 1000) break;
  }
  const active = samples.filter((s) => s.idle < ACTIVE_IDLE_SEC || s.game).map((s) => s.t);
  const gaps: { start: number; end: number; len: number }[] = [];
  for (let i = 1; i < active.length; i++) { const gp = active[i] - active[i - 1]; if (gp >= NAP_GAP) gaps.push({ start: active[i - 1], end: active[i], len: gp }); }
  const sleeps = gaps.filter((x) => x.len >= SLEEP_GAP);
  const now = Date.now(); const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const ws = dayStart(d), we = dayStart(addDays(d, 1));
    const inWin = samples.filter((s) => s.t >= ws && s.t < we);
    if (!inWin.length) continue;
    const act = active.filter((t) => t >= ws && t < we);
    const wakeGap = sleeps.find((x) => x.end >= ws && x.end < we);
    const first = wakeGap ? wakeGap.end : null;
    const limit = ws + 30 * H;
    const sleepGap = sleeps.find((x) => x.start >= (first || ws) && x.start < limit);
    let last = sleepGap ? sleepGap.start : null;
    if (!last && we < now - 6 * H) { const tail = active.filter((t) => t >= ws && t < limit); last = tail.length ? tail[tail.length - 1] : null; }
    const games: Record<string, number> = {}; let gameMinutes = 0;
    for (const s of inWin) if (s.game) { gameMinutes++; games[s.game] = (games[s.game] || 0) + 1; }
    const naps = gaps.filter((x) => x.len < SLEEP_GAP && x.start >= (first || ws) && x.start < (last || now) && x.start >= ws && x.start < we).map((x) => ({ from: x.start, to: x.end }));
    days.push({ date: d, first, last, activeMinutes: act.length, gameMinutes, games, naps });
  }
  const { data: dev } = await admin.from("device_tokens").select("last_seen").eq("user_id", uid).order("last_seen", { ascending: false, nullsFirst: false }).limit(1);
  const lastSeen = dev && dev[0] && dev[0].last_seen ? Date.parse(dev[0].last_seen) : 0;
  return { days, watcherAlive: now - lastSeen < 15 * 60e3, lastSeen: lastSeen || null, paired: !!(dev && dev.length), generatedAt: now };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u, error } = await admin.auth.getUser(jwt);
    if (error || !u || !u.user) throw new Fail("not_signed_in", "ログインし直してほしい。", 401);
    const uid = u.user.id;
    const b = await req.json().catch(() => ({}));
    if (b.action === "save_google") {
      if (!b.refresh_token) throw new Fail("bad_request", "refresh_token がない");
      await admin.from("google_tokens").upsert({ user_id: uid, refresh_token: b.refresh_token, updated_at: new Date().toISOString() });
      tokenCache.delete(uid);
      return json({ ok: true });
    }
    if (b.action === "google_status") {
      const { data } = await admin.from("google_tokens").select("updated_at").eq("user_id", uid).maybeSingle();
      return json({ linked: !!data });
    }
    if (b.action === "calendars") {
      const j = await g(uid, "GET", "/users/me/calendarList", undefined, { maxResults: "250" });
      return json({ items: (j.items || []).map((c: any) => ({ id: c.id, summary: c.summaryOverride || c.summary, primary: !!c.primary, accessRole: c.accessRole })) });
    }
    if (b.action === "call") return json({ payload: await callTool(uid, String(b.tool), b.args || {}) });
    if (b.action === "pc_activity") {
      const to = /^\d{4}-\d{2}-\d{2}$/.test(b.to) ? b.to : logicalDate(Date.now());
      let from = /^\d{4}-\d{2}-\d{2}$/.test(b.from) ? b.from : addDays(to, -3);
      if (from > to) from = to;
      if ((Date.parse(to) - Date.parse(from)) / 864e5 > 45) from = addDays(to, -45);
      return json({ payload: await pcSummary(uid, from, to) });
    }
    throw new Fail("bad_request", "unknown action");
  } catch (e) {
    const f = e instanceof Fail ? e : new Fail("internal", String((e as Error)?.message || e), 500);
    return json({ error: { code: f.code, message: f.message } }, f.status);
  }
});
