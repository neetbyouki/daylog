// Daylog のバックアップ係：Googleドライブの「Daylog バックアップ」フォルダに、記録をまるごと JSON で保存する
// ・毎週月曜4:30（日本時間）に pg_cron から { mode: "weekly" }（合言葉 x-cron-secret 付き）
// ・アプリの「今すぐ保存」は docs の meta/backupreq に時刻を書く → 1分ごとの見回り（backup_tick）が { mode: "req" } で呼ぶ
// ・結果は docs の meta/backup に書く（アプリの設定に「最後に保存した日時」として出る）
// ・ドライブは drive.file の許可だけを使う（Daylogが作ったファイルしか見えない・消せない）。新しい順に12個残し、古いものは消す
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GSECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
const KEEP = 12;
const FOLDER = "Daylog バックアップ";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const pad = (n: number) => String(n).padStart(2, "0");
const jstStamp = (t: number) => { const d = new Date(t + 9 * 3600e3); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`; };

class Fail extends Error { constructor(public code: string, msg: string) { super(msg); } }

async function cronSecret() {
  const { data } = await admin.from("push_keys").select("value").eq("key", "cron_secret").maybeSingle();
  return data?.value || "";
}
async function accessToken(uid: string) {
  const { data } = await admin.from("google_tokens").select("refresh_token").eq("user_id", uid).maybeSingle();
  if (!data || !GID || !GSECRET) throw new Fail("no_google", "Googleの許可がない");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: GID, client_secret: GSECRET, refresh_token: data.refresh_token, grant_type: "refresh_token" }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Fail("needs_reauth", "Googleの許可が切れた");
  if (j.scope && !String(j.scope).includes("drive.file")) throw new Fail("scope", "ドライブへの保存が許可されていない");
  return j.access_token as string;
}
async function drive(tok: string, method: string, url: string, body?: BodyInit | null, headers: Record<string, string> = {}) {
  const r = await fetch(url, { method, headers: { Authorization: "Bearer " + tok, ...headers }, body });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const reason = j?.error?.errors?.[0]?.reason || j?.error?.status || "";
    if (r.status === 403 && /insufficient|PERMISSION_DENIED/i.test(String(reason) + JSON.stringify(j))) {
      if (/accessNotConfigured|has not been used|is disabled/i.test(JSON.stringify(j))) throw new Fail("api_off", "Google Drive API が有効になっていない");
      throw new Fail("scope", "ドライブへの保存が許可されていない");
    }
    if (r.status === 403 && /accessNotConfigured|has not been used|is disabled/i.test(JSON.stringify(j))) throw new Fail("api_off", "Google Drive API が有効になっていない");
    if (r.status === 401) throw new Fail("needs_reauth", "Googleの許可が切れた");
    throw new Fail("drive", `ドライブがエラーを返した（${r.status} ${reason}）`);
  }
  return j;
}
async function folderId(tok: string, known?: string) {
  if (known) {
    const f = await drive(tok, "GET", `https://www.googleapis.com/drive/v3/files/${known}?fields=id,trashed`).catch(() => null);
    if (f && f.id && !f.trashed) return known;
  }
  const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const l = await drive(tok, "GET", `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
  if (l.files && l.files[0]) return l.files[0].id as string;
  const c = await drive(tok, "POST", "https://www.googleapis.com/drive/v3/files?fields=id", JSON.stringify({ name: FOLDER, mimeType: "application/vnd.google-apps.folder" }), { "Content-Type": "application/json" });
  return c.id as string;
}
async function allDocs(uid: string) {
  const out: any[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await admin.from("docs").select("collection,id,data,updated_at").eq("user_id", uid).order("collection").order("id").range(from, from + 499);
    if (error) throw new Fail("db", error.message);
    out.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return out;
}
// 画像は Storage にある（docs の blobs は場所だけ）。バックアップには中身も入れる（data: URL）
function bytesToB64(bytes: Uint8Array) {
  let s = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}
async function withImages(rows: any[]) {
  const st = admin.storage.from("daylog-images"); let missing = 0;
  for (const r of rows) {
    if (r.collection !== "blobs" || !r.data || r.data.src || !r.data.path) continue;
    const { data, error } = await st.download(r.data.path);
    if (error || !data) { missing++; continue; }
    r.data = { ...r.data, src: `data:${r.data.mime || "image/jpeg"};base64,` + bytesToB64(new Uint8Array(await data.arrayBuffer())) };
  }
  return missing;
}
async function setState(uid: string, patch: Record<string, unknown>) {
  const { data } = await admin.from("docs").select("data").eq("user_id", uid).eq("collection", "meta").eq("id", "backup").maybeSingle();
  const next = { ...(data?.data || {}), ...patch };
  await admin.from("docs").upsert({ user_id: uid, collection: "meta", id: "backup", data: next });
  return next;
}

async function backupFor(uid: string, reason: string, reqAt?: number) {
  const now = Date.now();
  const prev = await setState(uid, { busyAt: now });
  try {
    const tok = await accessToken(uid);
    const rows = await allDocs(uid);
    const imgMissing = await withImages(rows);
    const collections: Record<string, Record<string, unknown>> = {}; const counts: Record<string, number> = {};
    for (const r of rows) {
      if (r.collection === "meta" && (r.id === "backup" || r.id === "backupreq")) continue;
      (collections[r.collection] ||= {})[r.id] = r.data; counts[r.collection] = (counts[r.collection] || 0) + 1;
    }
    const body = JSON.stringify({ app: "Daylog", kind: "backup", format: 1, reason, exportedAt: new Date(now).toISOString(), counts, imgMissing, collections });
    const fid = await folderId(tok, (prev as any).folderId);
    const name = `Daylog-${jstStamp(now)}${reason === "weekly" ? "" : "-手動"}.json`;
    // 大きくても途切れないよう、2回に分けて送る（resumable）
    const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size", {
      method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/json" },
      body: JSON.stringify({ name, parents: [fid], mimeType: "application/json", appProperties: { daylog: "backup" } }),
    });
    if (!init.ok) { const t = await init.text(); if (/accessNotConfigured|has not been used|is disabled/i.test(t)) throw new Fail("api_off", "Google Drive API が有効になっていない"); if (init.status === 403) throw new Fail("scope", "ドライブへの保存が許可されていない"); throw new Fail("drive", `アップロードを始められなかった（${init.status}）`); }
    const loc = init.headers.get("Location"); if (!loc) throw new Fail("drive", "アップロード先がない");
    const up = await fetch(loc, { method: "PUT", headers: { "Content-Type": "application/json" }, body });
    const file = await up.json().catch(() => ({}));
    if (!up.ok || !file.id) throw new Fail("drive", `アップロードに失敗した（${up.status}）`);
    // 古いものを片付ける（Daylogが作った JSON だけ）
    const q = encodeURIComponent(`'${fid}' in parents and trashed=false and mimeType='application/json'`);
    const l = await drive(tok, "GET", `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&fields=files(id,name)&pageSize=100`);
    for (const f of (l.files || []).slice(KEEP)) await drive(tok, "DELETE", `https://www.googleapis.com/drive/v3/files/${f.id}`).catch(() => {});
    return await setState(uid, { ok: true, at: now, reason, file: { id: file.id, name, size: Number(file.size || body.length) }, folderId: fid, err: null, errMsg: null, busyAt: 0, reqAt: reqAt ?? (prev as any).reqAt ?? 0, counts });
  } catch (e: any) {
    const code = e instanceof Fail ? e.code : "internal";
    console.error(uid, code, e?.message || e);
    return await setState(uid, { ok: false, triedAt: now, err: code, errMsg: String(e?.message || e).slice(0, 200), busyAt: 0, reqAt: reqAt ?? (prev as any).reqAt ?? 0 });
  }
}

Deno.serve(async (req) => {
  try {
    const sec = await cronSecret();
    if (!sec || req.headers.get("x-cron-secret") !== sec) return json({ error: "forbidden" }, 403);
    const b = await req.json().catch(() => ({}));
    const res: Record<string, unknown> = {};
    if (b.mode === "weekly") {
      const { data } = await admin.from("google_tokens").select("user_id");
      for (const r of data || []) res[r.user_id] = (await backupFor(r.user_id, "weekly")).ok;
    } else {
      // アプリで「今すぐ保存」が押された人だけ
      const { data: reqs } = await admin.from("docs").select("user_id,data").eq("collection", "meta").eq("id", "backupreq");
      for (const r of reqs || []) {
        const at = Number(r.data?.at || 0);
        const { data: st } = await admin.from("docs").select("data").eq("user_id", r.user_id).eq("collection", "meta").eq("id", "backup").maybeSingle();
        if (at > Number(st?.data?.reqAt || 0)) res[r.user_id] = (await backupFor(r.user_id, "manual", at)).ok;
      }
    }
    return json({ ok: true, res });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
