// scripts/import_from_adapt.js
// Node 16+
// Uso:
//   node scripts/import_from_adapt.js --urls https://meu.site/adapt_lote1.json,https://meu.site/adapt_lote2.json
// ou usando um arquivo local:
//   node scripts/import_from_adapt.js --file .\adapt_items.json
//
// .env que o script usa:
//   API_URL=https://api.fisicaava.online
//   EMAIL=seu_email_de_login
//   PASSWORD=sua_senha

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const API_URL = process.env.API_URL || "http://localhost:5000";
const EMAIL = process.env.EMAIL || "";
const PASSWORD = process.env.PASSWORD || "";

async function login() {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login falhou: ${data?.error || res.status}`);
  return data.token;
}

function sha1(s) {
  return crypto
    .createHash("sha1")
    .update(s || "")
    .digest("hex");
}

function toImportItems(raw) {
  // Aceita dois formatos:
  // 1) { items: [ {title,url,license,attribution,subject,difficulty,question,answers:[{text,is_correct}],...} ] }
  // 2) [ {title,url,license,attribution,subject,difficulty,question,answers:[...] } ]
  const items = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw)
    ? raw
    : [];
  return items
    .map((it, idx) => {
      const answers = Array.isArray(it.answers) ? it.answers : [];
      const correctIndex = answers.findIndex(
        (a) => a.is_correct === true || a.isCorrect === true
      );
      const opt = { A: "", B: "", C: "", D: "", E: "" };
      answers.slice(0, 5).forEach((a, i) => {
        opt[["A", "B", "C", "D", "E"][i]] = (a?.text ?? "").toString().trim();
      });

      let correctLetter = ["A", "B", "C", "D", "E"][correctIndex] || "A";

      return {
        title: (it.title || "").toString().trim(),
        url: it.url || "",
        license: it.license || "CC BY-NC-SA 4.0",
        attribution: it.attribution || "LibreTexts / ADAPT",
        statement: (it.question || it.statement || "").toString().trim(),
        options: opt,
        correctAnswer: correctLetter,
        subject: (it.subject || "Física").toString().trim(),
        difficulty: it.difficulty || "Médio",
        exam: it.exam || "OUTRO",
        year: Number(it.year) || new Date().getFullYear(),
        tags: Array.isArray(it.tags) ? it.tags : [],
        questionCode:
          it.questionCode ||
          it.code ||
          `ADAPT-${sha1(
            (it.url || "") + (it.title || "") + (it.question || "") + idx
          ).slice(0, 8)}`,
        source: "ADAPT",
      };
    })
    .filter((x) => x.statement && (x.options.A || x.options.B));
}

async function importBatch(token, items) {
  if (!items.length) return { inserted: 0, skipped: 0 };
  const res = await fetch(`${API_URL}/questions/import/adapt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Falha ao importar: ${JSON.stringify(data)}`);
  return data; // {inserted, skipped}
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return await res.json();
}

async function readLocalJson(filePath) {
  const p = path.resolve(filePath);
  const buf = fs.readFileSync(p);
  return JSON.parse(buf.toString("utf8"));
}

function parseCli() {
  // --urls url1,url2  |  --file caminho.json
  const args = process.argv.slice(2).join(" ");
  const mUrls = args.match(/--urls\s+([^\s]+)/);
  const mFile = args.match(/--file\s+([^\s]+)/);
  const urls = mUrls
    ? mUrls[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const file = mFile ? mFile[1] : "";
  return { urls, file };
}

(async () => {
  try {
    if (!EMAIL || !PASSWORD) {
      console.error(
        "Defina EMAIL e PASSWORD no .env para o script fazer login."
      );
      process.exit(1);
    }

    const { urls, file } = parseCli();
    if (!urls.length && !file) {
      console.log(
        "Uso:\n  node scripts/import_from_adapt.js --urls URL1,URL2\n  ou\n  node scripts/import_from_adapt.js --file .\\adapt_items.json"
      );
      process.exit(0);
    }

    console.log("→ Fazendo login…");
    const token = await login();
    console.log("✓ JWT obtido.");

    let totalInserted = 0,
      totalSkipped = 0;

    if (file) {
      console.log(`→ Lendo arquivo local: ${file}`);
      const raw = await readLocalJson(file);
      const items = toImportItems(raw);
      console.log(`  - ${items.length} itens normalizados`);
      const r = await importBatch(token, items);
      console.log(`  = local: inserted ${r.inserted}, skipped ${r.skipped}`);
      totalInserted += r.inserted;
      totalSkipped += r.skipped;
    }

    for (const u of urls) {
      console.log(`→ Baixando: ${u}`);
      const raw = await fetchJson(u);
      const items = toImportItems(raw);
      console.log(`  - ${items.length} itens normalizados`);
      const r = await importBatch(token, items);
      console.log(`  = ${u}: inserted ${r.inserted}, skipped ${r.skipped}`);
      totalInserted += r.inserted;
      totalSkipped += r.skipped;
    }

    console.log("\n✅ Importação concluída.");
    console.log(`Total inserted: ${totalInserted} | skipped: ${totalSkipped}`);
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exit(1);
  }
})();
