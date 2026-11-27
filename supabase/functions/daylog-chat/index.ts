// Daylog のおしゃべり係：ペットの部屋の会話・夜モードの一言・育成の3問を Claude API（Haiku 5.5）に渡す
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

// ── 自分との約束（settings.promises。なければ最初の3つ）。days の promises[id] = 'min'（半分）|'full'（ふつう）
const DEFAULT_PROMISES = [{ id: "p1", title: "着替える", full: "着替える", min: "上だけ" }, { id: "p2", title: "外に出る", full: "外に出る", min: "すこし" }, { id: "p3", title: "アニメ見る", full: "アニメ見る", min: "半分" }];
const promiseList = (settings: any) => (Array.isArray(settings?.promises) ? settings.promises.slice(0, 3) : DEFAULT_PROMISES);
const promiseView = (day: any, plist: any[]) => plist.map((p: any) => { const v = day?.promises?.[p.id]; return { promise: p.title, half: p.min, kept: v === "full" ? "ふつう" : v === "min" ? `半分（${p.min}）` : "まだ", at: v ? hm(day.promises[p.id + "At"]) || undefined : undefined }; });

// ── 1日分を読みやすい形に
function dayView(date: string, day: any, pc: any, plist: any[] = DEFAULT_PROMISES) {
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
    nightModeDone: !!(day.close && day.close.done), close: day.close ? { mood: day.close.mood, body: day.close.body, note: day.close.text ? cut(day.close.text, 300) : undefined, constellation: day.close.name || undefined } : undefined,
    promises: day.promises || date >= "2026-11-25" ? promiseView(day, plist) : undefined, oldHabitsDone: habits.length ? habits : undefined, entries: ents, plans: plans.length ? plans : undefined,
    gameMinutesTotal: pc.gameMinutes ?? undefined, games: games.length ? games : undefined,
    pcNaps: (pc.naps || []).map((n: any) => `${hm(n.from)}〜${hm(n.to)}`),
  };
}

