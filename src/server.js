// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();

/* =========================
   CONFIGURAÇÕES BÁSICAS
   ========================= */
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "troque-isto";

// Parse JSON primeiro
app.use(express.json({ limit: "1mb" }));

/* =========================
   C O R S  (ANTES DAS ROTAS)
   ========================= */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Política: permite requisições sem Origin (curl/healthcheck),
// permite localhost (dev) e as origens informadas na env.
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (
        allowedOrigins.includes(origin) ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin)
      ) {
        return cb(null, true);
      }
      return cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: false,
    optionsSuccessStatus: 204,
  })
);

// Responde preflight para qualquer rota
app.options("*", cors());

/* =========================
   CONEXÃO AO MONGODB
   ========================= */
mongoose
  .connect(MONGODB_URI, { autoIndex: true })
  .then(() => console.log("✅ MongoDB conectado"))
  .catch((err) => {
    console.error("❌ Erro ao conectar ao MongoDB:", err.message);
    process.exit(1);
  });

/* =========================
   SCHEMAS & MODELS
   ========================= */
const QuestionSchema = new mongoose.Schema(
  { number: Number, subject: String },
  { _id: false }
);

const AssessmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    questionsCount: { type: Number, required: true, min: 1, max: 50 },
    questions: { type: [QuestionSchema], default: [] },
  },
  { timestamps: true }
);
const Assessment = mongoose.model("Assessment", AssessmentSchema);

const AnswerKeyItemSchema = new mongoose.Schema(
  {
    questionNumber: Number,
    correctAnswer: { type: String, enum: ["A", "B", "C", "D", "E"] },
    subject: String,
  },
  { _id: false }
);

const AnswerKeySchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assessment",
      required: true,
    },
    answers: { type: [AnswerKeyItemSchema], default: [] },
  },
  { timestamps: true }
);
const AnswerKey = mongoose.model("AnswerKey", AnswerKeySchema);

const StudentAnswerItemSchema = new mongoose.Schema(
  {
    questionNumber: Number,
    answer: { type: String, enum: ["A", "B", "C", "D", "E"] },
    isCorrect: Boolean,
    subject: String,
  },
  { _id: false }
);

const StudentAnswerSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assessment",
      required: true,
    },
    studentName: { type: String, required: true },
    // opcional: vincular ao usuário autenticado
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    answers: { type: [StudentAnswerItemSchema], default: [] },
  },
  { timestamps: true }
);
const StudentAnswer = mongoose.model("StudentAnswer", StudentAnswerSchema);

const FormSchema = new mongoose.Schema(
  {
    formId: { type: String, unique: true, index: true }, // slug público
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assessment",
      required: true,
    },
    title: String,
    description: String,
    requireName: { type: Boolean, default: true },
  },
  { timestamps: true }
);
const Form = mongoose.model("Form", FormSchema);

// Usuários (auth)
const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, index: true, required: true },
    password: { type: String, required: true }, // hash
    role: { type: String, enum: ["aluno", "professor", null], default: null },
  },
  { timestamps: true }
);
const User = mongoose.model("User", UserSchema);

/* =========================
   HELPERS
   ========================= */
async function getLatestAssessmentBundle() {
  const assessment = await Assessment.findOne().sort({ createdAt: -1 }).lean();
  if (!assessment)
    return { assessment: null, answerKey: null, studentAnswers: [] };

  const answerKey = await AnswerKey.findOne({ assessmentId: assessment._id })
    .sort({ createdAt: -1 })
    .lean();

  const studentAnswers = await StudentAnswer.find({
    assessmentId: assessment._id,
  })
    .sort({ createdAt: -1 })
    .lean();

  return { assessment, answerKey: answerKey?.answers || null, studentAnswers };
}

function recomputeIsCorrect(answers, keyMap) {
  return answers.map((a) => ({
    ...a,
    isCorrect: keyMap.get(a.questionNumber) === a.answer,
  }));
}

// JWT helpers
function sign(user) {
  return jwt.sign({ sub: user._id, role: user.role }, JWT_SECRET, {
    expiresIn: "7d",
  });
}
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sem token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET); // { sub, role }
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido/expirado" });
  }
}
function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user?.role)
      return res.status(403).json({ error: "Perfil não definido" });
    if (!allowed.includes(req.user.role))
      return res.status(403).json({ error: "Sem permissão" });
    next();
  };
}

/* =========================
   ROTAS — AUTENTICAÇÃO
   ========================= */
