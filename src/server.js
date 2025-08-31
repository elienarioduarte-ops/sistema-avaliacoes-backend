// server.js

// Importa as bibliotecas necessárias
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

// Carrega as variáveis de ambiente (para uso local)
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Obtém a string de conexão da variável de ambiente
const mongoURI = process.env.MONGODB_URI;

// Lógica de conexão com o banco de dados
const connectDB = async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log("Conexão com o MongoDB estabelecida!");
    } catch (error) {
        console.error("Erro ao conectar ao MongoDB:", error.message);
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
