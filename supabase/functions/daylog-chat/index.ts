// Daylog のおしゃべり係：ペットの部屋の会話を Claude API（Haiku 5.5）に渡す
// ・アプリ版は Supabase のログイン（JWT）で直接呼ぶ。claude.ai版は api_daylog.call の 'chat' → daylog_private.chat_call（合言葉 x-cron-secret）から
// ・Claude は Daylog を読む道具（日ごとの記録・タスク・目標・メモ・さがす・ペット）だけを使える。書き込みはしない
// ・前もっての指示は settings/main の chatPrompt。使った量は meta/chatuse（今月のトークンと金額の目安・今日の回数）
// ・APIキーは Edge Function Secrets の ANTHROPIC_API_KEY（リポジトリやチャットには書かない）
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const MODEL = "claude-haiku-5-5";
const DAY_LIMIT = 150;          // 1日に話せる回数（使いすぎ防止）
const PRICE = { in: 0.10, out: 0.50, cr: 0.01, cw: 0.125 }; // USD / 100万トークン（Haiku 5.5・10万トークンまで）
const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class Fail extends Error { constructor(public code: string, msg: string) { super(msg); } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ── 日本時間・1日の区切りは朝6時
const H = 3600e3;
const pad = (n: number) => String(n).padStart(2, "0");
const jst = (t: number) => new Date(t + 9 * H);
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const logicalDate = (t: number) => ymd(jst(t - 6 * H));
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const hm = (t?: number | null) => (t ? `${pad(jst(t).getUTCHours())}:${pad(jst(t).getUTCMinutes())}` : null);
const md = (t?: number | null) => (t ? `${pad(jst(t).getUTCMonth() + 1)}/${pad(jst(t).getUTCDate())} ${hm(t)}` : null);
const DOW = "日月火水木金土";
const cut = (s: unknown, n: number) => { const v = String(s ?? ""); return v.length > n ? v.slice(0, n) + "…" : v; };
const gameName = (g: string) => String(g || "").replace(/-(Win64|Win32|WinGDK)-Shipping$/i, "").replace(/\.exe$/i, "");
const NOT_GAME = /^(wallpaper(ui|32|64))$/i;

async function col(uid: string, c: string, range?: { from?: string; to?: string }) {
  let q = admin.from("docs").select("id,data").eq("user_id", uid).eq("collection", c);
  if (range?.from) q = q.gte("id", range.from);
  if (range?.to) q = q.lte("id", range.to);
  const out: { id: string; data: any }[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await q.range(off, off + 999);
    if (error) throw new Fail("db", error.message);
    out.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return out;
}
const one = async (uid: string, c: string, id: string) => { const { data } = await admin.from("docs").select("data").eq("user_id", uid).eq("collection", c).eq("id", id).maybeSingle(); return data?.data || null; };

// ── 1日分を読みやすい形に
function dayView(date: string, day: any, pc: any) {
  day = day || {}; pc = pc || {};
  const ents = (day.entries || []).filter((e: any) => e && e.t).sort((a: any, b: any) => a.t - b.t)
    .map((e: any) => ({ time: hm(e.t), text: cut(e.text, 400), mood: e.mood || undefined, body: e.body || undefined, nap: e.nap || undefined }));
  const wake = day.wakeFix && day.wakeAt ? day.wakeAt : Math.min(...[day.wakeAt, pc.first].filter(Boolean).map(Number), Infinity);
  const slept = day.sleepAt || (day.close && day.close.at) || pc.last || null;
  const habits = Object.entries(day.habits || {}).filter(([k, v]) => v === true && !k.endsWith("At")).map(([k]) => k);
  const games = (pc.sessions || []).filter((s: any) => !NOT_GAME.test(gameName(s.g)) && !String(s.g).startsWith("~"))
    .map((s: any) => ({ game: gameName(s.g), from: md(Number(s.from)), to: md(Number(s.to)), minutes: s.min }));
  const plans = ((day.evsnap && day.evsnap.list) || []).map((x: any) => x.allDay ? { allDay: true, title: x.title } : { from: hm(x.start), to: hm(x.end), title: x.title });
  const d = new Date(date + "T00:00:00Z");
  return {
    date, weekday: DOW[d.getUTCDay()], mode: day.mode || null,
    woke: isFinite(wake) ? md(wake) : null, slept: md(slept), bedtimeTarget: day.bedtime?.time || null,
    nightModeDone: !!(day.close && day.close.done), close: day.close ? { mood: day.close.mood, body: day.close.body, constellation: day.close.name || undefined } : undefined,
    habitsDone: habits, entries: ents, plans: plans.length ? plans : undefined,
    gameMinutesTotal: pc.gameMinutes ?? undefined, games: games.length ? games : undefined,
    pcNaps: (pc.naps || []).map((n: any) => `${hm(n.from)}〜${hm(n.to)}`),
  };
}

const TOOLS = [
  { name: "get_days", description: "Daylog の日ごとの記録を読む（1日は朝6時から翌朝6時まで）。体調モード・起きた/寝た時刻・就寝の目安・夜モード・習慣・日記の記録（時刻・本文・気分/体調1〜5）・予定・ゲームをした時間帯・昼寝の候補。一度に31日まで。", input_schema: { type: "object", properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD（省くと from と同じ日）" } }, required: ["from"] } },
  { name: "get_tasks", description: "タスクを読む。status は open（やること）/ held（保留箱）/ done（終わった・60日以内）/ all。", input_schema: { type: "object", properties: { status: { type: "string", enum: ["open", "held", "done", "all"] } } } },
  { name: "get_goals", description: "今月・今週の目標と、その状態を読む。", input_schema: { type: "object", properties: {} } },
  { name: "get_memos", description: "ひとことメモと、ノート（題と本文の頭）を新しい順に読む。", input_schema: { type: "object", properties: { limit: { type: "integer", description: "それぞれ何件まで（ふつう20、最大60）" } } } },
  { name: "search", description: "日記の記録・ひとことメモ・ノートから、言葉をふくむものをさがす（過去1年）。", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "get_pet", description: "ペット（あなた自身）の名前・育ち・能力・棚のごはん・旅の記録を読む。", input_schema: { type: "object", properties: {} } },
];

async function runTool(uid: string, name: string, a: any): Promise<unknown> {
  const today = logicalDate(Date.now());
  if (name === "get_days") {
    let from = /^\d{4}-\d{2}-\d{2}$/.test(a.from) ? a.from : today; let to = /^\d{4}-\d{2}-\d{2}$/.test(a.to) ? a.to : from;
    if (to < from) [from, to] = [to, from];
    if ((Date.parse(to) - Date.parse(from)) / 864e5 > 30) from = addDays(to, -30);
    const [days, pcs] = await Promise.all([col(uid, "days", { from, to }), col(uid, "pc", { from, to })]);
    const dm = new Map(days.map((r) => [r.id, r.data])); const pm = new Map(pcs.map((r) => [r.id, r.data]));
    const out = []; for (let d = from; d <= to; d = addDays(d, 1)) { if (dm.has(d) || pm.has(d)) out.push(dayView(d, dm.get(d), pm.get(d))); else out.push({ date: d, note: "記録なし" }); }
    return out;
  }
  if (name === "get_tasks") {
    const st = ["open", "held", "done", "all"].includes(a.status) ? a.status : "open";
    const [tasks, goals] = await Promise.all([col(uid, "tasks"), col(uid, "goals")]);
    const gname = new Map(goals.map((g) => [g.id, g.data?.title]));
    const lim = Date.now() - 60 * 864e5;
    return tasks.map((r) => r.data).filter((t: any) => t && (st === "all" || t.status === st) && !(t.status === "done" && (t.doneAt || 0) < lim))
      .sort((x: any, y: any) => (y.doneAt || y.createdAt || 0) - (x.doneAt || x.createdAt || 0)).slice(0, 80)
      .map((t: any) => ({ title: t.title, status: t.status, weight: t.weight, deadline: t.deadline || undefined, planned: t.plannedDate || undefined, doneAt: md(t.doneAt) || undefined, steps: (t.steps || []).length ? `${(t.steps || []).filter((s: any) => s.done).length}/${(t.steps || []).length}` : undefined, goal: t.goalId ? gname.get(t.goalId) : undefined }));
  }
  if (name === "get_goals") return (await col(uid, "goals")).map((r) => r.data).filter(Boolean).sort((a: any, b: any) => String(b.period).localeCompare(String(a.period))).slice(0, 40).map((g: any) => ({ title: g.title, scope: g.scope, period: g.period, status: g.status }));
  if (name === "get_memos") {
    const n = Math.min(60, Math.max(1, Number(a.limit) || 20));
    const [memos, notes] = await Promise.all([col(uid, "memos"), col(uid, "notes")]);
    return {
      memos: memos.map((r) => r.data).filter(Boolean).sort((x: any, y: any) => (y.createdAt || 0) - (x.createdAt || 0)).slice(0, n).map((m: any) => ({ at: md(m.createdAt), text: cut(m.text, 300), fav: m.fav || undefined })),
      notes: notes.map((r) => r.data).filter((x: any) => x && !x.trashed).sort((x: any, y: any) => (y.updatedAt || 0) - (x.updatedAt || 0)).slice(0, n).map((m: any) => ({ updated: md(m.updatedAt), title: cut(m.title, 80), text: cut(m.text, 500) })),
    };
  }
  if (name === "search") {
    const q = String(a.query || "").trim().toLowerCase(); if (!q) return [];
    const from = addDays(today, -366);
    const [days, memos, notes] = await Promise.all([col(uid, "days", { from }), col(uid, "memos"), col(uid, "notes")]);
    const hits: any[] = [];
    for (const r of days) for (const e of (r.data?.entries || [])) if (String(e.text || "").toLowerCase().includes(q)) hits.push({ kind: "記録", date: r.id, time: hm(e.t), text: cut(e.text, 300) });
    for (const r of memos) if (String(r.data?.text || "").toLowerCase().includes(q)) hits.push({ kind: "メモ", at: md(r.data.createdAt), text: cut(r.data.text, 300) });
    for (const r of notes) { const t = `${r.data?.title || ""}\n${r.data?.text || ""}`; if (!r.data?.trashed && t.toLowerCase().includes(q)) hits.push({ kind: "ノート", title: cut(r.data.title, 80), text: cut(r.data.text, 400) }); }
    return hits.slice(-40);
  }
  if (name === "get_pet") { const p = await one(uid, "pet", "main"); return p ? { name: p.name || null, bornDay: p.bornDay, form: p.form || null, stats: p.stats || null, lastTrip: p.trip || null, souvenirs: (p.souvenirs || []).slice(-5) } : { note: "ペットはまだいない" }; }
  throw new Fail("bad_tool", "unknown tool " + name);
}

// ── 今日のようす（道具を使わなくても答えられるように、少しだけ先に渡す）
async function todaySummary(uid: string) {
  const t = logicalDate(Date.now()); const y = addDays(t, -1);
  const [days, pcs, pet] = await Promise.all([col(uid, "days", { from: y, to: t }), col(uid, "pc", { from: y, to: t }), one(uid, "pet", "main")]);
  const dm = new Map(days.map((r) => [r.id, r.data])); const pm = new Map(pcs.map((r) => [r.id, r.data]));
  const v = dayView(t, dm.get(t), pm.get(t)); const vy = dayView(y, dm.get(y), pm.get(y));
  return { pet, text: JSON.stringify({ today: { ...v, entries: v.entries.slice(-8) }, yesterday: { date: vy.date, mode: vy.mode, woke: vy.woke, slept: vy.slept, entriesCount: vy.entries.length, gameMinutesTotal: vy.gameMinutesTotal } }) };
}

async function anthropic(body: unknown) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(j?.error?.message || r.status);
    if (r.status === 401 || r.status === 403) throw new Fail("bad_key", "APIキーが使えない（違うキー・消されたキー・期限切れ）");
    if (/workspace/i.test(msg)) throw new Fail("key_scope", "APIキーにワークスペースが選ばれていない（Default Workspace を選んで作り直す）");
    if (/credit balance/i.test(msg)) throw new Fail("no_credit", "前払いのクレジットがなくなった");
    if (r.status === 429 || r.status === 529 || r.status >= 500) throw new Fail("busy", "Claude が混んでいる");
    throw new Fail("api", msg.slice(0, 200));
  }
  return j;
}

async function chat(uid: string, raw: any[]) {
  if (!KEY) throw new Fail("no_key", "サーバーに ANTHROPIC_API_KEY がまだ入っていない");
  // 使いすぎ防止（1日の回数）
  const now = Date.now(); const today = logicalDate(now); const month = today.slice(0, 7);
  const use0 = (await one(uid, "meta", "chatuse")) || {};
  const use = { month, in: 0, out: 0, cr: 0, cw: 0, usd: 0, calls: 0, ...(use0.month === month ? use0 : {}), day: today, dayCalls: use0.day === today ? (use0.dayCalls || 0) : 0 };
  if (use.dayCalls >= DAY_LIMIT) throw new Fail("day_limit", `今日はもう${DAY_LIMIT}回話した（使いすぎ防止）`);
  // 会話：交互に並べ、長すぎるものは切る
  const msgs: { role: string; content: any }[] = [];
  for (const m of (Array.isArray(raw) ? raw : []).slice(-20)) {
    const role = m && m.role === "assistant" ? "assistant" : "user"; const text = cut(m && m.content, 2000).trim(); if (!text) continue;
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += "\n" + text; else msgs.push({ role, content: text });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") throw new Fail("bad_request", "話しかける言葉がない");
  const [settings, sum] = await Promise.all([one(uid, "settings", "main"), todaySummary(uid)]);
  const pet = sum.pet || {}; const petName = pet.name || "ペット";
  const stage = ({ egg: "たまご", chibi: "ちび", adult: "おとな" } as any)[pet.stats?.stage] || "";
  const pref = cut(String(settings?.chatPrompt || "").trim(), 12000);
  // 守ること（どの指示よりも先）：記録の扱い・画面に出せる形・全力で助けること（2026-11-24 山浦が決めた文）。話し方・長さ・考え方は山浦の指示に任せる
  const rules = [
    `あなたは、山浦の生活アプリ「Daylog」の中にいるペット「${petName}」${stage ? `（${stage}）` : ""}。ペットの部屋の「おはなし」で山浦と話す。`,
    "――守ること（下の山浦の指示より先）――",
    "・Daylog の記録を読む道具がある。記録・数字・時刻・出来事について答えるときは、必ず道具で確かめてから答える。記録にないことは「記録にない」と言い、作らない。推測は推測とわかるように書く。",
    "・時刻はすべて日本時間。1日の区切りは朝6時（たとえば 3:00 に書いた記録は、前の日の夜のもの）。",
    "・記録を書きかえることはできない（読むだけ）。頼まれたら、Daylogのどこで直せるかを教える。",
    "・画面に出せる形：太字（**ことば**）、小見出し（行の頭に「## 」）、箇条書き（行の頭に「- 」）、改行。表・リンク・斜体・コードは出ないので使わない。",
    "・あなたが山浦の事を助けるつもりで全力でサポートしてください。",
  ];
  if (pref) rules.push(
    "",
    "――山浦が書いた指示（キャラ・口調・長さ・考え方・答えの組み立ては、すべてこれに従う）――",
    "・指示の中の「私」は山浦のこと。ただし「一人称は私」のように、あなた（ペット）自身について書かれたところは、あなたのこと。",
    "・指示に名前だけ出てくる Skill（pet-heart・pet-voice・pet-thinking など）は、中身がこの指示に書かれていればそれに従い、なければ名前と前後から意図をくむ。",
    "・前の返事の口調や長さにつられず、毎回この指示に合わせる。",
    "",
    pref,
  );
  else rules.push("・日本語で、短く（ふつう2〜6文）。叱らない・根性論を言わない・説教しない。山浦がしんどそうなときは、まず受け止める。");
  const base = rules.join("\n");
  const dyn = `いま：${md(now)}（Daylogの「今日」は ${today}）\n\n――今日と昨日のようす（くわしくは道具で）――\n${sum.text}`;
  const system = [{ type: "text", text: base, cache_control: { type: "ephemeral" } }, { type: "text", text: dyn }];
  const usage = { in: 0, out: 0, cr: 0, cw: 0 }; const used: string[] = []; let reply = "";
  for (let round = 0; round < 6; round++) {
    const r = await anthropic({ model: MODEL, max_tokens: 2048, system, tools: TOOLS, messages: msgs });
    const u = r.usage || {}; usage.in += u.input_tokens || 0; usage.out += u.output_tokens || 0; usage.cr += u.cache_read_input_tokens || 0; usage.cw += u.cache_creation_input_tokens || 0;
    const blocks = r.content || [];
    if (r.stop_reason === "tool_use" && round < 5) {
      msgs.push({ role: "assistant", content: blocks });
      const results = [];
      for (const b of blocks) if (b.type === "tool_use") {
        used.push(b.name); let out: string;
        try { out = JSON.stringify(await runTool(uid, b.name, b.input || {})); } catch (e) { out = JSON.stringify({ error: String((e as Error).message || e) }); }
        results.push({ type: "tool_result", tool_use_id: b.id, content: out.length > 16000 ? out.slice(0, 16000) + "…（長いので途中まで）" : out });
      }
      msgs.push({ role: "user", content: results });
      continue;
    }
    reply = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    break;
  }
  if (!reply) reply = "（うまく答えられなかった。もう一度話しかけてみて）";
  const usd = (usage.in * PRICE.in + usage.out * PRICE.out + usage.cr * PRICE.cr + usage.cw * PRICE.cw) / 1e6;
  const next = { ...use, in: use.in + usage.in, out: use.out + usage.out, cr: use.cr + usage.cr, cw: use.cw + usage.cw, usd: Math.round((use.usd + usd) * 1e5) / 1e5, calls: use.calls + 1, dayCalls: use.dayCalls + 1, at: now };
  await admin.from("docs").upsert({ user_id: uid, collection: "meta", id: "chatuse", data: next });
  return { reply, used: { tools: used, usd: Math.round(usd * 1e5) / 1e5, monthUsd: next.usd, dayCalls: next.dayCalls, dayLimit: DAY_LIMIT } };
}

async function cronSecret() { const { data } = await admin.from("push_keys").select("value").eq("key", "cron_secret").maybeSingle(); return data?.value || ""; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const b = await req.json().catch(() => ({}));
    let uid = "";
    const sec = req.headers.get("x-cron-secret");
    if (sec) { if (sec !== await cronSecret() || !UUID.test(String(b.uid || ""))) return json({ error: { code: "forbidden", message: "forbidden" } }, 403); uid = String(b.uid); }
    else {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u, error } = await admin.auth.getUser(jwt);
      if (error || !u?.user) return json({ error: { code: "not_signed_in", message: "ログインし直してほしい" } }, 401);
      uid = u.user.id;
    }
    return json(await chat(uid, b.messages));
  } catch (e) {
    const f = e instanceof Fail ? e : new Fail("internal", String((e as Error)?.message || e));
    if (!(e instanceof Fail)) console.error(e);
    return json({ error: { code: f.code, message: f.message } }); // アプリで扱うエラーは 200 で返す（claude.ai版のデータベース経由でも読めるように）
  }
});
