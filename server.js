// server.js

// 1. Importa as bibliotecas
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

// 2. Carrega as variáveis de ambiente do arquivo .env
// No Render, as variáveis são carregadas automaticamente, então esta linha é para uso local.
dotenv.config();

const app = express();

// A porta é lida da variável de ambiente do Render, com um fallback para 3000 em uso local.
const port = process.env.PORT || 3000;

// 3. Obtém a string de conexão da variável de ambiente corrigida
const mongoURI = process.env.MONGODB_URI;

// 4. Lógica de conexão com o banco de dados
const connectDB = async () => {
  try {
    // A string de conexão agora usa a variável correta.
    await mongoose.connect(mongoURI);
    console.log("Conexão com o MongoDB estabelecida!");
  } catch (error) {
    console.error("Erro ao conectar ao MongoDB:", error.message);
    // Encerra o processo se a conexão falhar
    process.exit(1);
  }
};

// 5. Inicia a conexão com o banco de dados e, em seguida, o servidor
connectDB().then(() => {
  app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
  });
});
