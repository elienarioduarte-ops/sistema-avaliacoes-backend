// server.js
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Segurança e robustez
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const morgan = require("morgan");

// Export .docx (opcional, já incluído)
const { Document, Packer, Paragraph, TextRun } = require("docx");

const app = express();

/* =========================
   CONFIGURAÇÕES BÁSICAS
   ========================= */
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI ausente no .env");
  process.exit(1);
}
if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET ausente no .env");
  process.exit(1);
}

/* Body parsers */
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* Segurança (headers + sanitização) */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(mongoSanitize());

/* Logs HTTP (dev) */
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/* =========================
   C O R S
   ========================= */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl/healthcheck
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
app.options("*", cors());

/* =========================
   ARQUIVOS ESTÁTICOS
   ========================= */
app.use(express.static(path.join(__dirname, "public")));
app.use("/assets", express.static(path.join(__dirname, "public", "assets")));

/* =========================
   CONEXÃO AO MONGODB
   ========================= */
mongoose
  .connect(MONGODB_URI, {
    autoIndex: true,
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
  })
  .then(() => console.log("✅ MongoDB conectado"))
  .catch((err) => {
    console.error("❌ Erro ao conectar ao MongoDB:", err.message);
    process.exit(1);
  });

/* =========================
   SCHEMAS & MODELS
   ========================= */
// Usuários
const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["aluno", "professor"], default: "aluno" },
  },
  { timestamps: true }
);
const User = mongoose.model("User", UserSchema);

// Avaliação
const QuestionRefSchema = new mongoose.Schema(
  {
    number: Number,
    subject: String,
  },
  { _id: false }
);
const AssessmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    questionsCount: { type: Number, required: true, min: 1, max: 50 },
    questions: { type: [QuestionRefSchema], default: [] },
  },
  { timestamps: true }
);
const Assessment = mongoose.model("Assessment", AssessmentSchema);

// Gabarito
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

// Respostas dos alunos
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
    answers: { type: [StudentAnswerItemSchema], default: [] },
  },
  { timestamps: true }
);
const StudentAnswer = mongoose.model("StudentAnswer", StudentAnswerSchema);

// Formulário público
const FormSchema = new mongoose.Schema(
  {
    formId: { type: String, unique: true, index: true },
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

// Banco de Questões
const QuestionSchema = new mongoose.Schema(
  {
    statement: { type: String, required: true },
    options: { A: String, B: String, C: String, D: String, E: String },
    correctAnswer: { type: String, enum: ["A", "B", "C", "D", "E"] },
    subject: { type: String, index: true },
    difficulty: {
      type: String,
      enum: ["Fácil", "Médio", "Difícil"],
      index: true,
    },
    exam: {
      type: String,
      enum: ["ENEM", "ITA", "IME", "VESTIBULAR", "OUTRO"],
      index: true,
    },
    year: { type: Number, index: true },
    tags: [{ type: String, index: true }],
    questionCode: { type: String },
    source: { type: String },

    // ===== Novos campos para OER / LibreTexts/ADAPT =====
    license: { type: String }, // ex.: "CC BY-NC-SA 4.0"
    sourceUrl: { type: String }, // URL do recurso original
    attribution: { type: String }, // texto curto de crédito
  },
  { timestamps: true }
);
// Índice textual para busca por "search"
QuestionSchema.index({ statement: "text", tags: "text" });

const Question = mongoose.model("Question", QuestionSchema);

/* Garantir índices após conexão */
mongoose.connection.on("open", async () => {
  await Promise.all([
    User.init(),
    Question.init(),
    Assessment.init(),
    AnswerKey.init(),
    StudentAnswer.init(),
    Form.init(),
  ]);
});

/* =========================
   HELPERS / MIDDLEWARES
   ========================= */
function signToken(user) {
  return jwt.sign({ uid: user._id, role: user.role }, JWT_SECRET, {
    expiresIn: "7d",
  });
}
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Token ausente." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido." });
  }
}
function onlyProfessor(req, res, next) {
  if (req.user?.role !== "professor")
    return res.status(403).json({ error: "Apenas professores." });
  next();
}
const isId = (v) => mongoose.Types.ObjectId.isValid(v);

