require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_COMMENT_LENGTH = Number(process.env.MAX_COMMENT_LENGTH) || 400;
const DB_PATH = path.join(__dirname, "comments-db.json");

app.use(cors());
app.use(express.json({ limit: "16kb" }));

function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ comments: [] }, null, 2), "utf8");
  }
  const raw = fs.readFileSync(DB_PATH, "utf8");
  return JSON.parse(raw || '{"comments":[]}');
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function makeThreadKey(workId, chapterId) {
  return `${String(workId || "general").trim()}::${String(chapterId || "cap-1").trim()}`;
}

// Reglas sencillas sin IA: valida longitud mínima/máxima y bloquea enlaces externos
function validateSimpleComment(username, comment) {
  if (!username || username.length < 2 || username.length > 30) {
    return {
      allowed: false,
      message: "El nombre de usuario debe tener entre 2 y 30 caracteres."
    };
  }

  if (!comment || comment.length < 2) {
    return {
      allowed: false,
      message: "Escribe un comentario un poco más largo."
    };
  }

  if (comment.length > MAX_COMMENT_LENGTH) {
    return {
      allowed: false,
      message: `El comentario no puede superar los ${MAX_COMMENT_LENGTH} caracteres.`
    };
  }

  const hasLink = /(https?:\/\/|www\.)\S+/i.test(comment);
  if (hasLink) {
    return {
      allowed: false,
      message: "No se permiten enlaces en los comentarios."
    };
  }

  return { allowed: true, message: "Aprobado" };
}

// GET /api/comments?workId=kethar&chapterId=cap-1
app.get("/api/comments", (req, res) => {
  const workId = String(req.query.workId || "").trim();
  const chapterId = String(req.query.chapterId || "cap-1").trim();

  if (!workId) {
    return res.status(400).json({ error: "Falta workId." });
  }

  const targetKey = makeThreadKey(workId, chapterId);
  const db = readDb();

  const filtered = db.comments.filter((item) => {
    return makeThreadKey(item.workId, item.chapterId) === targetKey;
  });

  return res.json({ comments: filtered });
});

// POST /api/comments
app.post("/api/comments", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const comment = String(req.body?.comment || "").trim();
  const workId = String(req.body?.workId || "").trim();
  const chapterId = String(req.body?.chapterId || "cap-1").trim();

  if (!workId) {
    return res.status(400).json({
      allowed: false,
      message: "Falta identificar la obra."
    });
  }

  const check = validateSimpleComment(username, comment);
  if (!check.allowed) {
    return res.status(422).json({
      allowed: false,
      message: check.message
    });
  }

  const db = readDb();
  const newEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    workId,
    chapterId,
    username,
    comment,
    date: new Date().toLocaleDateString("es-CO", {
      year: "numeric",
      month: "short",
      day: "numeric"
    })
  };

  db.comments.push(newEntry);
  writeDb(db);

  return res.status(201).json({
    allowed: true,
    message: "¡Comentario guardado!",
    comment: newEntry
  });
});

app.listen(PORT, () => {
  console.log(`Servidor de comentarios Lunwind (modo sencillo) activo en puerto ${PORT}`);
});