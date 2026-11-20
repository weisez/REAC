/* ===== отправка в Discord через REAC inbox (Cloudflare Worker, см. worker/README.md) =====
   1) «Отправить на проверку» на доске объявлений: сообщение уходит модераторам в Discord с кнопками «Принять / Отклонить».
   2) «Отправить в Discord» у формуляров: красивая карточка (embed) + картинка-бланк (PNG) с готовым текстом заявления.
   Пока в CFG.inbox (js/01-core.js) не указан адрес воркера, кнопки на сайте не показываются. */
const dcOn = () => !!CFG.inbox;
const dcUrl = (p) => CFG.inbox.replace(/\/$/, "") + p;
const dcTrap = `<input type="text" name="website" id="dcw" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">`;

async function dcPost(path, body, isJson) {
  const r = await fetch(dcUrl(path), { method: "POST", ...(isJson ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "ошибка " + r.status);
  return j;
}
const dcBusy = (b, on, txt) => { if (!b) return; if (on) { b.dataset.t = b.textContent; b.textContent = txt || "Отправляю…"; b.disabled = true; } else { b.textContent = b.dataset.t || b.textContent; b.disabled = false; } };

/* ---------- бланк-картинка ---------- */
async function dcPaperPNG(f, text) {
  try { await document.fonts.load('400 22px "Source Serif 4"'); await document.fonts.load('600 22px "Source Serif 4"'); } catch (e) {}
  const W = 1000, pad = 58, fs = 22, lh = 33, SER = '"Source Serif 4", Georgia, "Times New Roman", serif', MONO = '"IBM Plex Mono", ui-monospace, monospace';
  const m = document.createElement("canvas").getContext("2d"); m.font = `400 ${fs}px ${SER}`;
  const maxW = W - pad * 2, lines = [];
  const fit = (w) => { /* очень длинное слово (ссылка) — режем по символам */ const out = []; let cur = ""; for (const ch of w) { if (m.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; } else cur += ch; } out.push(cur); return out; };
  String(text).replace(/\r/g, "").split("\n").forEach((par) => {
    if (!par.trim()) { lines.push(""); return; }
    const hd = /^[IVX]+\.\s/.test(par) ? "\u0001" : ""; /* заголовок раздела «I. …» — жирным */
    let cur = "";
    par.split(" ").forEach((w) => { const t = cur ? cur + " " + w : w; if (m.measureText(t).width <= maxW) { cur = t; return; } if (cur) lines.push(hd + cur); const parts = m.measureText(w).width > maxW ? fit(w) : [w]; cur = parts.pop(); parts.forEach((p) => lines.push(hd + p)); });
    lines.push(hd + cur);
  });
  const L = lines.slice(0, 500), headH = 132, footH = 74, H = headH + 40 + L.length * lh + footH, K = 1.5;
  const c = document.createElement("canvas"); c.width = W * K; c.height = H * K; const x = c.getContext("2d"); x.scale(K, K);
  x.fillStyle = "#f4f0e3"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#15181c"; x.fillRect(0, 0, W, headH);
  x.fillStyle = "#ffc72c"; x.fillRect(0, headH, W, 5);
  x.textBaseline = "alphabetic";
  x.fillStyle = "#ffc72c"; x.font = `500 15px ${MONO}`; x.fillText("★ СТОЛИЧНЫЙ ДЕПАРТАМЕНТ ПОЛИЦИИ ЛАС-ВЕНТУРАСА ★", pad, 44);
  x.fillStyle = "#f1f2f4"; x.font = `600 30px ${SER}`;
  let t = String(f.title || "Заявление"); while (x.measureText(t).width > maxW && t.length > 8) t = t.slice(0, -2) + "…";
  x.fillText(t, pad, 90);
  if (f.ref) { x.fillStyle = "#9ba2ae"; x.font = `400 14px ${MONO}`; const w = x.measureText(f.ref).width; x.fillText(f.ref, W - pad - w, 44); }
  x.fillStyle = "#1f1c14"; x.font = `400 ${fs}px ${SER}`;
  L.forEach((s, i) => { const b = s[0] === "\u0001"; x.font = `${b ? 600 : 400} ${fs}px ${SER}`; x.fillStyle = b ? "#7a5c00" : "#1f1c14"; x.fillText(b ? s.slice(1) : s, pad, headH + 56 + i * lh); });
  x.strokeStyle = "rgba(31,28,20,.25)"; x.lineWidth = 1; x.beginPath(); x.moveTo(pad, H - footH + 8); x.lineTo(W - pad, H - footH + 8); x.stroke();
  x.fillStyle = "#6b665a"; x.font = `400 14px ${MONO}`; x.fillText("Отправлено с сайта департамента · " + new Date().toLocaleDateString("ru-RU"), pad, H - 30);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

/* ---------- формуляры ---------- */
function dcFormData(f, vals) {
  const val = (x) => { const v = vals[x.k]; if (x.t === "check") return v ? "Да" : ""; if (x.t === "date") return v ? ruDate(v) : ""; if (x.t === "list") return String(v || "").split("\n").map((s) => s.trim()).filter(Boolean).map((s, i) => i + 1 + ". " + s).join("\n"); return String(v || "").trim(); };
  return f.fields.map((x) => ({ l: x.l, v: val(x), i: x.t !== "area" && x.t !== "list" })).filter((x) => x.v);
}
async function dcSendForm(btn) {
  const m = location.hash.match(/^#\/form\/([^/?]+)/), f = m && fById(decodeURIComponent(m[1])); if (!f) return;
  let vals = {}; try { vals = JSON.parse(LS.get("lvmpd-f-" + f.id, "{}")); } catch (e) {}
  const text = formOut(f, vals), fields = dcFormData(f, vals);
  if (!fields.length) { toast("Заполните форму перед отправкой"); return; }
  dcBusy(btn, 1);
  try {
    const fd = new FormData();
    fd.append("title", f.title); fd.append("ref", f.ref || ""); fd.append("who", [vals.rank, vals.name].filter(Boolean).join(" ")); fd.append("text", text);
    fd.append("fields", JSON.stringify(fields)); fd.append("website", ($("#dcw") || {}).value || "");
    const png = await dcPaperPNG(f, text); if (png) fd.append("image", png, "formular.png");
    await dcPost("/form", fd);
    toast("Заявление отправлено в Discord. Ожидайте обратной связи.");
  } catch (e) { toast("Не удалось отправить: " + e.message); }
  dcBusy(btn, 0);
}

/* ---------- объявления ---------- */
async function dcSendNote(btn) {
  const v = (id) => (($("#" + id) || {}).value || "").trim(), n = { author: v("bw"), place: v("ba"), title: v("bh"), text: v("bt"), website: v("dcw") };
  if (n.text.length < 5) { toast("Напишите текст"); return; }
  if (!n.author) { toast("Укажите автора (либо анонимно)"); return; }
  dcBusy(btn, 1);
  try { await dcPost("/board", n, true); $("#bt").value = ""; $("#bt").dispatchEvent(new Event("input", { bubbles: true })); toast("Отправлено на проверку. После одобрения появится на доске"); }
  catch (e) { toast("Не удалось отправить: " + e.message); }
  dcBusy(btn, 0);
}

document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("#bsend, #fdc"); if (!b || !dcOn()) return;
  e.preventDefault(); if (b.id === "bsend") dcSendNote(b); else dcSendForm(b);
});
