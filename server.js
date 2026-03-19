import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import session from "express-session";
import { fileURLToPath } from "url";

// === CONFIG ESM ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === VARIABLES ===
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || "clave-secreta";
const DHL_CACHE_TTL_MS = Number(process.env.DHL_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const DHL_MIN_REQUEST_INTERVAL_MS = Number(process.env.DHL_MIN_REQUEST_INTERVAL_MS || 1000);
const DHL_REQUEST_TIMEOUT_MS = Number(process.env.DHL_REQUEST_TIMEOUT_MS || 10000);
const DHL_SEARCH_RADIUS = Number(process.env.DHL_SEARCH_RADIUS || 5000);
const DHL_SEARCH_LIMIT = Number(process.env.DHL_SEARCH_LIMIT || 10);

const dhlLocationCache = new Map();
const dhlInFlightRequests = new Map();
let dhlRequestQueue = Promise.resolve();
let dhlLastGlobalRequestAt = 0;

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

function roundCoordinate(value, decimals = 3) {
  return Number(value.toFixed(decimals));
}

function buildDhlSearchKey({ latitude, longitude, radius = DHL_SEARCH_RADIUS, country = "MX" }) {
  return JSON.stringify({
    lat: roundCoordinate(latitude, 3),
    lng: roundCoordinate(longitude, 3),
    radius: Number(radius) || DHL_SEARCH_RADIUS,
    country: String(country || "MX").trim().toUpperCase(),
  });
}

function getCachedDhlEntry(searchKey) {
  const entry = dhlLocationCache.get(searchKey);

  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    dhlLocationCache.delete(searchKey);
    return null;
  }

  return entry;
}

function setCachedDhlEntry(searchKey, payload) {
  const entry = {
    payload,
    storedAt: Date.now(),
    expiresAt: Date.now() + DHL_CACHE_TTL_MS,
  };

  dhlLocationCache.set(searchKey, entry);
  return entry;
}

function logDhlEvent(event, meta = {}) {
  console.log(`[dhl/locations] ${event}`, meta);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enqueueGlobalDhlRequest(task, meta = {}) {
  const previousQueue = dhlRequestQueue;
  let releaseQueue;

  dhlRequestQueue = new Promise((resolve) => {
    releaseQueue = resolve;
  });

  await previousQueue;

  try {
    const elapsed = Date.now() - dhlLastGlobalRequestAt;

    if (elapsed < DHL_MIN_REQUEST_INTERVAL_MS) {
      const waitMs = DHL_MIN_REQUEST_INTERVAL_MS - elapsed;
      logDhlEvent("global rate limit wait", { waitMs, ...meta });
      await delay(waitMs);
    }

    dhlLastGlobalRequestAt = Date.now();
    logDhlEvent("dhl request sent", meta);

    return await task();
  } finally {
    releaseQueue();
  }
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

app.get("/api/dhl/locations", async (req, res) => {
  try {
    const { lat, lng, radius = DHL_SEARCH_RADIUS, country = "MX" } = req.query;
    const latitude = Number(lat);
    const longitude = Number(lng);
    const normalizedRadius = Number(radius) || DHL_SEARCH_RADIUS;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ error: "Lat/Lng válidos requeridos" });
    }

    if (!process.env.DHL_API_KEY) {
      return res.status(503).json({
        error: "La integración con DHL no está configurada en el servidor.",
      });
    }

    const searchKey = buildDhlSearchKey({
      latitude,
      longitude,
      radius: normalizedRadius,
      country,
    });

    const cachedEntry = getCachedDhlEntry(searchKey);
    if (cachedEntry) {
      logDhlEvent("cache hit", { searchKey });
      return res.json({
        ...cachedEntry.payload,
        meta: {
          ...(cachedEntry.payload.meta || {}),
          cache: "hit",
          cachedAt: cachedEntry.storedAt,
        },
      });
    }

    logDhlEvent("cache miss", { searchKey });

    if (dhlInFlightRequests.has(searchKey)) {
      logDhlEvent("request deduplicated", { searchKey });

      try {
        const sharedPayload = await dhlInFlightRequests.get(searchKey);
        return res.json({
          ...sharedPayload,
          meta: {
            ...(sharedPayload.meta || {}),
            deduplicated: true,
          },
        });
      } catch (error) {
        if (error?.name === "AbortError") {
          logDhlEvent("aborted request", { searchKey, source: "deduplicated" });
          return res.status(499).json({ error: "Consulta cancelada" });
        }

        throw error;
      }
    }

    const dhlRequestPromise = (async () => {
      const url =
        `https://api.dhl.com/location-finder/v1/find-by-geo` +
        `?latitude=${latitude}&longitude=${longitude}&radius=${normalizedRadius}&limit=${DHL_SEARCH_LIMIT}`;

      const payload = await enqueueGlobalDhlRequest(async () => {
        const response = await fetch(url, {
          headers: {
            "DHL-API-Key": process.env.DHL_API_KEY,
          },
          signal: AbortSignal.timeout(DHL_REQUEST_TIMEOUT_MS),
        });

        const data = await response.json();

        if (!response.ok) {
          const error = new Error(data?.detail || data?.title || "Error consultando DHL");
          error.status = response.status;
          error.details = data;
          throw error;
        }

        return {
          ...data,
          meta: {
            cache: "miss",
            searchKey,
          },
        };
      }, { searchKey, url });

      setCachedDhlEntry(searchKey, payload);
      return payload;
    })();

    dhlInFlightRequests.set(searchKey, dhlRequestPromise);

    try {
      const payload = await dhlRequestPromise;
      return res.json(payload);
    } finally {
      dhlInFlightRequests.delete(searchKey);
    }
  } catch (err) {
    const { lat, lng, radius = DHL_SEARCH_RADIUS, country = "MX" } = req.query;
    const latitude = Number(lat);
    const longitude = Number(lng);
    const searchKey =
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? buildDhlSearchKey({
            latitude,
            longitude,
            radius: Number(radius) || DHL_SEARCH_RADIUS,
            country,
          })
        : null;

    if (err?.name === "AbortError") {
      logDhlEvent("aborted request", { searchKey });
      return res.status(499).json({ error: "Consulta cancelada" });
    }

    if (err?.status === 429) {
      logDhlEvent("dhl 429", { searchKey, details: err.details });

      const cachedEntry = searchKey ? getCachedDhlEntry(searchKey) : null;
      if (cachedEntry) {
        logDhlEvent("cache fallback after 429", { searchKey });
        return res.status(200).json({
          ...cachedEntry.payload,
          meta: {
            ...(cachedEntry.payload.meta || {}),
            cache: "stale-fallback",
            cachedAt: cachedEntry.storedAt,
            fallback: "dhl-429",
          },
        });
      }

      return res.status(429).json({
        error: "DHL está limitando temporalmente las consultas. Intenta de nuevo en unos segundos.",
      });
    }

    console.error("DHL error:", err);
    const status = err?.name === "TimeoutError" ? 504 : err?.status || 500;
    return res.status(status).json({
      error:
        status === 504
          ? "Tiempo de espera agotado consultando DHL"
          : err?.message || "Error consultando DHL",
      details: err?.details,
    });
  }
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