const TOOLS = [
  { name: "get_days", description: "Daylog の日ごとの記録を読む（1日は朝6時から翌朝6時まで）。体調モード・起きた/寝た時刻・就寝の目安・夜モード・自分との約束（守れたか：ふつう／半分（しんどい日はここまでで守れた）／まだ）・日記の記録（時刻・本文・気分/体調1〜5）・予定・ゲームをした時間帯・昼寝の候補。一度に31日まで。", input_schema: { type: "object", properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD（省くと from と同じ日）" } }, required: ["from"] } },
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
    const [days, pcs, st] = await Promise.all([col(uid, "days", { from, to }), col(uid, "pc", { from, to }), one(uid, "settings", "main")]);
    const dm = new Map(days.map((r) => [r.id, r.data])); const pm = new Map(pcs.map((r) => [r.id, r.data])); const pl = promiseList(st);
    const out = []; for (let d = from; d <= to; d = addDays(d, 1)) { if (dm.has(d) || pm.has(d)) out.push(dayView(d, dm.get(d), pm.get(d), pl)); else out.push({ date: d, note: "記録なし" }); }
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
async function todaySummary(uid: string, settings: any) {
  const t = logicalDate(Date.now()); const y = addDays(t, -1); const pl = promiseList(settings);
  const [days, pcs, pet] = await Promise.all([col(uid, "days", { from: y, to: t }), col(uid, "pc", { from: y, to: t }), one(uid, "pet", "main")]);
  const dm = new Map(days.map((r) => [r.id, r.data])); const pm = new Map(pcs.map((r) => [r.id, r.data]));
  const v = dayView(t, dm.get(t), pm.get(t), pl); const vy = dayView(y, dm.get(y), pm.get(y), pl);
  return { pet, text: JSON.stringify({ today: { ...v, entries: v.entries.slice(-8) }, yesterday: { date: vy.date, mode: vy.mode, woke: vy.woke, slept: vy.slept, promises: vy.promises, entriesCount: vy.entries.length, gameMinutesTotal: vy.gameMinutesTotal } }) };
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

// 夜モードの締め：ペットとしての一言と、今日の星座の名前（JSONで受け取る）
const NIGHT_ASK = [
  "（夜モード）山浦がいま、夜モードで今日を締めているところ。ペットとして、今日の締めの一言をかけて。",
  "- 2〜3文、100字以内。今日のようす（記録・約束・気分・締めのメモ）から、具体的なことを1つ拾う",
  "- 守れなかったこと・できなかったことは責めない。しんどそうな日は、そのままでいいと伝える",
  "- もう寝るところなので、質問で終わらない",
  "それと、今日の星座に名前をつけて：ファンタジーの物語や古い神話に出てきそうな名前。今日の出来事をそのまま書かず、魔法・伝承・遠い国の言葉に置き換える。「〇〇座」の形で、座を含めて14字以内。",
  "返事は JSON だけ：{\"comment\":\"一言\",\"name\":\"〇〇座\"}",
].join("\n");
function parseNight(reply: string) {
  const m = reply.match(/\{[\s\S]*\}/);
  if (m) { try { const j = JSON.parse(m[0]); if (j && j.comment) return { comment: cut(String(j.comment).trim(), 240), name: cut(String(j.name || "").trim(), 20) }; } catch (_) { /* そのまま下へ */ } }
  return { comment: cut(reply.replace(/```[a-z]*|```/g, "").trim(), 240), name: "" };
}

async function chat(uid: string, raw: any[], kind = "") {
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
  if (kind === "night") msgs.splice(0, msgs.length, { role: "user", content: NIGHT_ASK });
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") throw new Fail("bad_request", "話しかける言葉がない");
  const settings = await one(uid, "settings", "main"); const sum = await todaySummary(uid, settings);
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
    "・指示に名前だけ出てくる Skill（pet-voice・pet-thinking など）は、中身がこの指示に書かれていればそれに従い、なければ名前と前後から意図をくむ。",
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
  return { reply, night: kind === "night" ? parseNight(reply) : undefined, used: { tools: used, usd: Math.round(usd * 1e5) / 1e5, monthUsd: next.usd, dayCalls: next.dayCalls, dayLimit: DAY_LIMIT } };
}

// ── 育成の3問（2026-11-27c）：毎日ちがう問題を3つ作る／答えにペットが評価と答えを返す
// ・ジャンルは6つを2日で一巡（日ごとに3つ。並びは2日ごとに入れかわる）
// ・作った問題は画面が days/<日付>.quiz に保存する。今日の分がもうあれば、作り直さずにそれを返す（端末が2つでも1セット）
const QUIZ_GENRES = ["哲学", "文学", "心理学", "経済学", "想像力・発想力", "企画力"];
function quizGenres(date: string) {
  const n = Math.floor(Date.parse(date + "T00:00:00Z") / 864e5);
  let h = Math.imul(Math.floor(n / 2) + 7, 2654435761) >>> 0; const order = QUIZ_GENRES.slice();
  for (let i = order.length - 1; i > 0; i--) { h = (Math.imul(h, 1103515245) + 12345) >>> 0; const j = h % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  return n % 2 ? order.slice(3) : order.slice(0, 3);
}
async function useStart(uid: string, now: number) {
  const today = logicalDate(now); const month = today.slice(0, 7);
  const use0 = (await one(uid, "meta", "chatuse")) || {};
  const use = { month, in: 0, out: 0, cr: 0, cw: 0, usd: 0, calls: 0, ...(use0.month === month ? use0 : {}), day: today, dayCalls: use0.day === today ? (use0.dayCalls || 0) : 0 };
  if (use.dayCalls >= DAY_LIMIT) throw new Fail("day_limit", `今日はもう${DAY_LIMIT}回話した（使いすぎ防止）`);
  return use;
}
async function useEnd(uid: string, use: any, u: any, now: number) {
  const usage = { in: u.input_tokens || 0, out: u.output_tokens || 0, cr: u.cache_read_input_tokens || 0, cw: u.cache_creation_input_tokens || 0 };
  const usd = (usage.in * PRICE.in + usage.out * PRICE.out + usage.cr * PRICE.cr + usage.cw * PRICE.cw) / 1e6;
  const next = { ...use, in: use.in + usage.in, out: use.out + usage.out, cr: use.cr + usage.cr, cw: use.cw + usage.cw, usd: Math.round((use.usd + usd) * 1e5) / 1e5, calls: use.calls + 1, dayCalls: use.dayCalls + 1, at: now };
  await admin.from("docs").upsert({ user_id: uid, collection: "meta", id: "chatuse", data: next });
  return { usd: Math.round(usd * 1e5) / 1e5, monthUsd: next.usd, dayCalls: next.dayCalls, dayLimit: DAY_LIMIT };
}
const jsonOf = (t: string) => { const m = t.match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch (_) { return null; } };
const textOf = (r: any) => (r.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
// 決めた形（input_schema）で答えさせる：tool_choice で道具を1つ指定すると、引数が必ずその形の JSON になる
const toolInput = (r: any, name: string) => { const b = (r.content || []).find((x: any) => x.type === "tool_use" && x.name === name); return b ? b.input : jsonOf(textOf(r)); };
const STR = { type: "string" };
const QUIZ_TOOL = { name: "give_quiz", description: "今日の3問を渡す", input_schema: { type: "object", properties: { qs: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", properties: { genre: STR, title: STR, prompt: STR, sec: { type: "integer", enum: [30, 60] }, trains: STR, ref: STR }, required: ["genre", "title", "prompt", "sec", "trains", "ref"] } } }, required: ["qs"] } };
const REVIEW_TOOL = { name: "give_review", description: "3問の評価と答えを渡す", input_schema: { type: "object", properties: { items: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", properties: { good: STR, angle: STR, answer: STR }, required: ["good", "angle", "answer"] } }, overall: STR }, required: ["items", "overall"] } };

async function quizMake(uid: string) {
  if (!KEY) throw new Fail("no_key", "サーバーに ANTHROPIC_API_KEY がまだ入っていない");
  const now = Date.now(); const today = logicalDate(now);
  const day = await one(uid, "days", today);
  if (Array.isArray(day?.quiz?.qs) && day.quiz.qs.length === 3) return { quiz: { date: today, qs: day.quiz.qs, again: true } };
  const use = await useStart(uid, now);
  const past = (await col(uid, "days", { from: addDays(today, -90), to: addDays(today, -1) })).sort((a, b) => a.id.localeCompare(b.id));
  const recent = past.flatMap(r => (r.data?.quiz?.qs || []).map((q: any) => `- ${q.genre}［${q.title}］${cut(q.prompt, 50)}`)).slice(-90);
  const genres = quizGenres(today);
  const ask = [
    "山浦（21歳。マイクラ建築・3DCG・YouTube・ゲーム・アニメが身近）が、ペットの育成のために毎日3問だけ答える。目的は、知識と考える力を少しずつ積み上げることと、答えられた手ごたえで自己肯定感を育てること。",
    `今日の3問のジャンル（この順で1問ずつ）：${genres.join("／")}`,
    "",
    "問題の条件：",
    "- 30秒〜1分で、自由に一言〜数行で答えられる。正解が1つに決まらず、どんな答えにも良いところを見つけられる",
    "- 問題文だけで答えられる（前提知識がいらない）。知識は、答えたあとの「答え・元ネタ」で渡す",
    "- 形式を毎回変える：思考実験／もしも／今日の言葉で短文／逆から考える／2択と理由／名前をつける／組み合わせる／一言で定義する／身近なものの別の使い道／架空の店・道具・ルールを作る など。3問で同じ形式を使わない",
    "- 抽象的すぎない。具体的な場面やモノを1つ入れる。ゲーム・ネット・街・食べ物など身近な題材を混ぜてよい（毎回マイクラにしない）",
    "- よく知られた定番（テセウスの船・トロッコ問題・残響など）は、最近出していなくても週に1回まで。まだ出していない題材を優先する",
    "- 重すぎる題材（死・病気・お金の不安・人間関係のつらさ）は避ける。説教・自己啓発っぽくしない",
    "- 哲学・心理学・経済学・文学の問題は、実在する考え方・実験・用語・作品に結びつける（ref に書く。確かなものだけ。あやしい人名や数字は書かない）",
    recent.length ? `\n最近出した問題（同じ題材・同じ問いは避ける）：\n${recent.join("\n")}` : "",
    "",
    "give_quiz で渡す。各問：genre（上のジャンル）、title（ミッション名・12字以内。「形式：題材」の形）、prompt（問題文・90字以内。やわらかいタメ口で、「〜してください」は使わない）、sec（30 か 60。短文を作る問題は 60）、trains（鍛えられる力・25字以内）、ref（答えのあとに紹介する元ネタ・用語・人物・40字以内）。",
  ].join("\n");
  const r = await anthropic({ model: MODEL, max_tokens: 1500, tools: [QUIZ_TOOL], tool_choice: { type: "tool", name: "give_quiz" }, messages: [{ role: "user", content: ask }] });
  const used = await useEnd(uid, use, r.usage || {}, now);
  const j = toolInput(r, "give_quiz"); const raw = Array.isArray(j?.qs) ? j.qs : [];
  if (raw.length !== 3) console.error("quiz parse", JSON.stringify(r.content || []).slice(0, 1500));
  const qs = raw.slice(0, 3).map((q: any, i: number) => ({
    id: `q${i + 1}`, genre: genres.includes(q?.genre) ? q.genre : genres[i], title: cut(String(q?.title || "").trim(), 24), prompt: cut(String(q?.prompt || "").trim(), 160),
    sec: Number(q?.sec) >= 60 ? 60 : 30, trains: cut(String(q?.trains || "").trim(), 40), ref: cut(String(q?.ref || "").trim(), 80),
  })).filter((q: any) => q.title && q.prompt);
  if (qs.length !== 3) throw new Fail("api", "問題をうまく作れなかった。もう一度押してみて");
  return { quiz: { date: today, qs }, used };
}

async function quizReview(uid: string, quiz: any) {
  if (!KEY) throw new Fail("no_key", "サーバーに ANTHROPIC_API_KEY がまだ入っていない");
  const qs = Array.isArray(quiz?.qs) ? quiz.qs.slice(0, 3) : []; const ans = Array.isArray(quiz?.ans) ? quiz.ans.slice(0, 3) : [];
  if (qs.length !== 3) throw new Fail("bad_request", "問題がない");
  const now = Date.now(); const use = await useStart(uid, now);
  const settings = await one(uid, "settings", "main"); const pet = (await one(uid, "pet", "main")) || {};
  const petName = pet.name || "ペット"; const pref = cut(String(settings?.chatPrompt || "").trim(), 12000);
  const base = [
    `あなたは、山浦の生活アプリ「Daylog」の中にいるペット「${petName}」。山浦が育成のために今日の3問に答えた。ペットとして、評価と答えを返す。`,
    "・画面に出せる形：太字（**ことば**）と改行だけ。",
    "・点数はつけない。比べない。叱らない。空欄（スキップ）は責めず、その問題は答え・元ネタだけを渡す。",
    "・答えの事実（人物・用語・作品・実験）は確かなものだけ。あやしいときは名前を出さずに考え方だけを書く。",
    "・あなたが山浦の事を助けるつもりで全力でサポートしてください。",
    pref ? `\n――山浦が書いた指示（キャラ・口調はこれに従う。長さはこの返事の決まりを優先）――\n${pref}` : "・日本語で、やさしく短く。",
  ].join("\n");
  const body = qs.map((q: any, i: number) => `【${i + 1}】${q.genre}［${q.title}］\n問題：${q.prompt}\n鍛えられる：${q.trains}\n元ネタの候補：${q.ref}\n山浦の答え：${cut(String(ans[i] || "").trim(), 600) || "（スキップ）"}`).join("\n\n");
  const ask = [
    body, "",
    "それぞれの問題に：",
    "- good：答えの良かったところを具体的に1つ（山浦の言葉を短く引用する。40〜80字。スキップなら空）",
    "- angle：別の見方を1つ（40〜80字）",
    "- answer：答え・元ネタ（用語・人物・作品・実験と、その考え方。60〜140字）",
    "最後に overall：3問ぜんぶを見たペットからのひとこと（2文・80字以内。できたことを認める）",
    "give_review で、問題の順に items を3つと overall を渡す。",
  ].join("\n");
  const r = await anthropic({ model: MODEL, max_tokens: 1800, system: [{ type: "text", text: base, cache_control: { type: "ephemeral" } }], tools: [REVIEW_TOOL], tool_choice: { type: "tool", name: "give_review" }, messages: [{ role: "user", content: ask }] });
  const used = await useEnd(uid, use, r.usage || {}, now);
  const j = toolInput(r, "give_review");
  if (!j || !Array.isArray(j.items)) console.error("review parse", JSON.stringify(r.content || []).slice(0, 1500));
  if (!j || !Array.isArray(j.items)) throw new Fail("api", "評価をうまく作れなかった。もう一度押してみて");
  const items = [0, 1, 2].map(i => { const x = j.items[i] || {}; return { good: cut(String(x.good || "").trim(), 200), angle: cut(String(x.angle || "").trim(), 200), answer: cut(String(x.answer || "").trim(), 320) }; });
  return { review: { items, overall: cut(String(j.overall || "").trim(), 200) }, used };
}

async function cronSecret() { const { data } = await admin.from("push_keys").select("value").eq("key", "cron_secret").maybeSingle(); return data?.value || ""; }
// 持ち主だけ（2026-11-28）：Claude API のお金を使うので、push_keys の owner_uid と同じアカウントだけ通す。見つからなければ断る
async function ownerUid() { const { data } = await admin.from("push_keys").select("value").eq("key", "owner_uid").maybeSingle(); return data?.value || ""; }

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
    const owner = await ownerUid();
    if (!owner || uid !== owner) return json({ error: { code: "forbidden", message: "この Daylog の持ち主だけが使える" } }, 403);
    if (b.kind === "quiz") return json(await quizMake(uid));
    if (b.kind === "quizReview") return json(await quizReview(uid, b.quiz));
    return json(await chat(uid, b.messages, b.kind === "night" ? "night" : ""));
  } catch (e) {
    const f = e instanceof Fail ? e : new Fail("internal", String((e as Error)?.message || e));
    if (!(e instanceof Fail)) console.error(e);
    return json({ error: { code: f.code, message: f.message } }); // アプリで扱うエラーは 200 で返す（claude.ai版のデータベース経由でも読めるように）
  }
});
