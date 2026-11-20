/* REAC inbox — Cloudflare Worker (бесплатного тарифа хватает с запасом).
   Маршруты:
     POST /board   — объявление с сайта → карточка в Discord с кнопками «Принять / Отклонить»
     POST /form    — заявление/формуляр (embed + PNG-картинка) → в канал Discord
     POST /discord — сюда Discord присылает нажатия кнопок (Interactions Endpoint URL)
   Секреты (wrangler secret put ИМЯ):
     DISCORD_PUBLIC_KEY, DISCORD_APP_ID, DISCORD_BOT_TOKEN,
     BOARD_CHANNEL_ID   — канал, куда падают объявления на проверку
     MOD_ROLE_ID        — роль, которой разрешено нажимать кнопки
     FORMS_WEBHOOK      — URL вебхука канала для заявлений
     GITHUB_TOKEN       — fine-grained токен, Contents: Read and write, только репозиторий REAC */

const J = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...h } });
const cors = (env) => ({ "access-control-allow-origin": env.ALLOWED_ORIGIN, "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS", "access-control-allow-headers": "content-type, authorization, accept", "access-control-max-age": "86400", "vary": "origin" });
const clip = (s, n) => String(s == null ? "" : s).replace(/\r/g, "").trim().slice(0, n);
const safe = (s) => String(s).replace(/@(everyone|here)/gi, "@\u200b$1").replace(/<@/g, "<\u200b@"); /* без массовых упоминаний */
const NO_PING = { parse: [] };
const hex = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), C = cors(env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: C });
    try {
      if (url.pathname === "/discord" && req.method === "POST") return await interaction(req, env, ctx);
      if (url.pathname.startsWith("/raw/") && req.method === "GET") return await rawFile(url, env, C); /* публичное чтение json-файлов сайта */
      if (req.headers.get("origin") !== env.ALLOWED_ORIGIN) return req.method === "GET" && url.pathname === "/" ? new Response("REAC inbox") : J({ error: "forbidden" }, 403, C);
      if (url.pathname.startsWith("/gh/")) return await ghProxy(req, url, env, C); /* прокси к api.github.com для владельца сайта */
      if (req.method !== "POST") return J({ error: "not found" }, 404, C);
      const ip = req.headers.get("cf-connecting-ip") || "?";
      const out = ([body, status = 200]) => J(body, status, C);
      if (url.pathname === "/board") return out(await board(req, env, ip));
      if (url.pathname === "/form") return out(await form(req, env, ip));
      return J({ error: "not found" }, 404, C);
    } catch (e) { return J({ error: "server", detail: String(e && e.message || e) }, 500, C); }
  },
};

