const form = document.getElementById("login-form");
const errorBox = document.getElementById("login-error");
const submitButton = document.getElementById("login-submit");
const loading = document.getElementById("login-loading");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.textContent = "";
  submitButton.disabled = true;
  submitButton.textContent = "Memproses...";
  loading.classList.remove("hidden");

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: document.getElementById("username").value,
        password: document.getElementById("password").value,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Login gagal");
    }

    const next = new URLSearchParams(window.location.search).get("next") || "/";
    window.location.href = next;
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    loading.classList.add("hidden");
    submitButton.disabled = false;
    submitButton.textContent = "Masuk";
  }
});
