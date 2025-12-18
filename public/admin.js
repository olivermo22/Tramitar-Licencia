// admin.js

const formsBody = document.getElementById("formsBody");
const adminError = document.getElementById("adminError");
const btnLogout = document.getElementById("btnLogout");
const ADMIN_WHATSAPP_NUMBER = "527225600905"; // tu número real

if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch (e) {
      // ignorar error
    } finally {
      window.location.href = "/login.html";
    }
  });
}

async function loadForms() {
  try {
    const res = await fetch("/api/forms");
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    if (!res.ok) {
      throw new Error("Error al cargar formularios");
    }

    const forms = await res.json();
    renderForms(forms);
  } catch (err) {
    console.error(err);
    adminError.style.display = "block";
    adminError.textContent =
      "Ocurrió un error al cargar los formularios. Recarga la página.";
  }
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderForms(forms) {
  formsBody.innerHTML = "";

  if (!forms.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "No hay formularios registrados todavía.";
    td.style.textAlign = "center";
    td.style.color = "#6b7280";
    tr.appendChild(td);
    formsBody.appendChild(tr);
    return;
  }

  const baseUrl = window.location.origin;

  for (const f of forms) {
    const tr = document.createElement("tr");

    // Fecha (incluimos número de respuesta si existe)
    const tdFecha = document.createElement("td");
    const folio = f.responseNumber ? `#${f.responseNumber} ` : "";
    tdFecha.textContent = `${folio}${formatDate(f.createdAt)}`;
    tr.appendChild(tdFecha);

    // Nombre
    const tdNombre = document.createElement("td");
    const nombreCompleto = [f.nombre, f.apellidos].filter(Boolean).join(" ");
    tdNombre.textContent = nombreCompleto || "";
    tr.appendChild(tdNombre);

    // Teléfono
    const tdTel = document.createElement("td");
    tdTel.textContent = f.telefono || "";
    tr.appendChild(tdTel);

    // CURP
    const tdCurp = document.createElement("td");
    tdCurp.textContent = f.curp || "";
    tr.appendChild(tdCurp);

    // Fotos
    const tdFotos = document.createElement("td");
    const wrapper = document.createElement("div");
    wrapper.className = "thumb-list";

    if (f.personaPhotoUrl) {
      const img = document.createElement("img");
      img.src = baseUrl + f.personaPhotoUrl;
      img.title = "Foto persona";
      img.className = "admin-thumb";
      img.onclick = () => window.open(img.src, "_blank");
      wrapper.appendChild(img);
    }

    if (f.idPhotoUrl) {
      const img = document.createElement("img");
      img.src = baseUrl + f.idPhotoUrl;
      img.title = "Identificación";
      img.className = "admin-thumb";
      img.onclick = () => window.open(img.src, "_blank");
      wrapper.appendChild(img);
    }

    if (f.firmaUrl) {
      const img = document.createElement("img");
      img.src = baseUrl + f.firmaUrl;
      img.title = "Firma";
      img.className = "admin-thumb";
      img.onclick = () => window.open(img.src, "_blank");
      wrapper.appendChild(img);
    }

    tdFotos.appendChild(wrapper);
    tr.appendChild(tdFotos);

    // Comentarios
    const tdComentarios = document.createElement("td");

    const btnReenviar = document.createElement("button");
    btnReenviar.textContent = "📲 Reenviar WhatsApp";
    btnReenviar.className = "btn-whatsapp";

btnReenviar.addEventListener("click", () => {
  const mensaje = construirMensajeWhatsApp(f);
  const text = encodeURIComponent(mensaje);
  const waUrl = `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${text}`;
  window.open(waUrl, "_blank");
});

 tdComentarios.appendChild(btnReenviar);
 tr.appendChild(tdComentarios);


    formsBody.appendChild(tr);
  }
}

function construirMensajeWhatsApp(f) {
  const lineas = [
    "SOLICITUD LICENCIA DE CONDUCIR",
    `Respuesta #${f.folio || f.id || ""}`,
    "",
    `NUM TELEFONO : ${f.telefono || ""}`,
    `TIPO DE LICENCIA : ${f.tipoLicencia || ""}`,
    `VALIDA POR : ${f.vigencia || ""}`,
    `NOMBRE COMPLETO : ${[f.nombre, f.apellidos].filter(Boolean).join(" ")}`,
    `CURP : ${f.curp || ""}`,
    `DOMICILIO DE GUERRERO ACEPTADO : ${f.domicilioGuerrero || ""}`,
    `ALERGIAS/RESTRICCIONES : ${f.alergias || "Ninguna"}`,
    `TIPO DE SANGRE : ${f.tipoSangre || ""}`,
    `CONTACTO DE EMERGENCIA : ${f.emergenciaNombre || ""} ${f.emergenciaTelefono || ""}`,
    "",
    "DATOS DE ENVÍO",
    `SUCURSAL DHL : ${f.sucursalConfirmada || ""}`,
    `NOMBRE DESTINATARIO : ${f.envioNombreDestinatario || ""}`,
    `TELÉFONO DESTINATARIO : ${f.envioTelefonoDestinatario || ""}`,
    "",
    "📍 UBICACIÓN SUCURSAL DHL",
    f.envioGoogleMaps || "",
    "",
    f.fotoPersona ? `FOTO PERSONA : ${location.origin}${f.fotoPersona}` : "",
    f.fotoIdentificacion ? `FOTO IDENTIFICACION : ${location.origin}${f.fotoIdentificacion}` : "",
    f.firma ? `FIRMA : ${location.origin}${f.firma}` : "",
  ];

  return lineas.filter(Boolean).join("\n");
}



// Cargar al entrar
loadForms();