// Healthcheck
app.get("/health", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// SIGNUP
app.post("/auth/signup", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Dados inválidos" });
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "E-mail já cadastrado" });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hash,
      role: ["aluno", "professor"].includes(role) ? role : null,
    });
    const token = sign(user);
    res.json({
      token,
      user: { name: user.name, email: user.email, role: user.role },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro no cadastro" });
  }
});

// LOGIN
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Credenciais inválidas" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Credenciais inválidas" });

    const token = sign(user);
    res.json({
      token,
      user: { name: user.name, email: user.email, role: user.role },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro no login" });
  }
});

// (opcional) definir/alterar role após login
app.post("/me/role", auth, async (req, res) => {
  try {
    const { role } = req.body; // "aluno" | "professor"
    if (!["aluno", "professor"].includes(role))
      return res.status(400).json({ error: "Role inválido" });
    const user = await User.findByIdAndUpdate(
      req.user.sub,
      { role },
      { new: true }
    );
    res.json({
      ok: true,
      user: { name: user.name, email: user.email, role: user.role },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao definir role" });
  }
});

/* =========================
   ROTAS — APP
   ========================= */

// Estado atual (última avaliação) — exige login; pode filtrar aluno
app.get("/all-data", auth, async (req, res) => {
  try {
    const bundle = await getLatestAssessmentBundle();

    if (req.user.role === "aluno") {
      // Aluno não vê gabarito nem todos os alunos
      return res.json({
        assessment: bundle.assessment,
        answerKey: null,
        studentAnswers: [], // ou somente as próprias se você salvar userId
      });
    }
    // Professor vê tudo
    res.json(bundle);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar dados." });
  }
});

// Criar avaliação (professor)
app.post("/assessments", auth, requireRole("professor"), async (req, res) => {
  try {
    const { name, questionsCount, questions } = req.body;
    if (!name || !questionsCount || !Array.isArray(questions)) {
      return res.status(400).json({ error: "Dados da avaliação inválidos." });
    }
    if (questions.length !== questionsCount) {
      return res
        .status(400)
        .json({ error: "Quantidade de questões inconsistente." });
    }
    const assessment = await Assessment.create({
      name,
      questionsCount,
      questions,
    });
    res.status(201).json(assessment);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Não foi possível criar a avaliação." });
  }
});

// Salvar gabarito (professor)
app.post("/answer-keys", auth, requireRole("professor"), async (req, res) => {
  try {
    const { assessmentId, answers } = req.body;
    if (!assessmentId || !Array.isArray(answers) || !answers.length) {
      return res.status(400).json({ error: "Gabarito inválido." });
    }
    const exists = await Assessment.exists({ _id: assessmentId });
    if (!exists)
      return res.status(404).json({ error: "Avaliação não encontrada." });

    const key = await AnswerKey.create({ assessmentId, answers });
    res.status(201).json(key.answers);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Não foi possível salvar o gabarito." });
  }
});

// Salvar respostas (professor OU aluno autenticado)
app.post("/student-answers", auth, async (req, res) => {
  try {
    const { assessmentId, studentName, answers } = req.body;
    if (!assessmentId || !studentName || !Array.isArray(answers)) {
      return res.status(400).json({ error: "Dados de respostas inválidos." });
    }

    const keyDoc = await AnswerKey.findOne({ assessmentId })
      .sort({ createdAt: -1 })
      .lean();
    if (!keyDoc)
      return res
        .status(400)
        .json({ error: "Gabarito não definido para esta avaliação." });

    const keyMap = new Map(
      keyDoc.answers.map((k) => [k.questionNumber, k.correctAnswer])
    );
    const normalized = recomputeIsCorrect(answers, keyMap);

    const saved = await StudentAnswer.create({
      assessmentId,
      studentName,
      answers: normalized,
      userId: req.user.sub, // vincula quem enviou (prof/aluno)
    });

    res.status(201).json(saved);
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ error: "Não foi possível salvar as respostas do aluno." });
  }
});

