// app.js - Frontend principal del formulario de Gestoría Virtual

const ADMIN_WHATSAPP_NUMBER = "527225600905"; // 52 + 7225600905

// ===============================
// REFERENCIAS GENERALES
// ===============================
const btnAdmin = document.getElementById("btnAdmin");
const form = document.getElementById("solicitudForm");
const globalLoader = document.getElementById("globalLoader");

// Datos personales
const inputNombre = document.getElementById("nombre");
const inputApellidos = document.getElementById("apellidos");
const inputCurp = document.getElementById("curp");
const inputTelefono = document.getElementById("telefono");
const inputTipoLicencia = document.getElementById("tipoLicencia");
const inputVigencia = document.getElementById("vigencia");
const inputDomicilioGuerrero = document.getElementById("domicilioGuerrero");
const inputAlergias = document.getElementById("alergias");
const inputTipoSangre = document.getElementById("tipoSangre");
const inputEmergenciaNombre = document.getElementById("emergenciaNombre");
const inputEmergenciaTelefono = document.getElementById("emergenciaTelefono");

// Datos de envío
const inputEnvioNombreDestinatario = document.getElementById("envioNombreDestinatario");
const inputEnvioTelefonoDestinatario = document.getElementById("envioTelefonoDestinatario");
const inputEnvioCalle = document.getElementById("envioCalle");
const inputEnvioNumero = document.getElementById("envioNumero");
const inputEnvioColonia = document.getElementById("envioColonia");
const inputEnvioCP = document.getElementById("envioCP");
const inputEnvioCiudadEstado = document.getElementById("envioCiudadEstado");

// Inputs ocultos para URLs
const inputPersonaPhotoUrl = document.getElementById("personaPhotoUrl");
const inputIdPhotoUrl = document.getElementById("idPhotoUrl");
const inputFirmaUrl = document.getElementById("firmaUrl");

// Foto persona
const btnPersonaCamera = document.getElementById("btnPersonaCamera");
const btnPersonaFile = document.getElementById("btnPersonaFile");
const fotoPersonaInput = document.getElementById("fotoPersonaInput");
const fotoPersonaPreview = document.getElementById("fotoPersonaPreview");
const fotoPersonaActions = document.getElementById("fotoPersonaActions");
const btnPersonaUsar = document.getElementById("btnPersonaUsar");
const btnPersonaCambiar = document.getElementById("btnPersonaCambiar");

// Foto identificación
const btnIdCamera = document.getElementById("btnIdCamera");
const btnIdFile = document.getElementById("btnIdFile");
const fotoIdInput = document.getElementById("fotoIdInput");
const fotoIdPreview = document.getElementById("fotoIdPreview");
const fotoIdActions = document.getElementById("fotoIdActions");
const btnIdUsar = document.getElementById("btnIdUsar");
const btnIdCambiar = document.getElementById("btnIdCambiar");

// Firma
const tabFirmaSubir = document.getElementById("tabFirmaSubir");
const tabFirmaDibujar = document.getElementById("tabFirmaDibujar");
const firmaSubirPanel = document.getElementById("firmaSubirPanel");
const firmaDibujarPanel = document.getElementById("firmaDibujarPanel");

const fotoFirmaInput = document.getElementById("fotoFirmaInput");
const firmaPreview = document.getElementById("firmaPreview");

const signaturePad = document.getElementById("signaturePad");
const btnLimpiarFirma = document.getElementById("btnLimpiarFirma");
const btnConfirmarFirmaCanvas = document.getElementById("btnConfirmarFirmaCanvas");
const firmaActions = document.getElementById("firmaActions");
const btnFirmaCambiar = document.getElementById("btnFirmaCambiar");

// Cámara
const cameraModal = document.getElementById("cameraModal");
const cameraVideo = document.getElementById("cameraVideo");
const cameraSilhouette = document.getElementById("cameraSilhouette");
const takePhotoBtn = document.getElementById("takePhotoBtn");
const closeCameraBtn = document.getElementById("closeCameraBtn");

