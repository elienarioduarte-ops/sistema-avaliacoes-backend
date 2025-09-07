// scripts/import_from_adapt.js

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch"); // ✅ CORREÇÃO: adicionando node-fetch

const API = process.env.API_URL || "http://localhost:5000";
const EMAIL = process.env.EMAIL || "prof@teste.com";
const PASSWORD = process.env.PASSWORD || "123456";

// Helper: login e pegar token
async function getToken() {
  console.log("-> Fazendo login...");
  const resp = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!resp.ok) {
    throw new Error(`Falha no login: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  return data.token;
}

// Helper: importar questões
async function importItems(token, items) {
  console.log(
    `-> Enviando ${items.length} itens para ${API}/questions/import/adapt`
  );

  const resp = await fetch(`${API}/questions/import/adapt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ items }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(
      `Falha no import: ${resp.status} ${resp.statusText}\n${txt}`
    );
  }

  return resp.json();
}

// MAIN
(async () => {
  try {
    const args = process.argv.slice(2);

    if (args.includes("--file")) {
      const fileIdx = args.indexOf("--file");
      const filePath = args[fileIdx + 1];
      if (!filePath)
        throw new Error("Informe o caminho do arquivo JSON após --file");

      const fullPath = path.resolve(filePath);
      console.log("-> Lendo arquivo:", fullPath);

      const raw = fs.readFileSync(fullPath, "utf-8");
      const json = JSON.parse(raw);

      if (!json.items || !Array.isArray(json.items)) {
        throw new Error("Arquivo JSON inválido: não contém array 'items'");
      }

      const token = await getToken();
      const result = await importItems(token, json.items);
      console.log("✔ Importação concluída:", result);
    } else if (args.includes("--urls")) {
      console.log("⚠ Import por URLs ainda não implementado.");
    } else {
      console.log("Uso:");
      console.log(
        "  node scripts/import_from_adapt.js --file ./adapt_items.json"
      );
      console.log("  node scripts/import_from_adapt.js --urls");
    }
  } catch (err) {
    console.error("ERRO:", err.message);
  }
})();
