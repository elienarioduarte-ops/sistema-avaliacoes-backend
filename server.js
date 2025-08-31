// server.js

// 1. Importa as bibliotecas
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

// 2. Carrega as variáveis de ambiente do arquivo .env
dotenv.config();

const app = express();
const port = 3000;

// 3. Obtém a string de conexão da variável de ambiente
const mongoURI = process.env.MONGO_URI;

// 4. Lógica de conexão com o banco de dados
const connectDB = async () => {
  try {
    await mongoose.connect(mongoURI, {
      // Essas opções não são mais necessárias a partir do Mongoose 6,
      // mas são úteis para versões mais antigas.
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });
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
