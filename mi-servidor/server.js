require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_COMMENT_LENGTH = Number(process.env.MAX_COMMENT_LENGTH) || 400;
const DELETE_WINDOW_MS = 2 * 60 * 1000; // 2 minutos
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

  const nowMs = Date.now();
  const db = readDb();
  const newEntry = {
    id: `${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
    workId,
    chapterId,
    username,
    comment,
    createdAtMs: nowMs,
    date: new Date(nowMs).toLocaleDateString("es-CO", {
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

// DELETE /api/comments/:id (y soporte para /api/comments con id en el body)
function handleDeleteComment(req, res) {
  const commentId = String(req.params?.id || req.body?.id || "").trim();
  const requesterUser = String(req.body?.username || "").trim().toLowerCase();

  if (!commentId) {
    return res.status(400).json({
      deleted: false,
      error: "Falta el id del comentario."
    });
  }

  const db = readDb();
  const index = db.comments.findIndex((item) => String(item.id) === commentId);

  if (index === -1) {
    return res.status(404).json({
      deleted: false,
      error: "El comentario no existe o ya fue eliminado."
    });
  }

  const target = db.comments[index];

  if (
    requesterUser &&
    target.username &&
    String(target.username).trim().toLowerCase() !== requesterUser
  ) {
    return res.status(403).json({
      deleted: false,
      error: "Solo puedes borrar tus propios comentarios."
    });
  }

  const createdAtMs = Number(target.createdAtMs);
  if (!createdAtMs || Number.isNaN(createdAtMs)) {
    return res.status(403).json({
      deleted: false,
      error: "Este comentario ya no está dentro de la ventana de borrado de 2 minutos."
    });
  }

  const elapsedMs = Date.now() - createdAtMs;
  if (elapsedMs > DELETE_WINDOW_MS) {
    return res.status(403).json({
      deleted: false,
      error: "Ya pasaron los 2 minutos; el comentario ahora es permanente."
    });
  }

  db.comments.splice(index, 1);
  writeDb(db);

  return res.json({
    deleted: true,
    message: "Comentario eliminado dentro de los 2 minutos."
  });
}

app.delete("/api/comments/:id", handleDeleteComment);
app.delete("/api/comments", handleDeleteComment);

app.listen(PORT, () => {
  console.log(`Servidor de comentarios Lunwind (modo sencillo) activo en puerto ${PORT}`);
});
