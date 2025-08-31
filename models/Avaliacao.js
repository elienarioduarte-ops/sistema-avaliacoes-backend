const mongoose = require("mongoose");

// Define a estrutura (schema) do seu documento de Avaliacao
const avaliacaoSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: true,
  },
  descricao: {
    type: String,
    required: true,
  },
  nota: {
    type: Number,
    required: true,
  },
  // Você pode adicionar mais campos, como a data da avaliacao
  dataCriacao: {
    type: Date,
    default: Date.now,
  },
});

// Cria e exporta o modelo, que será usado nas rotas
const Avaliacao = mongoose.model("Avaliacao", avaliacaoSchema);

module.exports = Avaliacao;