let cameraStream = null;
let cameraCallback = null;

let userLat = null;
let userLng = null;
let map = null;
let markers = [];
let debounceTimeout = null;
let userMarker = null;
let sucursalPendiente = null;
let sucursalConfirmada = null;

// Estado interno
let personaUrl = "";
let idUrl = "";
let firmaUrl = "";

// ===============================
// NAVEGACIÓN PANEL ADMIN
// ===============================
if (btnAdmin) {
  btnAdmin.addEventListener("click", () => {
    window.location.href = "/login.html";
  });
}

navigator.geolocation.getCurrentPosition(
  async (pos) => {
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;
    await cargarSucursales(userLat, userLng, true);
  },
  () => {
    alert("Debes permitir el acceso a tu ubicación para mostrar sucursales DHL");
  }
);

async function cargarSucursales(lat, lng, inicial = false) {
  const res = await fetch(`/api/dhl/locations?lat=${lat}&lng=${lng}`);
  const data = await res.json();

  if (!data.locations || data.locations.length === 0) {
    return;
  }

  if (inicial) {
    initMap(lat, lng, data.locations);
  } else {
    actualizarMarkers(data.locations);
  }
}

function initMap(lat, lng, locations) {
  map = L.map("map").setView([lat, lng], 13); // 👈 más alejado

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  // 📍 marcador de ubicación actual
  userMarker = L.circleMarker([lat, lng], {
    radius: 8,
    color: "#1a73e8",
    fillColor: "#1a73e8",
    fillOpacity: 0.9,
  }).addTo(map);

  actualizarMarkers(locations);

  map.on("moveend", () => {
    const center = map.getCenter();

    if (debounceTimeout) clearTimeout(debounceTimeout);

    debounceTimeout = setTimeout(() => {
      cargarSucursales(center.lat, center.lng, false);
    }, 600);
  });
}


document
  .getElementById("btnCentrarUbicacion")
  .addEventListener("click", () => {
    if (!userLat || !userLng || !map) return;

    map.setView([userLat, userLng], 14);
  });


function actualizarMarkers(locations) {
  markers.forEach((m) => map.removeLayer(m));
  markers = [];

  locations.forEach((loc) => {
    const marker = L.marker([
      loc.place.geo.latitude,
      loc.place.geo.longitude,
    ]).addTo(map);

    marker.bindPopup(`<b>${loc.name}</b>`);

    marker.on("click", () => {
      seleccionarSucursal(loc);
    });

    markers.push(marker);
  });
}

function calcularDistanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;

  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function seleccionarSucursal(loc) {
  sucursalPendiente = loc;

  const addr = loc.place.address;

  const distancia = calcularDistanciaMetros(
    userLat,
    userLng,
    loc.place.geo.latitude,
    loc.place.geo.longitude
  );

  const direccionCompleta =
    `${addr.streetAddress}, ${addr.addressLocality}, ` +
    `CP ${addr.postalCode}, ${addr.countryCode || "MX"}`;

  const googleMapsLink =
    `https://www.google.com/maps?q=${loc.place.geo.latitude},${loc.place.geo.longitude}`;

  document.getElementById("modalSucursalNombre").textContent = loc.name;

  document.getElementById("modalSucursalDireccion").innerHTML = `
    <p>${direccionCompleta}</p>
    <p><strong>Distancia:</strong> ${distancia} m</p>
    <a href="${googleMapsLink}" target="_blank">📍 Ver en Google Maps</a>
  `;

  document.getElementById("modalSucursal").classList.remove("hidden");
}


// ===============================
// HELPERS UI
// ===============================
function showGlobalLoader(show) {
  if (!globalLoader) return;
  globalLoader.style.display = show ? "flex" : "none";
}

function setPreviewLoading(container) {
  if (!container) return;
  container.classList.add("loading");
  const placeholder = container.querySelector(".placeholder");
  if (placeholder) {
    placeholder.textContent = "Procesando...";
  }
  const img = container.querySelector("img");
  if (img) img.src = "";
}

