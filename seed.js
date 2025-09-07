// seed.js
require("dotenv").config();
const mongoose = require("mongoose");

const uri = process.env.MONGODB_URI; // use MONGODB_URI no .env
if (!uri) {
  console.error("❌ MONGODB_URI não definido no .env");
  process.exit(1);
}

const QuestionSchema = new mongoose.Schema(
  {
    statement: { type: String, required: true },
    subject: String,
    difficulty: { type: String, enum: ["Fácil", "Médio", "Difícil"] },
    options: { A: String, B: String, C: String, D: String, E: String },
    correctAnswer: { type: String, enum: ["A", "B", "C", "D", "E"] },
    tags: [String],
  },
  { timestamps: true }
);
const QuestionBank = mongoose.model("QuestionBank", QuestionSchema);

async function run() {
  try {
    await mongoose.connect(uri);
    console.log("✅ Conectado ao MongoDB");

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
        tags: ["ENEM", "MRUV"],
      },
      {
        statement:
          "Uma partícula descreve MCU de raio 2 m e período 4 s. Qual a velocidade escalar?",
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
        tags: ["ITA", "MCU"],
      },
      {
        statement:
          "Sobre a Primeira Lei de Newton, assinale a alternativa correta.",
        subject: "Dinâmica",
        difficulty: "Fácil",
        options: {
          A: "Repouso exige força resultante.",
          B: "Sem força resultante, MRU se mantém.",
          C: "Sem forças, o corpo acelera.",
          D: "Inércia depende só da velocidade.",
          E: "Nenhuma das anteriores.",
        },
        correctAnswer: "B",
        tags: ["IME", "Leis de Newton"],
      },
    ];

    await QuestionBank.deleteMany({});
    await QuestionBank.insertMany(questions);

    console.log(`✅ Seed concluído: ${questions.length} questões inseridas.`);
  } catch (err) {
    console.error("❌ Erro no seed:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
