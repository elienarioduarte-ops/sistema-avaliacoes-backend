require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Conectado ao MongoDB"))
  .catch((err) => console.error("Erro ao conectar ao MongoDB:", err));

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
