// login.js
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const btnVolverForm = document.getElementById("btnVolverForm");

if (btnVolverForm) {
  btnVolverForm.addEventListener("click", () => {
    window.location.href = "/";
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        loginError.style.display = "block";
        loginError.textContent = "Usuario o contraseña incorrectos.";
        return;
      }

      window.location.href = "/admin.html";
    } catch (err) {
      console.error(err);
      loginError.style.display = "block";
      loginError.textContent = "Error de conexión. Intenta de nuevo.";
    }
  });
}