/* GET /raw/board.json — свежий файл из репозитория (через API с токеном воркера: без пятиминутного кеша raw.githubusercontent.com) */
const RAW_OK = new Set(["board.json", "events.json", "stories.json", "data.json"]);
async function rawFile(url, env, C) {
  const name = decodeURIComponent(url.pathname.slice(5));
  if (!RAW_OK.has(name)) return J({ error: "not found" }, 404, C);
  const H = { "user-agent": "reac-inbox", accept: "application/vnd.github.raw+json", ...(env.GITHUB_TOKEN ? { authorization: "Bearer " + env.GITHUB_TOKEN } : {}) };
  let r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/contents/${name}?ref=${env.GH_BRANCH}`, { headers: H });
  if (!r.ok) r = await fetch(`https://raw.githubusercontent.com/${env.GH_REPO}/${env.GH_BRANCH}/${name}`, { headers: { "user-agent": "reac-inbox" } });
  if (!r.ok) return J({ error: "github " + r.status }, 502, C);
  return new Response(await r.text(), { status: 200, headers: { ...C, "access-control-allow-origin": "*", "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

/* /gh/repos/<репозиторий>/... → https://api.github.com/repos/<репозиторий>/...  Только наш репозиторий.
   Токен владельца приходит из его браузера в заголовке Authorization и здесь нигде не сохраняется. */
async function ghProxy(req, url, env, C) {
  const path = url.pathname.slice(3), base = "/repos/" + env.GH_REPO;
  if (!(path === base || path.startsWith(base + "/contents/") || path.startsWith(base + "/commits"))) return J({ error: "forbidden path" }, 403, C);
  const h = new Headers({ "user-agent": "reac-inbox", accept: req.headers.get("accept") || "application/vnd.github+json" });
  const auth = req.headers.get("authorization");
  if (auth) h.set("authorization", auth); else if (req.method === "GET" && env.GITHUB_TOKEN) h.set("authorization", "Bearer " + env.GITHUB_TOKEN); /* чтение публичных данных без токена — от имени воркера */
  const ct = req.headers.get("content-type"); if (ct) h.set("content-type", ct);
  const r = await fetch("https://api.github.com" + path + url.search, { method: req.method, headers: h, body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer() });
  const out = new Headers(C); out.set("content-type", r.headers.get("content-type") || "application/json"); out.set("cache-control", "no-store");
  return new Response(r.body, { status: r.status, headers: out });
}

/* простой лимит: не больше N запросов с одного IP за час */
async function limited(env, kind, ip, max) {
  const k = `rl:${kind}:${ip}:${Math.floor(Date.now() / 3600000)}`, n = +(await env.INBOX.get(k)) || 0;
  if (n >= max) return true;
  await env.INBOX.put(k, String(n + 1), { expirationTtl: 3700 });
  return false;
}

/* ---------- 1. объявление с сайта → Discord на проверку ---------- */
async function board(req, env, ip) {
  const b = await req.json().catch(() => ({}));
  if (b.website) return [{ ok: true }]; /* ловушка для ботов: скрытое поле заполнено */
  const note = { author: clip(b.author, 80), place: clip(b.place, 80), title: clip(b.title, 80), text: clip(b.text, 1500) };
  if (note.text.length < 5) return [{ error: "Слишком короткий текст" }, 400];
  if (await limited(env, "board", ip, 3)) return [{ error: "Слишком много сообщений, попробуйте позже" }, 429];
  const id = "n-" + crypto.randomUUID().slice(0, 8);
  await env.INBOX.put("pend:" + id, JSON.stringify(note), { expirationTtl: 14 * 86400 });
  const r = await dApi(env, `/channels/${env.BOARD_CHANNEL_ID}/messages`, {
    embeds: [{ title: "📌 Новое объявление на проверку", color: 0xffc72c,
      fields: [{ name: "Автор", value: safe(note.author || "—"), inline: true }, { name: "Где / подпись", value: safe(note.place || "—"), inline: true },
        ...(note.title ? [{ name: "Заголовок", value: safe(note.title) }] : []), { name: "Текст", value: safe(note.text).slice(0, 1024) }],
      footer: { text: "ID " + id } }],
    components: [{ type: 1, components: [{ type: 2, style: 3, label: "Принять", custom_id: "ok:" + id }, { type: 2, style: 4, label: "Отклонить", custom_id: "no:" + id }] }],
    allowed_mentions: NO_PING });
  if (!r.ok) { const d = await r.json().catch(() => ({})); console.log("discord board error", r.status, JSON.stringify(d)); return [{ error: `Не удалось отправить на проверку (Discord ${r.status}${d.code ? ", код " + d.code : ""}: ${d.message || "без пояснения"})` }, 502]; }
  return [{ ok: true }];
}

/* ---------- 2. заявление: embed + картинка → Discord ---------- */
async function form(req, env, ip) {
  const fd = await req.formData();
  if (fd.get("website")) return [{ ok: true }];
  if (await limited(env, "form", ip, 10)) return [{ error: "Слишком много отправок, попробуйте позже" }, 429];
  let fields = []; try { fields = JSON.parse(fd.get("fields") || "[]"); } catch (e) {}
  const title = clip(fd.get("title"), 200) || "Заявление", ref = clip(fd.get("ref"), 60), who = clip(fd.get("who"), 80);
  const img = fd.get("image"), text = clip(fd.get("text"), 3800);
  const embed = { title: safe(title), color: 0xffc72c, footer: { text: ref ? "Формуляр " + ref : "Формуляр" }, timestamp: new Date().toISOString(),
    ...(who ? { author: { name: safe(who) } } : {}),
    fields: fields.slice(0, 20).map((f) => ({ name: safe(clip(f.l, 250) || "—"), value: safe(clip(f.v, 1000) || "—"), inline: !!f.i && clip(f.v, 1000).length < 40 })) };
  const isImg = img && typeof img !== "string" && img.size > 0 && img.size < 4e6 && /^image\/(png|webp|jpeg)$/.test(img.type);
  if (isImg) embed.image = { url: "attachment://formular.png" };
  else if (!fields.length) embed.description = "```\n" + text.slice(0, 3900) + "\n```";
  const out = new FormData();
  out.append("payload_json", JSON.stringify({ embeds: [embed], allowed_mentions: NO_PING, ...(isImg ? { attachments: [{ id: 0, filename: "formular.png" }] } : {}) }));
  if (isImg) out.append("files[0]", img, "formular.png");
  const r = await fetch(env.FORMS_WEBHOOK + "?wait=true", { method: "POST", body: out });
  if (!r.ok) return [{ error: "Discord отклонил отправку (" + r.status + ")" }, 502];
  return [{ ok: true }];
}

/* ---------- 3. нажатия кнопок в Discord ---------- */
async function interaction(req, env, ctx) {
  const body = await req.text(), sig = req.headers.get("x-signature-ed25519"), ts = req.headers.get("x-signature-timestamp");
  if (!sig || !ts || !(await verify(env.DISCORD_PUBLIC_KEY, sig, ts + body))) return new Response("bad signature", { status: 401 });
  const i = JSON.parse(body);
  if (i.type === 1) return J({ type: 1 }); /* PING при сохранении адреса в портале Discord */
  if (i.type !== 3) return J({ type: 6 });
  const [act, id] = String(i.data.custom_id || "").split(":"), who = i.member && i.member.user ? i.member.user.id : "";
  if (!(i.member && i.member.roles || []).includes(env.MOD_ROLE_ID))
    return J({ type: 4, data: { content: "Нет прав: кнопки доступны только модераторам.", flags: 64 } });
  ctx.waitUntil(decide(env, i, act, id, who));
  return J({ type: 6 }); /* «принято», дальше обновим сообщение сами — GitHub может отвечать дольше 3 секунд */
}
async function decide(env, i, act, id, who) {
  const edit = (embed, extra) => fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APP_ID}/${i.token}/messages/@original`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ embeds: [embed], components: [], allowed_mentions: NO_PING, ...extra }) });
  const base = i.message.embeds[0], raw = await env.INBOX.get("pend:" + id);
  if (!raw) return edit({ ...base, color: 0x888888, title: "⌛ Заявка уже обработана или устарела" });
  if (act === "no") { await env.INBOX.delete("pend:" + id); return edit({ ...base, color: 0xe0584a, title: "❌ Отклонено", footer: { text: `ID ${id} · отклонил(а) модератор` } }, { content: `Отклонил(а) <@${who}>` }); }
  try {
    const n = JSON.parse(raw), d = new Date(), p = (x) => String(x).padStart(2, "0"), tz = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
    const note = { id, author: n.author, text: n.text, date: `${p(tz.getDate())}.${p(tz.getMonth() + 1)}.${tz.getFullYear()} ${p(tz.getHours())}:${p(tz.getMinutes())}`, place: n.place, title: n.title, role: "" };
    Object.keys(note).forEach((k) => { if (!note[k]) delete note[k]; });
    await publish(env, note);
    await env.INBOX.delete("pend:" + id);
    return edit({ ...base, color: 0x5fb878, title: "✅ Опубликовано на сайте", footer: { text: `ID ${id} · примерно через минуту появится на сайте` } }, { content: `Принял(а) <@${who}>` });
  } catch (e) { return edit({ ...base, color: 0xe0584a, title: "⚠️ Не удалось опубликовать: " + String(e.message).slice(0, 150) }, { components: i.message.components }); }
}

/* коммит в board.json: свежая версия → добавить → записать (с повтором при конфликте) */
async function publish(env, note) {
  const api = `https://api.github.com/repos/${env.GH_REPO}/contents/board.json`, H = { authorization: "Bearer " + env.GITHUB_TOKEN, accept: "application/vnd.github+json", "user-agent": "reac-inbox" };
  for (let t = 0; t < 3; t++) {
    const r = await fetch(`${api}?ref=${env.GH_BRANCH}`, { headers: H });
    let notes = [], sha;
    if (r.ok) { const j = await r.json(); sha = j.sha; const a = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(j.content.replace(/\s/g, "")), (c) => c.charCodeAt(0)))); notes = Array.isArray(a) ? a : a.notes || []; }
    else if (r.status !== 404) throw new Error("GitHub " + r.status);
    const text = JSON.stringify({ notes: [note, ...notes.filter((x) => x.id !== note.id)] }, null, 2) + "\n", bytes = new TextEncoder().encode(text);
    let bin = ""; for (let k = 0; k < bytes.length; k += 8192) bin += String.fromCharCode(...bytes.subarray(k, k + 8192));
    const p = await fetch(api, { method: "PUT", headers: H, body: JSON.stringify({ message: "Объявление с сайта: " + (note.title || note.author || note.id).slice(0, 50), content: btoa(bin), branch: env.GH_BRANCH, ...(sha ? { sha } : {}) }) });
    if (p.ok) return;
    if (p.status !== 409 && p.status !== 422) throw new Error("GitHub " + p.status);
  }
  throw new Error("конфликт записи, нажмите кнопку ещё раз");
}

const dApi = (env, path, body) => fetch("https://discord.com/api/v10" + path, { method: "POST", headers: { authorization: "Bot " + env.DISCORD_BOT_TOKEN, "content-type": "application/json" }, body: JSON.stringify(body) });

async function verify(pub, sig, msg) {
  const data = new TextEncoder().encode(msg);
  for (const alg of ["Ed25519", "NODE-ED25519"]) { /* имя алгоритма зависит от версии рантайма */
    try { const k = await crypto.subtle.importKey("raw", hex(pub), alg === "Ed25519" ? "Ed25519" : { name: alg, namedCurve: "NODE-ED25519" }, false, ["verify"]); return await crypto.subtle.verify(alg === "Ed25519" ? "Ed25519" : { name: alg }, k, hex(sig), data); } catch (e) {}
  }
  return false;
}
