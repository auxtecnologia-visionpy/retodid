const API_URL = "https://script.google.com/macros/s/AKfycbzdCCdMK1b63sydBYiVYbBY7VANfPyPYJGXg4dNDmQ5y6oZKn2U0e1GS0KCbB4MlQiE/exec";
const API_TIMEOUT_MS = 15_000;
const CHEAT_MESSAGE = "JAJAJA MALDITO TRAMPOSO NO PUEDES RESPONDER UNAS SIMPLES PREGUNTAS? ANDA VE, HAZ TRAMPA. PERO DATE POR ENTERADO QUE TODOS SABEMOS QUE HACES TRAMPA!";

let quiz = {};
let questions = [];
let leaders = [];
let deck = [];
let current = 0;
let responses = [];
let attemptId = null;
let quizActive = false;
let isSubmitting = false;
let memoryClientId = null;
let toastTimer;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(text) {
  const element = document.createElement("div");
  element.textContent = text == null ? "" : String(text);
  return element.innerHTML;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getClientId() {
  try {
    let id = localStorage.getItem("didClientId");
    if (!id) {
      id = randomId();
      localStorage.setItem("didClientId", id);
    }
    return id;
  } catch {
    memoryClientId ||= randomId();
    return memoryClientId;
  }
}

function friendlyError(error) {
  if (error.name === "AbortError") return "La conexión tardó demasiado. Intentá nuevamente.";
  if (error instanceof TypeError) return "No hay conexión con el servidor. Revisá tu internet e intentá nuevamente.";
  return error.message || "Ocurrió un error inesperado. Intentá nuevamente.";
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    let payload;
    try {
      payload = JSON.parse(await response.text());
    } catch {
      throw new Error("El servidor no respondió correctamente. Intentá nuevamente en unos minutos.");
    }
    if (!response.ok || payload.error) throw new Error(payload.error || "No fue posible completar la conexión.");
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function isValidQuestion(question) {
  return question && question.id && question.question && Array.isArray(question.options) && question.options.length >= 2
    && Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length;
}

function renderBoard() {
  const list = $("#leaderboard-list");
  if (!leaders.length) {
    list.innerHTML = '<li class="leaderboard-empty">Todavía no hay resultados. ¡Completá el reto y sumate al tablero!</li>';
    return;
  }
  list.innerHTML = leaders.slice(0, 10).map((entry, index) => {
    const points = Number(entry.points) || 0;
    return `<li><span class="rank">${index + 1}</span><span class="participant"><strong>${escapeHtml(entry.name || "Participante")}</strong><small>${escapeHtml(entry.branch)}</small></span><span class="points">${points} puntos</span></li>`;
  }).join("");
}

function setBranchOptions(branches) {
  const select = $("#participant-branch");
  const previous = select.value;
  select.replaceChildren(new Option("Seleccioná tu Entidad/Sucursal", "", true, true));
  select.options[0].disabled = true;
  [...new Set(branches.filter(Boolean))].forEach((branch) => select.add(new Option(branch, branch)));
  if (previous && branches.includes(previous)) select.value = previous;
}

// Muestra un texto que viene de la planilla; si está vacío, oculta el elemento.
function setText(selector, text) {
  const element = $(selector);
  element.textContent = text || "";
  element.hidden = !text;
}

function setLoadState(state, message = "") {
  const ready = state === "ready";
  $$(".start-quiz").forEach((button) => { button.disabled = !ready; });
  $("#retry-load").hidden = state !== "error";
  $("#load-status").textContent = message;
  $("#load-status").classList.toggle("is-error", state === "error");
}

async function loadData() {
  setLoadState("loading", "");
  $("#question-count").textContent = "Cargando preguntas…";
  $("#connection-state").textContent = "Cargando…";
  try {
    const data = await fetchJson(`${API_URL}?action=bootstrap`, { cache: "no-store" });
    quiz = data.quiz || {};
    setText("#quiz-title", quiz.title);
    setText("#quiz-description", quiz.description);
    questions = (data.questions || []).filter(isValidQuestion);
    leaders = data.leaderboard || [];
    setBranchOptions(data.branches || []);
    renderBoard();
    $("#connection-state").textContent = "Tablero actualizado";
    if (!questions.length) {
      $("#question-count").textContent = "Sin preguntas disponibles";
      setLoadState("error", "Todavía no hay preguntas activas. Volvé a intentarlo más tarde.");
      return;
    }
    $("#question-count").textContent = `${questions.length} ${questions.length === 1 ? "pregunta" : "preguntas"}`;
    setLoadState("ready");
  } catch (error) {
    questions = [];
    $("#question-count").textContent = "Reto no disponible";
    $("#connection-state").textContent = "Sin conexión";
    $("#leaderboard-list").innerHTML = '<li class="leaderboard-empty">No pudimos cargar el tablero.</li>';
    setLoadState("error", `No pudimos cargar el reto. ${friendlyError(error)}`);
  }
}

function lockPage() {
  quizActive = true;
  document.body.classList.add("quiz-active");
  history.pushState({ quiz: true }, "");
}

function unlockPage() {
  quizActive = false;
  document.body.classList.remove("quiz-active");
}

function beginQuiz() {
  if (quizActive || !questions.length) return;
  deck = shuffle(questions).map((question) => {
    const order = question.options.map((_, index) => index);
    return { ...question, order: question.shuffle ? shuffle(order) : order };
  });
  current = 0;
  responses = [];
  attemptId = randomId();
  lockPage();
  $("#quiz").hidden = false;
  window.scrollTo({ top: 0 });
  renderQuestion();
}

function renderQuestion() {
  const question = deck[current];
  $("#quiz-progress").textContent = `${current + 1} / ${deck.length}`;
  $("#progress-fill").style.width = `${((current + 1) / deck.length) * 100}%`;
  $("#question-text").textContent = question.question;
  $("#feedback").hidden = true;
  $("#answers").replaceChildren(...question.order.map((optionIndex) => {
    const button = document.createElement("button");
    button.className = "answer";
    button.type = "button";
    button.dataset.index = optionIndex;
    button.textContent = question.options[optionIndex];
    button.addEventListener("click", () => answer(optionIndex));
    return button;
  }));
  $("#question-text").focus({ preventScroll: true });
}

function answer(selected) {
  const question = deck[current];
  if (responses.length > current) return;
  responses.push({ id: question.id, selected });
  const right = selected === question.answer;
  $$(".answer").forEach((button) => {
    const index = Number(button.dataset.index);
    button.disabled = true;
    if (index === question.answer) button.classList.add("correct");
    else if (index === selected) button.classList.add("incorrect");
  });

  const title = document.createElement("h3");
  title.textContent = (right ? quiz.correctMessage : quiz.incorrectMessage) || (right ? "Correcto" : "Incorrecto");
  const explanation = document.createElement("p");
  explanation.textContent = question.explanation || "";
  explanation.hidden = !question.explanation;
  const next = document.createElement("button");
  next.type = "button";
  next.className = `button ${right ? "button-primary" : "button-secondary"}`;
  next.innerHTML = `${current === deck.length - 1 ? "Ver mi resultado" : "Continuar"} <span aria-hidden="true">→</span>`;
  next.addEventListener("click", () => {
    current += 1;
    if (current < deck.length) renderQuestion();
    else completeQuiz();
  }, { once: true });
  $("#feedback").replaceChildren(title, explanation, next);
  $("#feedback").hidden = false;
  next.focus({ preventScroll: true });
  next.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function completeQuiz() {
  const correct = responses.filter((response, index) => response.selected === deck[index].answer).length;
  const points = responses.reduce((sum, response, index) => sum + (response.selected === deck[index].answer ? Number(deck[index].points) || 0 : 0), 0);
  $("#quiz").hidden = true;
  $("#result-summary").textContent = `Respondiste bien ${correct} de ${deck.length} preguntas y sumaste ${points} puntos.`;
  $("#public-consent").checked = false;
  resetSkip();
  showFormError("");
  $("#participant-dialog").showModal();
}

function showFormError(message) {
  $("#form-error").textContent = message;
  $("#form-error").hidden = !message;
}

function resetSkip() {
  const skip = $("#skip-save");
  delete skip.dataset.confirm;
  skip.textContent = "No publicar mi resultado";
}

function finishAttempt() {
  unlockPage();
  $("#participant-dialog").close();
  deck = [];
  responses = [];
  attemptId = null;
}

async function submitScore(profile) {
  if (isSubmitting) return;
  isSubmitting = true;
  const saveButton = $("#save-score");
  saveButton.disabled = true;
  $("#skip-save").disabled = true;
  saveButton.textContent = "Guardando…";
  showFormError("");
  try {
    const result = await fetchJson(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "submit", attemptId, name: profile.name, branch: profile.branch, consent: true, responses, clientId: getClientId() })
    });
    if (Array.isArray(result.leaderboard)) leaders = result.leaderboard;
    renderBoard();
    finishAttempt();
    $("#tablero").scrollIntoView({ behavior: "smooth" });
    toast(`¡Reto completado! Sumaste ${result.points} puntos.`);
  } catch (error) {
    showFormError(friendlyError(error));
  } finally {
    isSubmitting = false;
    saveButton.disabled = false;
    $("#skip-save").disabled = false;
    saveButton.innerHTML = 'Guardar mi puntaje <span aria-hidden="true">→</span>';
  }
}

