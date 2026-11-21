// Daylog の画像係：ノートの画像を Storage（バケット daylog-images、非公開）に出し入れする
// ・呼ぶのはデータベースだけ（daylog_private.img_call が合言葉 x-cron-secret 付きで呼ぶ）。claude.ai版は SQL しか使えないので、ここを通して読み書きする
// ・アプリ版は Storage を直接使う（自分のフォルダ <user_id>/ だけ読み書きできる決まり）
// ・置き場所は <user_id>/<画像のid>.<拡張子>。画像の大きさ・どのノートのものか などは docs の blobs に残す（中身は入れない）
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
const BUCKET = "daylog-images";
const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID = /^[A-Za-z0-9_.:-]{1,100}$/;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

const b64ToBytes = (b64: string) => { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
function bytesToB64(bytes: Uint8Array) {
  let s = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}
export const pathFor = (uid: string, id: string, mime: string) => `${uid}/${id}.${MIME_EXT[mime] || "jpg"}`;

async function cronSecret() {
  const { data } = await admin.from("push_keys").select("value").eq("key", "cron_secret").maybeSingle();
  return data?.value || "";
}

Deno.serve(async (req) => {
  try {
    const sec = await cronSecret();
    if (!sec || req.headers.get("x-cron-secret") !== sec) return json({ error: "forbidden" }, 403);
    const b = await req.json().catch(() => ({}));
    const uid = String(b.uid || "");
    if (!UUID.test(uid)) return json({ error: "bad uid" }, 400);
    const st = admin.storage.from(BUCKET);

    if (b.op === "put") {
      // { uid, id, mime, b64 } → 置いた場所を返す
      const id = String(b.id || ""); const mime = String(b.mime || "image/jpeg");
      if (!ID.test(id) || !MIME_EXT[mime] || typeof b.b64 !== "string") return json({ error: "bad put" }, 400);
      const bytes = b64ToBytes(b.b64);
      if (bytes.length > 3 * 1024 * 1024) return json({ error: "too large" }, 400);
      const path = pathFor(uid, id, mime);
      const { error } = await st.upload(path, bytes, { contentType: mime, upsert: true });
      if (error) return json({ error: error.message }, 500);
      return json({ path, size: bytes.length });
    }

    if (b.op === "get") {
      // { uid, paths: [...] } → { 場所: base64 }（見つからないものは入れない）
      const paths: string[] = Array.isArray(b.paths) ? b.paths.slice(0, 20).map(String) : [];
      const out: Record<string, string> = {};
      await Promise.all(paths.map(async (p) => {
        if (!p.startsWith(uid + "/") || p.includes("..")) return;
        const { data, error } = await st.download(p);
        if (error || !data) return;
        out[p] = bytesToB64(new Uint8Array(await data.arrayBuffer()));
      }));
      return json({ files: out });
    }

    if (b.op === "del") {
      // { uid, paths: [...] }
      const paths: string[] = (Array.isArray(b.paths) ? b.paths : []).map(String).filter((p: string) => p.startsWith(uid + "/") && !p.includes(".."));
      if (paths.length) { const { error } = await st.remove(paths); if (error) return json({ error: error.message }, 500); }
      return json({ ok: true });
    }

    return json({ error: "unknown op" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
