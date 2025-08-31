// server.js

// Importa as bibliotecas necessárias
const express = require("express");
const { Client } = require("pg");
const dotenv = require("dotenv");

// Carrega as variáveis de ambiente (para uso local)
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Configuração do cliente PostgreSQL
// Obtém a URL do banco de dados da variável de ambiente
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Lógica de conexão com o banco de dados
const connectDB = async () => {
  try {
    await client.connect();
    console.log("Conectado ao PostgreSQL com sucesso!");
  } catch (error) {
    console.error("Erro ao conectar ao PostgreSQL:", error.message);
    // Encerra o processo se a conexão falhar
    process.exit(1);
  }
};

// Exemplo de uma rota de teste
app.get("/", (req, res) => {
  res.send("Servidor está rodando e conectado ao banco de dados!");
});

// Inicia a conexão com o banco de dados e, em seguida, o servidor
connectDB().then(() => {
  app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
  });
});