function toast(message) {
  const toastElement = $("#toast");
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.hidden = false;
  toastTimer = setTimeout(() => { toastElement.hidden = true; }, 3500);
}

$$(".start-quiz").forEach((button) => button.addEventListener("click", beginQuiz));
$("#retry-load").addEventListener("click", loadData);

// Mientras el reto está en curso no se puede salir: se avisa al cerrar/recargar y se anula el botón Atrás.
window.addEventListener("beforeunload", (event) => {
  if (!quizActive) return;
  event.preventDefault();
  event.returnValue = "";
});
window.addEventListener("popstate", () => {
  if (!quizActive) return;
  history.pushState({ quiz: true }, "");
  toast("Completá el reto para salir.");
});
$("#participant-dialog").addEventListener("cancel", (event) => event.preventDefault());
// Algunos navegadores cierran el diálogo igual con un segundo Escape: si el reto sigue pendiente, se vuelve a abrir.
$("#participant-dialog").addEventListener("close", () => {
  if (quizActive) $("#participant-dialog").showModal();
});

$("#skip-save").addEventListener("click", () => {
  const skip = $("#skip-save");
  if (skip.dataset.confirm) {
    finishAttempt();
    toast("Tu resultado no se publicó. ¡Gracias por participar!");
    return;
  }
  skip.dataset.confirm = "1";
  skip.textContent = "¿Seguro? Tocá de nuevo para salir sin guardar";
});

$("#participant-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  resetSkip();
  const name = $("#participant-name").value.trim().replace(/\s+/g, " ");
  const branch = $("#participant-branch").value;
  if (name.length < 3) return showFormError("Ingresá tu nombre y apellido.");
  if (!branch) return showFormError("Seleccioná tu Entidad/Sucursal.");
  if (!$("#public-consent").checked) return showFormError("Para aparecer en el tablero necesitamos tu autorización.");
  await submitScore({ name, branch });
});

console.log(`%c${CHEAT_MESSAGE}`, "font-size:26px;font-weight:900;color:#a0427c;line-height:1.3");
loadData();
