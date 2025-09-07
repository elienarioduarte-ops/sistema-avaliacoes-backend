// import_adapt.js
// Uso: node import_adapt.js adapt_items.json https://api.fisicaava.online SEU_TOKEN

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

async function main() {
  const [filePath, apiBase, token] = process.argv.slice(2);
  if (!filePath || !apiBase || !token) {
    console.log("Uso: node import_adapt.js <arquivo.json> <API_BASE> <TOKEN>");
    process.exit(1);
  }

  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.error("Arquivo não encontrado:", abs);
    process.exit(1);
  }

  const raw = fs.readFileSync(abs, "utf8");
  let items;
  try {
    items = JSON.parse(raw);
  } catch (e) {
    console.error("JSON inválido:", e.message);
    process.exit(1);
  }

  // Caso o arquivo traga um objeto com "items", use-o; senão, suponha que seja o array
  const payload = Array.isArray(items)
    ? { items }
    : items.items
    ? items
    : { items: [] };

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    console.error("Nada para importar (items vazio).");
    process.exit(1);
  }

  try {
    const res = await fetch(
      `${apiBase.replace(/\/+$/, "")}/questions/import/adapt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      console.error("Erro da API:", data);
      process.exit(1);
    }
    console.log("Importação concluída:", data);
  } catch (e) {
    console.error("Falha na requisição:", e.message);
    process.exit(1);
  }
}

main();