/* =========================
   RATE LIMIT /auth
   ========================= */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/auth", authLimiter);

/* =========================
   R O T A S   P Ú B L I C A S
   ========================= */
app.get("/health", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

/* =========================
   AUTH
   ========================= */
app.post("/auth/signup", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: "Dados obrigatórios ausentes." });

    const exists = await User.findOne({
      email: (email || "").toLowerCase().trim(),
    });
    if (exists) return res.status(409).json({ error: "E-mail já cadastrado." });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: role === "professor" ? "professor" : "aluno",
    });

    const token = signToken(user);
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro no cadastro." });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user =
      (await User.findOne({ email: (email || "").toLowerCase().trim() })) ||
      null;
    if (!user) return res.status(401).json({ error: "Credenciais inválidas." });

    const ok = await bcrypt.compare(password || "", user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Credenciais inválidas." });

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro no login." });
  }
});

app.post("/me/role", auth, async (req, res) => {
  try {
    const { role } = req.body;
    if (!["aluno", "professor"].includes(role))
      return res.status(400).json({ error: "Role inválida." });
    const user = await User.findByIdAndUpdate(
      req.user.uid,
      { role },
      { new: true }
    ).lean();
    if (!user)
      return res.status(404).json({ error: "Usuário não encontrado." });
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao definir role." });
  }
});

/* =========================
   BANCO DE QUESTÕES
   ========================= */
// GET /questions?search=&subject=&difficulty=&exam=&year=&tag=&page=1&limit=10
app.get("/questions", auth, async (req, res) => {
  try {
    const {
      search = "",
      subject = "",
      difficulty = "",
      exam = "",
      year = "",
      tag = "",
      page = 1,
      limit = 10,
    } = req.query;

    const q = {};
    if (subject) q.subject = { $regex: new RegExp(subject, "i") };
    if (difficulty) q.difficulty = difficulty;
    if (exam) q.exam = exam;
    if (year) q.year = Number(year);
    if (tag) q.tags = { $in: [new RegExp(tag, "i")] };

    const pg = Math.max(parseInt(page) || 1, 1);
    const lim = Math.min(Math.max(parseInt(limit) || 10, 1), 50);

    let items, total;
    if (search) {
      // Busca textual por índice
      const query = Question.find({ ...q, $text: { $search: search } })
        .select({ score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" } })
        .skip((pg - 1) * lim)
        .limit(lim)
        .lean();
      [items, total] = await Promise.all([
        query,
        Question.countDocuments({ ...q, $text: { $search: search } }),
      ]);
    } else {
      [items, total] = await Promise.all([
        Question.find(q)
          .sort({ year: -1, createdAt: -1 })
          .skip((pg - 1) * lim)
          .limit(lim)
          .lean(),
        Question.countDocuments(q),
      ]);
    }

    res.json({
      items,
      total,
      page: pg,
      pages: Math.max(Math.ceil(total / lim), 1),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao buscar questões." });
  }
});

// Criar nova questão no banco (somente professor)
app.post("/questions", auth, onlyProfessor, async (req, res) => {
  try {
    const {
      statement,
      options,
      correctAnswer,
      subject,
      difficulty,
      exam,
      year,
      tags,
      questionCode,
      source,
      license,
      sourceUrl,
      attribution,
    } = req.body;

    if (!statement || !options || !correctAnswer) {
      return res
        .status(400)
        .json({
          error: "Enunciado, alternativas e resposta correta são obrigatórios.",
        });
    }

    const q = await Question.create({
      statement,
      options,
      correctAnswer,
      subject: subject || "Assunto",
      difficulty: ["Fácil", "Médio", "Difícil"].includes(difficulty)
        ? difficulty
        : "Médio",
      exam: ["ENEM", "ITA", "IME", "VESTIBULAR", "OUTRO"].includes(exam)
        ? exam
        : "OUTRO",
      year: year ? Number(year) : new Date().getFullYear(),
      tags: Array.isArray(tags) ? tags : [],
      questionCode,
      source: source || "Manual",
      license: license || "",
      sourceUrl: sourceUrl || "",
      attribution: attribution || "",
    });

    res.status(201).json(q);
  } catch (e) {
    console.error("Erro ao criar questão:", e);
    res.status(500).json({ error: "Não foi possível salvar a questão." });
  }
});

// Importar várias questões de uma vez (somente professor)
app.post("/questions/bulk", auth, onlyProfessor, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ error: "Envie um array 'items' com questões." });
    }

    const docs = [];
    let skipped = 0;

    for (const it of items) {
      try {
        if (!it.statement || !it.options || !it.correctAnswer) {
          skipped++;
          continue;
        }
        docs.push({
          statement: it.statement,
          options: it.options,
          correctAnswer: it.correctAnswer,
          subject: it.subject || "Assunto",
          difficulty: ["Fácil", "Médio", "Difícil"].includes(it.difficulty)
            ? it.difficulty
            : "Médio",
          exam: ["ENEM", "ITA", "IME", "VESTIBULAR", "OUTRO"].includes(it.exam)
            ? it.exam
            : "OUTRO",
          year: it.year ? Number(it.year) : new Date().getFullYear(),
          tags: Array.isArray(it.tags) ? it.tags : [],
          questionCode: it.questionCode,
          source: it.source || "Import",
          license: it.license || "",
          sourceUrl: it.sourceUrl || "",
          attribution: it.attribution || "",
        });
      } catch {
        skipped++;
      }
    }

    if (!docs.length)
      return res.status(400).json({ error: "Nada válido para inserir." });

    const result = await Question.insertMany(docs, { ordered: false });
    res.json({ inserted: result.length, skipped });
  } catch (e) {
    console.error("Bulk import error:", e.message);
    res.status(500).json({ error: "Falha no import em massa." });
  }
});

