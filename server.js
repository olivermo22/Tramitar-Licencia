import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import session from "express-session";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

app.get("/api/dhl/locations", async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: "Lat/Lng requeridos" });
    }

    const url =
      `https://api.dhl.com/location-finder/v1/find-by-geo` +
      `?latitude=${lat}&longitude=${lng}&radius=5000&limit=10`;

    const r = await fetch(url, {
      headers: {
        "DHL-API-Key": process.env.DHL_API_KEY,
      },
    });

    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("DHL error:", err);
    res.status(500).json({ error: "Error consultando DHL" });
  }
});


// === CONFIG ESM ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === VARIABLES ===
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || "clave-secreta";

// === RUTAS DE DIRECTORIOS ===
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const DATA_DIR = path.join(__dirname, "data");
const FORMS_FILE = path.join(DATA_DIR, "forms.json");
const COUNTER_FILE = path.join(DATA_DIR, "counter.json");

// Crear carpetas si no existen
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

// Crear archivo de formularios si no existe
if (!fs.existsSync(FORMS_FILE)) {
  fs.writeFileSync(FORMS_FILE, "[]", "utf8");
}

// Crear archivo de contador si no existe (arrancamos en 34687 para que el primero sea 34688)
if (!fs.existsSync(COUNTER_FILE)) {
  fs.writeFileSync(
    COUNTER_FILE,
    JSON.stringify({ last: 9999 }, null, 2),
    "utf8"
  );
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));
app.use("/uploads", express.static(UPLOADS_DIR));

// Sesiones
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

// === MULTER CONFIG ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `${file.fieldname}-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

// =========================
//  FUNCIONES AUXILIARES
// =========================

function loadForms() {
  try {
    const raw = fs.readFileSync(FORMS_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveForms(forms) {
  fs.writeFileSync(FORMS_FILE, JSON.stringify(forms, null, 2), "utf8");
}

function loadCounter() {
  try {
    const raw = fs.readFileSync(COUNTER_FILE, "utf8");
    const data = JSON.parse(raw);
    if (typeof data.last !== "number") {
      return { last: 34687 };
    }
    return data;
  } catch (e) {
    return { last: 34687 };
  }
}

function saveCounter(counter) {
  fs.writeFileSync(COUNTER_FILE, JSON.stringify(counter, null, 2), "utf8");
}

function getNextResponseNumber() {
  const counter = loadCounter();
  const current = (counter.last || 34687) + 1;
  counter.last = current;
  saveCounter(counter);
  return current;
}

// =========================
//   AUTH
// =========================

function requireAuth(req, res, next) {
  if (req.session?.user === "admin") return next();
  return res.status(401).json({ error: "No autorizado" });
}

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.user = "admin";
    return res.json({ success: true });
  }

  return res.status(401).json({ error: "Credenciales incorrectas" });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// =========================
//    SUBIDA DE IMÁGENES
// =========================

app.post("/api/upload/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "No se recibió archivo" });

    const type = req.query.type || "generic";
    const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";

    // FOTO PERSONA
    if (type === "persona") {
      const filename = `persona-${Date.now()}${ext}`;
      const outputPath = path.join(UPLOADS_DIR, filename);
      fs.renameSync(req.file.path, outputPath);
      return res.json({ url: `/uploads/${filename}` });
    }

    // FOTO IDENTIFICACIÓN
    if (type === "identificacion") {
      const filename = `id-${Date.now()}${ext}`;
      const outputPath = path.join(UPLOADS_DIR, filename);
      fs.renameSync(req.file.path, outputPath);
      return res.json({ url: `/uploads/${filename}` });
    }

    // FIRMA
    if (type === "firma") {
      const filename = `firma-${Date.now()}${ext}`;
      const outputPath = path.join(UPLOADS_DIR, filename);
      fs.renameSync(req.file.path, outputPath);
      return res.json({ url: `/uploads/${filename}` });
    }

    // OTRO TIPO
    const filename = `img-${Date.now()}${ext}`;
    const outputPath = path.join(UPLOADS_DIR, filename);
    fs.renameSync(req.file.path, outputPath);
    return res.json({ url: `/uploads/${filename}` });
  } catch (err) {
    console.error("Error subiendo imagen:", err);
    return res.status(500).json({ error: "Error subiendo imagen" });
  }
});

// =========================
//      FORMULARIOS
// =========================

app.get("/api/forms", requireAuth, (req, res) => {
  const forms = loadForms().sort((a, b) => b.createdAt - a.createdAt);
  res.json(forms);
});

app.post("/api/forms", (req, res) => {
  const forms = loadForms();

  // Número de respuesta incremental
  const responseNumber = getNextResponseNumber();

  const newForm = {
    id: Date.now(),
    createdAt: Date.now(),
    responseNumber, // Respuesta #xxxx
    ...req.body,
  };

  forms.push(newForm);
  saveForms(forms);

  res.json({ success: true, form: newForm });
});

// =========================
//   INICIAR SERVIDOR
// =========================

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