// Limpar todos os dados (professor)
app.delete("/clear-data", auth, requireRole("professor"), async (req, res) => {
  try {
    await Promise.all([
      Assessment.deleteMany({}),
      AnswerKey.deleteMany({}),
      StudentAnswer.deleteMany({}),
      Form.deleteMany({}),
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Não foi possível limpar os dados." });
  }
});

// Criar formulário online (professor)
app.post("/forms", auth, requireRole("professor"), async (req, res) => {
  try {
    const { assessmentId, title, description, requireName } = req.body;
    if (!assessmentId)
      return res.status(400).json({ error: "assessmentId é obrigatório." });

    const exists = await Assessment.exists({ _id: assessmentId });
    if (!exists)
      return res.status(404).json({ error: "Avaliação não encontrada." });

    // formId curto e único
    const formId = crypto.randomBytes(6).toString("base64url");
    const form = await Form.create({
      formId,
      assessmentId,
      title: title || "Avaliação Online",
      description: description || "",
      requireName: typeof requireName === "boolean" ? requireName : true,
    });

    res
      .status(201)
      .json({ formId: form.formId, url: `${BASE_URL}/form/${form.formId}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Não foi possível criar o formulário." });
  }
});

/* =========================
   ROTAS PÚBLICAS DO FORM
   ========================= */

// Página pública do formulário (HTML simples)
app.get("/form/:formId", async (req, res) => {
  try {
    const form = await Form.findOne({ formId: req.params.formId }).lean();
    if (!form) return res.status(404).send("Formulário não encontrado.");

    const assessment = await Assessment.findById(form.assessmentId).lean();
    const keyDoc = await AnswerKey.findOne({
      assessmentId: assessment?._id,
    }).lean();
    if (!assessment || !keyDoc)
      return res.status(400).send("Formulário incompleto.");

    const questions = assessment.questions
      .map(
        (q) => `
      <div style="margin:12px 0;padding:10px;border:1px solid #ddd;border-radius:8px">
        <strong>Questão ${q.number} - ${q.subject}</strong><br/>
        ${["A", "B", "C", "D", "E"]
          .map(
            (letter) => `
          <label style="margin-right:12px">
            <input type="radio" name="q${q.number}" value="${letter}" required> ${letter}
          </label>
        `
          )
          .join("")}
      </div>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${form.title}</title>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;max-width:900px;margin:30px auto;padding:0 16px">
  <h1>${form.title}</h1>
  <p>${form.description || ""}</p>
  <form method="POST" action="${BASE_URL}/form/${form.formId}/submit">
    ${
      form.requireName
        ? `
      <div style="margin:12px 0">
        <label>Nome do aluno: <input name="studentName" required style="padding:8px"/></label>
      </div>
    `
        : `
      <input type="hidden" name="studentName" value="Anônimo"/>
    `
    }
    ${questions}
    <button type="submit" style="padding:10px 16px;border-radius:6px;border:0;background:#5a7dff;color:#fff">Enviar</button>
  </form>
</body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) {
    console.error(e);
    res.status(500).send("Erro ao carregar formulário.");
  }
});

// Receber submissão do formulário público
app.post(
  "/form/:formId/submit",
  express.urlencoded({ extended: true }),
  async (req, res) => {
    try {
      const { formId } = req.params;
      const form = await Form.findOne({ formId }).lean();
      if (!form) return res.status(404).send("Formulário não encontrado.");

      const assessment = await Assessment.findById(form.assessmentId).lean();
      const keyDoc = await AnswerKey.findOne({
        assessmentId: form.assessmentId,
      }).lean();
      if (!assessment || !keyDoc)
        return res.status(400).send("Formulário incompleto.");

      const keyMap = new Map(
        keyDoc.answers.map((k) => [k.questionNumber, k.correctAnswer])
      );

      const studentName = (req.body.studentName || "Anônimo")
        .toString()
        .trim()
        .replace(/\s+/g, " ");

      const answers = assessment.questions.map((q) => {
        const val = (req.body[`q${q.number}`] || "").toString();
        const answer = ["A", "B", "C", "D", "E"].includes(val) ? val : "";
        return {
          questionNumber: q.number,
          answer,
          isCorrect: keyMap.get(q.number) === answer,
          subject: q.subject,
        };
      });

      if (answers.some((a) => !a.answer)) {
        return res.status(400).send("Preencha todas as questões.");
      }

      await StudentAnswer.create({
        assessmentId: form.assessmentId,
        studentName,
        answers,
      });

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(`
      <html><body style="font-family:Arial;max-width:700px;margin:30px auto">
        <h2>Respostas enviadas com sucesso!</h2>
        <p>Obrigado por participar.</p>
      </body></html>
    `);
    } catch (e) {
      console.error(e);
      res.status(500).send("Erro ao enviar respostas.");
    }
  }
);

/* =========================
   START
   ========================= */
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