// ======== IMPORTAR DO LIBRETEXTS/ADAPT ========
app.post("/questions/import/adapt", auth, onlyProfessor, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ error: "Envie 'items' (array) com questões." });
    }

    const htmlToText = (html) => {
      if (!html) return "";
      return String(html)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/\s+\n/g, "\n")
        .replace(/\n{2,}/g, "\n")
        .trim();
    };

    const normDifficulty = (d) =>
      ["Fácil", "Médio", "Difícil"].includes(d) ? d : "Médio";
    const safeExam = "OUTRO";

    const docs = [];
    let skipped = 0;

    for (const it of items) {
      try {
        const statement = htmlToText(
          it.question || it.statement || it.prompt || ""
        );
        if (!statement) {
          skipped++;
          continue;
        }

        const rawAnswers = Array.isArray(it.answers) ? it.answers : it.options;
        if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
          skipped++;
          continue;
        }

        const trimmed = rawAnswers
          .slice(0, 5)
          .map((a) => ({
            text: htmlToText(a.text || a.html || a.value || a.label || ""),
            correct: Boolean(a.is_correct || a.correct),
          }))
          .filter((a) => a.text);

        if (trimmed.length < 2) {
          skipped++;
          continue;
        }

        let correctIndex = trimmed.findIndex((a) => a.correct);
        if (correctIndex < 0) correctIndex = 0;

        const letters = ["A", "B", "C", "D", "E"];
        const options = {};
        for (let i = 0; i < trimmed.length && i < letters.length; i++) {
          options[letters[i]] = trimmed[i].text;
        }

        const qdoc = {
          statement,
          options,
          correctAnswer: letters[correctIndex],
          subject: (it.subject || "Assunto").trim(),
          difficulty: normDifficulty(it.difficulty),
          exam: safeExam,
          year: it.year ? Number(it.year) : new Date().getFullYear(),
          tags: Array.isArray(it.tags) ? it.tags : [],
          questionCode: it.questionCode || it.code || "",
          source: "LibreTexts/ADAPT",
          license: it.license || "CC BY-NC-SA 4.0",
          sourceUrl: it.url || it.sourceUrl || "",
          attribution:
            it.attribution ||
            (it.title ? `LibreTexts/ADAPT – ${it.title}` : "LibreTexts/ADAPT"),
        };

        docs.push(qdoc);
      } catch {
        skipped++;
      }
    }

    if (docs.length === 0) {
      return res
        .status(400)
        .json({ error: "Nenhum item válido para importar.", skipped });
    }

    const inserted = await Question.insertMany(docs, { ordered: false });
    res.status(201).json({ inserted: inserted.length, skipped });
  } catch (e) {
    console.error("Erro import/adapt:", e);
    res.status(500).json({ error: "Falha ao importar do LibreTexts/ADAPT." });
  }
});

