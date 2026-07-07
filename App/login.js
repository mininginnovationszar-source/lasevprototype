/**
 * LASEV RESORT — Login Page Logic (login.js)
 * Login: Full Name + Password only.
 */
"use strict";
document.addEventListener("DOMContentLoaded", () => {
  if (Auth.getSession()) { window.location.href = "index.html"; return; }
  lucide.createIcons();

  // Live clock
  function tickClock() {
    const n = new Date();
    document.getElementById("loginClock").textContent = n.toLocaleTimeString("en-ZA",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    document.getElementById("loginDate").textContent  = n.toLocaleDateString("en-ZA",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  }
  tickClock(); setInterval(tickClock, 1000);

  const form       = document.getElementById("loginForm");
  const nameInput  = document.getElementById("loginName");
  const pwInput    = document.getElementById("loginPassword");
  const nameErr    = document.getElementById("nameError");
  const pwErr      = document.getElementById("pwError");
  const remChk     = document.getElementById("rememberMe");
  const signinBtn  = document.getElementById("signinBtn");
  const signinTxt  = document.getElementById("signinText");
  const spinner    = document.getElementById("signinSpinner");
  const togglePw   = document.getElementById("togglePw");

  // Password toggle
  let pwVisible = false;
  togglePw.addEventListener("click", () => {
    pwVisible = !pwVisible;
    pwInput.type = pwVisible ? "text" : "password";
    togglePw.innerHTML = `<i data-lucide="${pwVisible?"eye-off":"eye"}"></i>`;
    lucide.createIcons({nodes:[togglePw]});
  });

  // Inline validation
  nameInput.addEventListener("input", () => { if(nameErr.textContent) validateName(); });
  pwInput.addEventListener("input",   () => { if(pwErr.textContent)   validatePw(); });

  function validateName() {
    const v = nameInput.value.trim();
    if (!v) { setErr(nameInput,nameErr,"Your name is required."); return false; }
    clrErr(nameInput,nameErr); return true;
  }
  function validatePw() {
    if (!pwInput.value) { setErr(pwInput,pwErr,"Password is required."); return false; }
    clrErr(pwInput,pwErr); return true;
  }
  function setErr(el,span,msg){ el.classList.add("error"); span.textContent=msg; }
  function clrErr(el,span){ el.classList.remove("error"); span.textContent=""; }

  // Submit
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!validateName() | !validatePw()) return;
    setLoading(true);
    const result = await Auth.login(nameInput.value.trim(), pwInput.value, remChk.checked);
    setLoading(false);
    if (result.success) {
      signinBtn.style.background = "#3b7a47";
      signinTxt.style.display = "block";
      signinTxt.textContent = `Welcome, ${result.user.name.split(" ")[0]}!`;
      setTimeout(() => { window.location.href = "index.html"; }, 600);
    } else {
      form.classList.add("shake");
      setTimeout(() => form.classList.remove("shake"), 450);
      if (result.error?.toLowerCase().includes("name") || result.error?.toLowerCase().includes("account")) {
        setErr(nameInput,nameErr,result.error);
      } else {
        setErr(pwInput,pwErr,result.error||"Login failed. Please try again.");
      }
    }
  });

  function setLoading(on) {
    signinBtn.disabled = on;
    signinTxt.style.display = on ? "none" : "block";
    spinner.style.display = on ? "block" : "none";
  }

  // Forgot modal
  const forgotModal = document.getElementById("forgotModal");
  document.getElementById("forgotBtn").addEventListener("click", () => forgotModal.classList.add("open"));
  document.getElementById("closeForgot").addEventListener("click", () => forgotModal.classList.remove("open"));
  document.getElementById("closeForgotBtn").addEventListener("click", () => forgotModal.classList.remove("open"));
  forgotModal.addEventListener("click", e => { if(e.target===forgotModal) forgotModal.classList.remove("open"); });
  document.addEventListener("keydown", e => { if(e.key==="Escape") forgotModal.classList.remove("open"); });

  // Shake CSS
  const s = document.createElement("style");
  s.textContent = `@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}#loginForm.shake{animation:shake .4s ease}`;
  document.head.appendChild(s);
});
