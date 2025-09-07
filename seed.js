// seed.js
require("dotenv").config();
const mongoose = require("mongoose");

// Conectar no Mongo
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI não definido no .env");
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ Conectado ao MongoDB"))
  .catch((err) => {
    console.error("❌ Erro ao conectar:", err.message);
    process.exit(1);
  });

// Importa o model (igual ao do server.js)
const QuestionSchema = new mongoose.Schema(
  {
    statement: { type: String, required: true },
    subject: String,
    difficulty: { type: String, enum: ["Fácil", "Médio", "Difícil"] },
    options: {
      A: String,
      B: String,
      C: String,
      D: String,
      E: String,
    },
    correctAnswer: { type: String, enum: ["A", "B", "C", "D", "E"] },
    tags: [String],
  },
  { timestamps: true }
);

const QuestionBank = mongoose.model("QuestionBank", QuestionSchema);

// Questões iniciais (pode expandir com ENEM/ITA/IME)
const questions = [
  {
    statement:
      "Um carro parte do repouso com aceleração constante de 2 m/s². Qual sua velocidade após 5 s?",
    subject: "Cinemática",
    difficulty: "Fácil",
    options: {
      A: "2 m/s",
      B: "5 m/s",
      C: "10 m/s",
      D: "20 m/s",
      E: "25 m/s",
    },
    correctAnswer: "D",
    tags: ["MRUV", "ENEM"],
  },
  {
    statement:
      "Uma partícula percorre uma circunferência de raio R = 2 m em MCU com período de 4 s. Qual sua velocidade escalar?",
    subject: "Movimento Circular",
    difficulty: "Médio",
    options: {
      A: "π m/s",
      B: "2π m/s",
      C: "π/2 m/s",
      D: "4π m/s",
      E: "8π m/s",
    },
    correctAnswer: "B",
    tags: ["MCU", "ITA"],
  },
  {
    statement:
      "Sobre a Primeira Lei de Newton, assinale a alternativa correta:",
    subject: "Dinâmica",
    difficulty: "Fácil",
    options: {
      A: "Um corpo em repouso só permanece em repouso se houver força resultante.",
      B: "Um corpo livre de forças permanece em movimento retilíneo uniforme.",
      C: "Um corpo acelera se não houver forças aplicadas.",
      D: "A inércia depende apenas da velocidade.",
      E: "Nenhuma das anteriores.",
    },
    correctAnswer: "B",
    tags: ["Leis de Newton", "IME"],
  },
];

// Função para rodar o seed
async function runSeed() {
  try {
    await QuestionBank.deleteMany({});
    console.log("🗑️ Banco de questões limpo.");

    await QuestionBank.insertMany(questions);
    console.log(`✅ ${questions.length} questões inseridas com sucesso!`);
  } catch (err) {
    console.error("❌ Erro ao rodar seed:", err);
  } finally {
    mongoose.connection.close();
  }
}

runSeed();
