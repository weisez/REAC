/* Собирает img/manifest.json: список картинок для «Медиатеки».
   Запускается автоматически GitHub Actions при изменении папки img/ (см. .github/workflows/manifest.yml),
   а при желании — вручную:  node tools/make-manifest.js */
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "img");
const ok = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
const files = fs.readdirSync(dir).filter((n) => ok.test(n)).map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
  .sort((a, b) => b.t - a.t || a.n.localeCompare(b.n)).map((x) => x.n);
fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ files }, null, 1) + "\n");
console.log("manifest.json:", files.length, "файлов");