function setPreviewImage(container, url, altText) {
  if (!container) return;
  container.classList.remove("empty", "loading");
  container.innerHTML = "";
  const img = document.createElement("img");
  img.src = url;
  img.alt = altText || "";
  container.appendChild(img);
}

function resetPreview(container, placeholderText) {
  if (!container) return;
  container.classList.add("empty");
  container.innerHTML = "";
  const span = document.createElement("span");
  span.className = "placeholder";
  span.textContent = placeholderText || "Aún no hay imagen";
  container.appendChild(span);
}

// ===============================
// CÁMARA – SELECCIONAR MEJOR LENTE
// ===============================

// Detectar la mejor cámara trasera REAL del dispositivo
async function getBestRearCamera() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  
  // Obtener todas las cámaras de video
  const videoDevices = devices.filter(d => d.kind === "videoinput");

  // Si no hay cámaras, retornar null
  if (videoDevices.length === 0) return null;

  let bestDeviceId = null;
  let bestResolution = 0;

  // Probar cada cámara trasera (Chrome NO dice rear, así que probamos todas)
  for (const device of videoDevices) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: device.deviceId } },
      });

      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};

      const width = capabilities.width?.max || 0;
      const height = capabilities.height?.max || 0;
      const megapixels = width * height;

      // Cerrar stream
      track.stop();

      // Elegimos la cámara de mayor resolución
      if (megapixels > bestResolution) {
        bestResolution = megapixels;
        bestDeviceId = device.deviceId;
      }
    } catch (err) {
      // Algunas cámaras fallan al pedir stream → las ignoramos
      continue;
    }
  }

  return bestDeviceId;
}


// Abrir cámara (frontal o trasera)
async function openCamera(callback, options = { silhouette: true, rearCamera: false }) {
  cameraCallback = callback;

  if (cameraSilhouette) {
    cameraSilhouette.style.display = options.silhouette ? "block" : "none";
  }

  cameraModal.style.display = "flex";

  try {
    let constraints;

    if (options.rearCamera) {
      const rearDeviceId = await getBestRearCamera();

      if (rearDeviceId) {
        constraints = {
          video: {
            deviceId: { exact: rearDeviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        };
      } else {
        constraints = {
          video: { facingMode: "environment" },
          audio: false
        };
      }
    } else {
      constraints = {
        video: { facingMode: "user" },
        audio: false
      };
    }

    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    cameraVideo.srcObject = cameraStream;

  } catch (err) {
    console.error("Error accediendo a la cámara:", err);
    alert("No se pudo acceder a la cámara. Revisa permisos.");
    closeCamera();
  }
}

function closeCamera() {
  cameraModal.style.display = "none";

  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }

  cameraCallback = null;
}

takePhotoBtn.addEventListener("click", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = cameraVideo.videoWidth;
  canvas.height = cameraVideo.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise(resolve =>
    canvas.toBlob(resolve, "image/jpeg", 0.95)
  );

  if (!blob) {
    alert("No se pudo obtener la foto.");
    return;
  }

  if (cameraCallback) {
    await cameraCallback(blob);
  }

  closeCamera();
});

closeCameraBtn.addEventListener("click", closeCamera);


