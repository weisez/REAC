/* ===== оформление: цвет каждого элемента отдельно + готовые пресеты =====
   Хранится в S.meta.theme = { preset, dark: {переменная: #hex}, light: {...} }:
   пресет задаёт базу, а dark / light — только то, что владелец поменял руками.
   Применяется как <style id="theme-css">, поэтому работает у всех посетителей после публикации. */
const TH_GROUPS = [
  ["Страница", [["bg", "Фон страницы"], ["bg2", "Фон чередующихся секций"], ["hdr", "Шапка сайта"], ["ftr", "Подвал сайта"]]],
  ["Карточки и панели", [["card", "Карточки, окна, формы"], ["card2", "Вложенные блоки, строки"]]],
  ["Текст", [["ink", "Основной текст и заголовки"], ["mute", "Второстепенный текст"]]],
  ["Акценты", [["brass", "Главный акцент: кнопки, метки, линии"], ["brass2", "Светлый акцент: подзаголовки, наведение"], ["blue", "Дополнительный цвет (зоны карты, детали)"], ["on-brass", "Текст на акцентных кнопках (авто)"]]],
  ["Фотографии", [["shade", "Затемнение фото на главной и в шапках"]]],
  ["Документы", [["paper", "Лист документа"], ["paper-ink", "Текст на листе"]]],
  ["Статусы", [["green", "«Открыто», «в сети»"], ["red", "«Закрыто», ошибки"]]],
];
const TH_LABEL = Object.fromEntries(TH_GROUPS.flatMap((g) => g[1]));
const TH_PRESETS = {
  graphite: { name: "Графит и жёлтый", sw: ["#0f1114", "#1b1f24", "#ffc72c"],
    dark: { bg: "#0f1114", bg2: "#15181c", hdr: "#0f1114", ftr: "#15181c", card: "#1b1f24", card2: "#242930", ink: "#f1f2f4", mute: "#9ba2ae", brass: "#ffc72c", brass2: "#ffd75e", blue: "#6aa3e8", shade: "#080a0c", paper: "#f4f0e3", "paper-ink": "#1f1c14", green: "#5fb878", red: "#e0584a" },
    light: { bg: "#f5f5f3", bg2: "#e9e9e5", hdr: "#ffffff", ftr: "#e9e9e5", card: "#ffffff", card2: "#f3f3ef", ink: "#16181c", mute: "#5d636d", brass: "#a87c00", brass2: "#8a6500", blue: "#2f6fc2", shade: "#0b0d10", paper: "#fffdf6", "paper-ink": "#1f1c14", green: "#3f8a57", red: "#b0352b" } },
  black: { name: "Чёрный и золото", sw: ["#070707", "#141414", "#f0b90b"],
    dark: { bg: "#070707", bg2: "#0e0e0e", hdr: "#070707", ftr: "#0e0e0e", card: "#141414", card2: "#1e1e1e", ink: "#f5f5f5", mute: "#a0a0a0", brass: "#f0b90b", brass2: "#ffd34d", blue: "#9aa7b8", shade: "#000000", paper: "#f6f1e2", "paper-ink": "#1a1810", green: "#5fb878", red: "#e0584a" },
    light: { bg: "#f7f6f2", bg2: "#ebe9e2", hdr: "#ffffff", ftr: "#ebe9e2", card: "#ffffff", card2: "#f4f2ec", ink: "#151515", mute: "#5f5f5f", brass: "#9a7000", brass2: "#7a5a00", blue: "#55637a", shade: "#050505", paper: "#fffdf6", "paper-ink": "#1a1810", green: "#3f8a57", red: "#b0352b" } },
  navy: { name: "Тёмно-синий и жёлтый", sw: ["#0a1322", "#14233b", "#ffc72c"],
    dark: { bg: "#0a1322", bg2: "#0f1b2f", hdr: "#0a1322", ftr: "#0f1b2f", card: "#14233b", card2: "#1c2e4b", ink: "#eef2f8", mute: "#9fb0c8", brass: "#ffc72c", brass2: "#ffdb70", blue: "#5aa0ff", shade: "#050b16", paper: "#f4f1e6", "paper-ink": "#1a2233", green: "#5fb878", red: "#e0584a" },
    light: { bg: "#f2f5fa", bg2: "#e4eaf3", hdr: "#ffffff", ftr: "#e4eaf3", card: "#ffffff", card2: "#eef2f8", ink: "#0f1a2b", mute: "#566377", brass: "#a07600", brass2: "#80600a", blue: "#1f5fbf", shade: "#050b16", paper: "#fffdf6", "paper-ink": "#1a2233", green: "#3f8a57", red: "#b0352b" } },
  olive: { name: "Оливковый и жёлтый", sw: ["#11130e", "#1f2318", "#f3c623"],
    dark: { bg: "#11130e", bg2: "#181b13", hdr: "#11130e", ftr: "#181b13", card: "#1f2318", card2: "#292e1f", ink: "#f0f1e8", mute: "#a0a68f", brass: "#f3c623", brass2: "#ffdb5c", blue: "#8fb06a", shade: "#080a05", paper: "#f3f0df", "paper-ink": "#1c1e12", green: "#7fbf6a", red: "#e0584a" },
    light: { bg: "#f4f5ee", bg2: "#e7e9dd", hdr: "#ffffff", ftr: "#e7e9dd", card: "#ffffff", card2: "#f1f3e8", ink: "#1a1c12", mute: "#5f6450", brass: "#9a7400", brass2: "#7c5c00", blue: "#4f7a2f", shade: "#080a05", paper: "#fffdf6", "paper-ink": "#1c1e12", green: "#3f8a57", red: "#b0352b" } },
};
const thHex = (h) => /^#[0-9a-f]{6}$/i.test(h || "");
const thRGB = (h) => { h = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const thLum = (h) => { const [r, g, b] = thRGB(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const thRatio = (a, b) => { const x = thLum(a), y = thLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const thAutoOn = (brass) => (thRatio(brass, "#15130c") >= thRatio(brass, "#ffffff") ? "#15130c" : "#ffffff");
/* итоговый набор цветов режима: пресет → ручные правки → «текст на акценте» по контрасту */
function thEff(mode, th) {
  th = th || (S && S.meta && S.meta.theme) || {};
  const pre = TH_PRESETS[th.preset] || TH_PRESETS.graphite, c = Object.assign({}, pre[mode], th[mode] || {});
  Object.keys(c).forEach((k) => { if (!thHex(c[k])) c[k] = pre[mode][k]; });
  if (!thHex(c["on-brass"])) c["on-brass"] = thAutoOn(c.brass);
  return c;
}
function thVars(c) {
  const rgb = (k) => thRGB(c[k]).join(",");
  return Object.entries(c).map(([k, v]) => `--${k}:${v}`).join(";") + `;--bg-rgb:${rgb("bg")};--ink-rgb:${rgb("ink")};--brass-rgb:${rgb("brass")};--blue-rgb:${rgb("blue")};--shade-rgb:${rgb("shade")};--paper-ink-rgb:${rgb("paper-ink")}`;
}
function thCSS(th) {
  const d = thEff("dark", th), l = thEff("light", th);
  return `:root{${thVars(d)};--hero-brass:${d.brass};--hero-brass2:${d.brass2};--hero-brass-rgb:${thRGB(d.brass).join(",")};--hero-on-brass:${d["on-brass"]}}:root[data-theme=light]{${thVars(l)}}`;
}
let TH_LAST = "";
function applyTheme(th) {
  const css = thCSS(th);
  if (css === TH_LAST) return; TH_LAST = css;
  let el = document.getElementById("theme-css");
  if (!el) { el = document.createElement("style"); el.id = "theme-css"; document.head.appendChild(el); }
  el.textContent = css;
  if (!th) LS.set("lvmpd-themecss", css);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = thEff(document.documentElement.dataset.theme === "light" ? "light" : "dark", th).bg;
}

/* ===== окно «Цвета» (панель сбоку: сайт остаётся виден, цвета меняются сразу) ===== */
function thOpen() {
  const backup = JSON.stringify(S.meta.theme || null);
  const st = JSON.parse(backup) || {}; st.preset = TH_PRESETS[st.preset] ? st.preset : "graphite"; st.dark = st.dark || {}; st.light = st.light || {};
  let mode = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  const live = () => { S.meta.theme = st; applyTheme(); };
  const pairs = [["ink", "bg", "текст / фон"], ["mute", "bg", "второстепенный / фон"], ["brass", "bg", "акцент / фон"], ["on-brass", "brass", "кнопка"]];
  const chk = (k, c) => { const p = pairs.find((x) => x[0] === k); if (!p) return ""; const r = thRatio(c[k], c[p[1]]), min = k === "mute" || k === "brass" ? 3 : 4.5; return `<span class="thm-c ${r >= min ? "ok" : "bad"}" title="Контраст ${p[2]}">${r.toFixed(1)}:1</span>`; };
  const draw = () => {
    const c = thEff(mode, st), base = (TH_PRESETS[st.preset] || TH_PRESETS.graphite)[mode];
    $("#thb").innerHTML = `<div class="thm">
      <div><div class="note" style="margin-bottom:8px">Готовые схемы. Потом любой цвет можно поправить отдельно.</div><div class="thm-pre">${Object.entries(TH_PRESETS).map(([id, p]) => `<button type="button" data-thp="${id}" class="${st.preset === id ? "on" : ""}"><span class="thm-sw">${p.sw.map((x) => `<i style="background:${x}"></i>`).join("")}</span>${esc(p.name)}</button>`).join("")}</div></div>
      <div><div class="note" style="margin-bottom:8px">Какую тему настраиваем (сайт переключится сам):</div><div class="thm-modes"><button type="button" data-thm="dark" class="${mode === "dark" ? "on" : ""}">Тёмная</button><button type="button" data-thm="light" class="${mode === "light" ? "on" : ""}">Светлая</button></div></div>
      ${TH_GROUPS.map(([g, ks]) => `<div class="thm-g"><h4>${esc(g)}</h4>${ks.map(([k, l]) => `<div class="thm-r" data-row="${k}"><input type="color" data-thc="${k}" value="${c[k]}" aria-label="${esc(l)}"><label>${esc(l)}</label><input type="text" data-tht="${k}" value="${c[k]}" maxlength="7" spellcheck="false" aria-label="${esc(l)}, код цвета"><span class="thm-cw">${chk(k, c)}</span><button type="button" data-thr="${k}" title="Вернуть цвет схемы" ${st[mode][k] ? "" : "disabled"}>↺</button></div>`).join("")}</div>`).join("")}
    </div>`;
  };
  const upd = () => { const c = thEff(mode, st); $$(".thm-r", o).forEach((r) => { const k = r.dataset.row; $(".thm-cw", r).innerHTML = chk(k, c); $("[data-thr]", r).disabled = !st[mode][k]; const cp = $("[data-thc]", r), tx = $("[data-tht]", r); if (document.activeElement !== tx) tx.value = c[k]; if (document.activeElement !== cp) cp.value = c[k]; }); };
  const set = (k, v) => { if (!thHex(v)) return false; v = v.toLowerCase(); const base = (TH_PRESETS[st.preset] || TH_PRESETS.graphite)[mode]; if (base[k] === v && k !== "on-brass") delete st[mode][k]; else st[mode][k] = v; if (k === "brass" && !st[mode]["on-brass"]) { /* текст на кнопке пересчитается сам */ } live(); return true; };
  let o = ovOpen("thov", `<div class="md"><div class="mh"><h3>Цвета сайта</h3><button data-thx aria-label="Закрыть">✕</button></div><div class="mb" id="thb"></div><div class="mf"><button class="dng" data-thall>Сбросить всё</button><span class="sp"></span><button data-thx>Отмена</button><button class="pri" data-thsave>Сохранить</button></div></div>`);
  o.classList.add("side");
  const apply = () => { theme(mode); applyTheme(); chrome(); };
  const close = (keep) => { if (!keep) { S.meta.theme = JSON.parse(backup) || undefined; if (!S.meta.theme) delete S.meta.theme; applyTheme(); } ovClose("thov"); };
  draw(); live();
  o.addEventListener("input", (e) => {
    const t = e.target, k = t.dataset.thc || t.dataset.tht; if (!k) return;
    if (t.dataset.thc) { set(k, t.value); const tx = $(`[data-tht="${k}"]`, o); if (tx) tx.value = t.value; upd(); }
    else if (thHex(t.value) && set(k, t.value)) { const cp = $(`[data-thc="${k}"]`, o); if (cp) cp.value = t.value; upd(); }
  });
  o.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return; const d = b.dataset;
    if ("thx" in d) close(false);
    else if ("thsave" in d) { S.meta.theme = st; save(); close(true); toast("Цвета сохранены. Чтобы их увидели все, нажмите «Опубликовать»"); }
    else if ("thall" in d) arm(b, () => { st.preset = "graphite"; st.dark = {}; st.light = {}; live(); draw(); });
    else if ("thp" in d) { st.preset = d.thp; st.dark = {}; st.light = {}; live(); draw(); }
    else if ("thm" in d) { mode = d.thm; theme(mode); chrome(); draw(); applyTheme(); }
    else if ("thr" in d) { delete st[mode][d.thr]; live(); upd(); }
  });
}