/* =========================
   AVALIAÇÕES / GABARITO / RESPOSTAS
   ========================= */
app.get("/all-data", auth, async (req, res) => {
  try {
    const assessment = await Assessment.findOne()
      .sort({ createdAt: -1 })
      .lean();
    if (!assessment)
      return res.json({
        assessment: null,
        answerKey: null,
        studentAnswers: [],
      });

    const answerKey = await AnswerKey.findOne({ assessmentId: assessment._id })
      .sort({ createdAt: -1 })
      .lean();
    const studentAnswers = await StudentAnswer.find({
      assessmentId: assessment._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      assessment,
      answerKey: answerKey?.answers || null,
      studentAnswers,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar dados." });
  }
});

app.post("/assessments", auth, onlyProfessor, async (req, res) => {
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

// Criar avaliação a partir do banco
app.post("/assessments/from-bank", auth, onlyProfessor, async (req, res) => {
  try {
    const { name, questionIds } = req.body;
    if (!name || !Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: "Dados inválidos para builder." });
    }
    if (!questionIds.every(isId)) {
      return res.status(400).json({ error: "IDs de questões inválidos." });
    }

    const questions = await Question.find({ _id: { $in: questionIds } }).lean();
    if (questions.length !== questionIds.length) {
      return res
        .status(400)
        .json({ error: "Algumas questões não foram encontradas." });
    }

    const byId = new Map(questions.map((q) => [q._id.toString(), q]));
    const ordered = questionIds.map((id, idx) => {
      const q = byId.get(id);
      return { number: idx + 1, subject: q?.subject || "Assunto" };
    });

    const assessment = await Assessment.create({
      name,
      questionsCount: ordered.length,
      questions: ordered,
    });

    const answers = questionIds.map((id, idx) => {
      const q = byId.get(id);
      return {
        questionNumber: idx + 1,
        correctAnswer: q?.correctAnswer || "A",
        subject: q?.subject || "Assunto",
      };
    });
    const key = await AnswerKey.create({
      assessmentId: assessment._id,
      answers,
    });

    res.status(201).json({ assessment, answerKey: key.answers });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao criar avaliação do banco." });
  }
});

app.post("/answer-keys", auth, onlyProfessor, async (req, res) => {
  try {
    const { assessmentId, answers } = req.body;
    if (
      !assessmentId ||
      !isId(assessmentId) ||
      !Array.isArray(answers) ||
      !answers.length
    ) {
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

app.post("/student-answers", auth, async (req, res) => {
  try {
    const { assessmentId, studentName, answers } = req.body;
    if (
      !assessmentId ||
      !isId(assessmentId) ||
      !studentName ||
      !Array.isArray(answers)
    ) {
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
    const normalized = answers.map((a) => ({
      ...a,
      isCorrect: keyMap.get(a.questionNumber) === a.answer,
    }));

    const saved = await StudentAnswer.create({
      assessmentId,
      studentName,
      answers: normalized,
    });
    res.status(201).json(saved);
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ error: "Não foi possível salvar as respostas do aluno." });
  }
});

/* =========================
   FORM ONLINE (público)
   ========================= */
app.post("/forms", auth, onlyProfessor, async (req, res) => {
  try {
    const { assessmentId, title, description, requireName } = req.body;
    if (!assessmentId || !isId(assessmentId))
      return res.status(400).json({ error: "assessmentId é obrigatório." });

    const exists = await Assessment.exists({ _id: assessmentId });
    if (!exists)
      return res.status(404).json({ error: "Avaliação não encontrada." });

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
          </label>`
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
        ? `<div style="margin:12px 0"><label>Nome do aluno: <input name="studentName" required style="padding:8px"/></label></div>`
        : `<input type="hidden" name="studentName" value="Anônimo"/>`
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
   GERENCIAR DADOS / USUÁRIOS
   ========================= */
app.delete("/clear-data", auth, onlyProfessor, async (req, res) => {
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

// /users paginado (somente professor)
app.get("/users", auth, onlyProfessor, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

    const [items, total] = await Promise.all([
      User.find({}, { passwordHash: 0 })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(),
    ]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao listar usuários." });
  }
});

/* =========================
   EXPORT .DOCX (opcional)
   ========================= */
app.get(
  "/assessments/:id/export/docx",
  auth,
  onlyProfessor,
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isId(id)) return res.status(400).json({ error: "ID inválido" });

      const assessment = await Assessment.findById(id).lean();
      const key = await AnswerKey.findOne({ assessmentId: id }).lean();
      if (!assessment || !key)
        return res
          .status(404)
          .json({ error: "Avaliação/gabarito não encontrados" });

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: assessment.name, bold: true, size: 32 }),
                ],
              }),
              ...assessment.questions.map(
                (q) =>
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `Q${q.number} - ${q.subject}`,
                        size: 24,
                      }),
                    ],
                  })
              ),
            ],
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="prova-${assessment._id}.docx"`
      );
      res.send(buffer);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Falha ao exportar .docx" });
    }
  }
);

/* =========================
   SEED (opcional)
   ========================= */
async function seedQuestionsIfNeeded() {
  try {
    const count = await Question.countDocuments();
    if (count > 0) return;
    const sample = [
      {
        statement: "Em um MRUV, qual é a equação horária da velocidade?",
        options: {
          A: "v = v0 + a·t",
          B: "s = s0 + v·t",
          C: "v = a·t",
          D: "v = v0 + 2·a·t",
          E: "s = v0·t + (a/2)·t²",
        },
        correctAnswer: "A",
        subject: "Cinemática",
        difficulty: "Fácil",
        exam: "ENEM",
        year: 2019,
        tags: ["MRUV", "cinemática"],
        questionCode: "Q1",
        source: "Seed",
        license: "",
        sourceUrl: "",
        attribution: "",
      },
      {
        statement:
          "Projétil lançado horizontalmente de altura h com v0. O alcance depende de:",
        options: {
          A: "apenas de h",
          B: "apenas de v0",
          C: "de h e v0",
          D: "de h, v0 e massa",
          E: "apenas da massa",
        },
        correctAnswer: "C",
        subject: "Lançamentos",
        difficulty: "Médio",
        exam: "ENEM",
        year: 2020,
        tags: ["lançamento horizontal", "gravidade"],
        questionCode: "Q2",
        source: "Seed",
        license: "",
        sourceUrl: "",
        attribution: "",
      },
    ];
    await Question.insertMany(sample);
    console.log(`🌱 Seed: ${sample.length} questões inseridas.`);
  } catch (e) {
    console.error("Seed falhou:", e.message);
  }
}

/* =========================
   START
   ========================= */
app.listen(PORT, async () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  if (process.env.SEED === "true") {
    await seedQuestionsIfNeeded();
  }
});