// ===============================
// SUBIDA DE IMÁGENES
// ===============================
async function uploadImage(fileOrBlob, type) {
  const formData = new FormData();
  formData.append("image", fileOrBlob);

  const res = await fetch(`/api/upload/image?type=${encodeURIComponent(type)}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error("Error subiendo la imagen al servidor");
  }

  const data = await res.json();
  if (!data.url) {
    throw new Error("El servidor no devolvió la URL de la imagen");
  }
  return data.url;
}

// ===============================
// FOTO PERSONA
// ===============================
if (btnPersonaFile && fotoPersonaInput) {
  btnPersonaFile.addEventListener("click", () => {
    fotoPersonaInput.click();
  });

  fotoPersonaInput.addEventListener("change", async () => {
    const file = fotoPersonaInput.files[0];
    if (!file) return;
    await handlePersonaImage(file);
  });
}

if (btnPersonaCamera) {
  btnPersonaCamera.addEventListener("click", () => {
    // Persona: cámara frontal + silueta
    openCamera(
      async (blob) => {
        await handlePersonaImage(blob);
      },
      { silhouette: true, rearCamera: false }
    );
  });
}

async function handlePersonaImage(fileOrBlob) {
  try {
    setPreviewLoading(fotoPersonaPreview);
    showGlobalLoader(true);

    const url = await uploadImage(fileOrBlob, "persona");
    personaUrl = url;
    if (inputPersonaPhotoUrl) inputPersonaPhotoUrl.value = url;

    setPreviewImage(fotoPersonaPreview, url, "Foto de la persona");
    if (fotoPersonaActions) fotoPersonaActions.style.display = "flex";

    if (btnPersonaUsar) {
      btnPersonaUsar.onclick = () => {
        alert("Foto de la persona confirmada.");
      };
    }

    if (btnPersonaCambiar) {
      btnPersonaCambiar.onclick = () => {
        personaUrl = "";
        if (inputPersonaPhotoUrl) inputPersonaPhotoUrl.value = "";
        resetPreview(fotoPersonaPreview, "Aún no hay foto");
        if (fotoPersonaActions) fotoPersonaActions.style.display = "none";
      };
    }
  } catch (err) {
    console.error(err);
    alert("Ocurrió un error al procesar la foto de la persona.");
    resetPreview(fotoPersonaPreview, "Aún no hay foto");
    if (fotoPersonaActions) fotoPersonaActions.style.display = "none";
  } finally {
    showGlobalLoader(false);
  }
}

// ===============================
// FOTO IDENTIFICACIÓN
// ===============================
if (btnIdFile && fotoIdInput) {
  btnIdFile.addEventListener("click", () => {
    fotoIdInput.click();
  });

  fotoIdInput.addEventListener("change", async () => {
    const file = fotoIdInput.files[0];
    if (!file) return;
    await handleIdImage(file);
  });
}

if (btnIdCamera) {
  btnIdCamera.addEventListener("click", () => {
    // Identificación: cámara trasera + SIN silueta
    openCamera(
      async (blob) => {
        await handleIdImage(blob);
      },
      { silhouette: false, rearCamera: true }
    );
  });
}

async function handleIdImage(fileOrBlob) {
  try {
    setPreviewLoading(fotoIdPreview);
    showGlobalLoader(true);

    const url = await uploadImage(fileOrBlob, "identificacion");
    idUrl = url;
    if (inputIdPhotoUrl) inputIdPhotoUrl.value = url;

    setPreviewImage(fotoIdPreview, url, "Identificación");
    if (fotoIdActions) fotoIdActions.style.display = "flex";

    if (btnIdUsar) {
      btnIdUsar.onclick = () => {
        alert("Foto de identificación confirmada.");
      };
    }

    if (btnIdCambiar) {
      btnIdCambiar.onclick = () => {
        idUrl = "";
        if (inputIdPhotoUrl) inputIdPhotoUrl.value = "";
        resetPreview(fotoIdPreview, "Aún no hay foto");
        if (fotoIdActions) fotoIdActions.style.display = "none";
      };
    }
  } catch (err) {
    console.error(err);
    alert("Ocurrió un error al procesar la foto de identificación.");
    resetPreview(fotoIdPreview, "Aún no hay foto");
    if (fotoIdActions) fotoIdActions.style.display = "none";
  } finally {
    showGlobalLoader(false);
  }
}

// ===============================
// FIRMA - TABS (SUBIR / DIBUJAR)
// ===============================
if (tabFirmaSubir && tabFirmaDibujar && firmaSubirPanel && firmaDibujarPanel) {
  tabFirmaSubir.addEventListener("click", () => {
    tabFirmaSubir.classList.add("active");
    tabFirmaDibujar.classList.remove("active");
    firmaSubirPanel.style.display = "block";
    firmaDibujarPanel.style.display = "none";
  });

  tabFirmaDibujar.addEventListener("click", () => {
    tabFirmaSubir.classList.remove("active");
    tabFirmaDibujar.classList.add("active");
    firmaSubirPanel.style.display = "none";
    firmaDibujarPanel.style.display = "block";
    initSignaturePad();
  });
}

// ===============================
// FIRMA - SUBIR ARCHIVO
// ===============================
if (fotoFirmaInput) {
  fotoFirmaInput.addEventListener("change", async () => {
    const file = fotoFirmaInput.files[0];
    if (!file) return;

    try {
      setPreviewLoading(firmaPreview);
      showGlobalLoader(true);

      const url = await uploadImage(file, "firma");
      firmaUrl = url;
      if (inputFirmaUrl) inputFirmaUrl.value = url;

      setPreviewImage(firmaPreview, url, "Firma");
      if (firmaActions) firmaActions.style.display = "flex";
    } catch (err) {
      console.error(err);
      alert("Error subiendo la firma.");
      resetPreview(firmaPreview, "Aún no hay firma");
      if (firmaActions) firmaActions.style.display = "none";
    } finally {
      showGlobalLoader(false);
    }
  });
}

// ===============================
// FIRMA - DIBUJAR EN CANVAS
// ===============================
let firmaCtx = null;
let drawing = false;

function initSignaturePad() {
  if (!signaturePad) return;

  const rect = signaturePad.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  signaturePad.width = rect.width * dpr;
  signaturePad.height = rect.height * dpr;

  firmaCtx = signaturePad.getContext("2d");
  firmaCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  firmaCtx.fillStyle = "#ffffff";
  firmaCtx.fillRect(0, 0, rect.width, rect.height);

  firmaCtx.lineWidth = 2;
  firmaCtx.lineCap = "round";
  firmaCtx.strokeStyle = "#111827";
}

function getCanvasPos(e) {
  const rect = signaturePad.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

if (signaturePad) {
  ["mousedown", "touchstart"].forEach((ev) => {
    signaturePad.addEventListener(ev, (e) => {
      e.preventDefault();
      if (!firmaCtx) initSignaturePad();
      drawing = true;
      const { x, y } = getCanvasPos(e);
      firmaCtx.beginPath();
      firmaCtx.moveTo(x, y);
    });
  });

  ["mousemove", "touchmove"].forEach((ev) => {
    signaturePad.addEventListener(ev, (e) => {
      if (!drawing || !firmaCtx) return;
      e.preventDefault();
      const { x, y } = getCanvasPos(e);
      firmaCtx.lineTo(x, y);
      firmaCtx.stroke();
    });
  });

  ["mouseup", "mouseleave", "touchend", "touchcancel"].forEach((ev) => {
    signaturePad.addEventListener(ev, (e) => {
      if (!drawing) return;
      e.preventDefault();
      drawing = false;
    });
  });
}

if (btnLimpiarFirma && signaturePad) {
  btnLimpiarFirma.addEventListener("click", () => {
    initSignaturePad();
    resetPreview(firmaPreview, "Aún no hay firma");
    if (firmaActions) firmaActions.style.display = "none";
    firmaUrl = "";
    if (inputFirmaUrl) inputFirmaUrl.value = "";
  });
}

if (btnConfirmarFirmaCanvas && signaturePad) {
  btnConfirmarFirmaCanvas.addEventListener("click", () => {
    if (!firmaCtx) {
      alert("Primero dibuja tu firma.");
      return;
    }

    signaturePad.toBlob(
      async (blob) => {
        if (!blob) {
          alert("No se pudo leer la firma dibujada.");
          return;
        }
        try {
          setPreviewLoading(firmaPreview);
          showGlobalLoader(true);

          const url = await uploadImage(blob, "firma");
          firmaUrl = url;
          if (inputFirmaUrl) inputFirmaUrl.value = url;

          setPreviewImage(firmaPreview, url, "Firma");
          if (firmaActions) firmaActions.style.display = "flex";
        } catch (err) {
          console.error(err);
          alert("Error subiendo la firma dibujada.");
          resetPreview(firmaPreview, "Aún no hay firma");
          if (firmaActions) firmaActions.style.display = "none";
        } finally {
          showGlobalLoader(false);
        }
      },
      "image/png"
    );
  });
}

if (btnFirmaCambiar) {
  btnFirmaCambiar.addEventListener("click", () => {
    firmaUrl = "";
    if (inputFirmaUrl) inputFirmaUrl.value = "";
    resetPreview(firmaPreview, "Aún no hay firma");
    if (firmaActions) firmaActions.style.display = "none";
  });
}

// ===============================
// ENVÍO DEL FORMULARIO
// ===============================
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nombre = inputNombre.value.trim();
    const apellidos = inputApellidos.value.trim();
    const curp = inputCurp.value.trim();
    const telefono = inputTelefono.value.trim();
    const tipoLicencia = inputTipoLicencia.value;
    const vigencia = inputVigencia.value;
    const domicilioAceptado = inputDomicilioGuerrero.checked;
    const alergias = inputAlergias.value.trim();
    const tipoSangre = inputTipoSangre.value;
    const emergenciaNombre = inputEmergenciaNombre.value.trim();
    const emergenciaTelefono = inputEmergenciaTelefono.value.trim();

    const envioNombreDestinatario = inputEnvioNombreDestinatario.value.trim();
    const envioTelefonoDestinatario = inputEnvioTelefonoDestinatario.value.trim();
    const envioCalle = inputEnvioCalle.value.trim();
    const envioNumero = inputEnvioNumero.value.trim();
    const envioColonia = inputEnvioColonia.value.trim();
    const envioCP = inputEnvioCP.value.trim();
    const envioCiudadEstado = inputEnvioCiudadEstado.value.trim();
    const envioSucursalId = document.getElementById("envioSucursalId").value;
    const envioSucursalNombre = document.getElementById("sucursalSeleccionada").value;
  



    if (!nombre || !apellidos || !curp || !telefono) {
      alert("Por favor, llena al menos Nombre(s), Apellidos, CURP y Teléfono.");
      return;
    }

    if (!tipoLicencia) {
      alert("Selecciona el tipo de licencia.");
      return;
    }

    if (!vigencia) {
      alert("Selecciona la vigencia de la licencia.");
      return;
    }

    if (!domicilioAceptado) {
      alert("Debes aceptar que la licencia lleve domicilio del estado de Guerrero.");
      return;
    }

    if (!tipoSangre) {
      alert("Selecciona el tipo de sangre.");
      return;
    }

    if (!emergenciaNombre || !emergenciaTelefono) {
      alert("Completa los datos de contacto de emergencia.");
      return;
    }

    if (
      !envioNombreDestinatario ||
      !envioTelefonoDestinatario
    ) {
      alert("Completa todos los datos de envío.");
      return;
    }

    if (!document.getElementById("envioSucursalId").value) {
      alert("Selecciona una sucursal DHL para el envío.");
      return;
    }

    if (!sucursalConfirmada) {
      alert("Debes confirmar una sucursal DHL antes de continuar");
      return;
    }

    if (!personaUrl) {
      alert("Falta la foto de la persona.");
      return;
    }
    if (!idUrl) {
      alert("Falta la foto de la identificación.");
      return;
    }
    if (!firmaUrl) {
      alert("Falta la firma.");
      return;
    }

    const payload = {
      nombre,
      apellidos,
      curp,
      telefono,
      tipoLicencia,
      vigencia,
      domicilioAceptado,
      alergias,
      tipoSangre,
      emergenciaNombre,
      emergenciaTelefono,
      envioNombreDestinatario,
      envioTelefonoDestinatario,
      envioCalle,
      envioNumero,
      envioColonia,
      envioCP,
      envioCiudadEstado,
      envioSucursalId,
      envioSucursalNombre,
      personaPhotoUrl: personaUrl,
      idPhotoUrl: idUrl,
      firmaUrl,
    };

    try {
      showGlobalLoader(true);

      // 1) Guardar en el servidor para el panel admin (y obtener # de respuesta)
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Error guardando el formulario en el servidor");
      }

      const data = await res.json();
      const folio = data?.form?.responseNumber || data?.form?.id || "----";

      // 2) Construir mensaje de WhatsApp
      const licenciaMap = {
        A: "AUTOMOVILISTA - A",
        C: "CHOFER - C",
        M: "MOTOCICLISTA - M",
      };
      const vigenciaMap = {
        "3": "3 AÑOS $650",
        "5": "5 AÑOS $700",
      };

      const licenciaTexto = licenciaMap[tipoLicencia] || tipoLicencia;
      const vigenciaTexto = vigenciaMap[vigencia] || vigencia;
      const domicilioTexto = domicilioAceptado ? "SI" : "NO";
      const nombreCompleto = `${nombre} ${apellidos}`.trim();
      const baseUrl = window.location.origin;

      const lineas = [
        "SOLICITUD LICENCIA DE CONDUCIR",
        `Respuesta #${folio}`,
        "",
        `NUM TELEFONO : ${telefono}`,
        `TIPO DE LICENCIA : ${licenciaTexto}`,
        `VALIDA POR : ${vigenciaTexto}`,
        `NOMBRE COMPLETO : ${nombreCompleto}`,
        `CURP : ${curp}`,
        `DOMICILIO DE GUERRERO ACEPTADO : ${domicilioTexto}`,
        `ALERGIAS/RESTRICCIONES : ${alergias || "Ninguna"}`,
        `TIPO DE SANGRE : ${tipoSangre}`,
        `CONTACTO DE EMERGENCIA : ${emergenciaNombre} ${emergenciaTelefono}`,
        "",
        "DATOS DE ENVÍO",
        `SUCURSAL DHL : ${document.getElementById("sucursalSeleccionada").value}`,
        `NOMBRE DESTINATARIO : ${envioNombreDestinatario}`,
        `TELÉFONO DESTINATARIO : ${envioTelefonoDestinatario}`,
        `📍 Sucursal DHL: ${sucursalConfirmada.name}`,
        `📌 Ubicación: ${document.getElementById("envioGoogleMaps").value}`,
        "",
        `FOTO PERSONA : ${baseUrl}${personaUrl}`,
        `FOTO IDENTIFICACION : ${baseUrl}${idUrl}`,
        `FIRMA : ${baseUrl}${firmaUrl}`,
      ];

      const text = encodeURIComponent(lineas.join("\n"));
      const waUrl = `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${text}`;
      window.location.href = waUrl;
    } catch (err) {
      console.error(err);
      alert(
        "Ocurrió un error al guardar o enviar la solicitud. Intenta de nuevo."
      );
    } finally {
      showGlobalLoader(false);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("modalSucursal");
  const btnCancelar = document.getElementById("btnCancelarSucursal");
  const btnConfirmar = document.getElementById("btnConfirmarSucursal");

  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => {
      sucursalPendiente = null;
      modal.classList.add("hidden");
    });
  }

  if (btnConfirmar) {
    btnConfirmar.addEventListener("click", () => {
  if (!sucursalPendiente) return;

  const loc = sucursalPendiente;
  const addr = loc.place.address;

  sucursalConfirmada = loc;

  document.getElementById("sucursalSeleccionada").value =
    `${loc.name} – ${addr.streetAddress}, ${addr.addressLocality}`;

  inputEnvioCalle.value = addr.streetAddress || "";
  inputEnvioColonia.value = addr.addressLocality || "";
  inputEnvioCP.value = addr.postalCode || "";
  inputEnvioCiudadEstado.value =
    `${addr.addressLocality}, ${addr.countryCode || "MX"}`;

  document.getElementById("envioSucursalId").value =
    loc.location.ids[0].locationId;

  document.getElementById("envioGoogleMaps").value =
    `https://www.google.com/maps?q=${loc.place.geo.latitude},${loc.place.geo.longitude}`;

  modal.classList.add("hidden");
  sucursalPendiente = null;
});
  }
});
