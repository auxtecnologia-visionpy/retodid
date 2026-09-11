const API_URL = "https://script.google.com/macros/s/AKfycbzdCCdMK1b63sydBYiVYbBY7VANfPyPYJGXg4dNDmQ5y6oZKn2U0e1GS0KCbB4MlQiE/exec";
const API_TIMEOUT_MS = 12_000;

const seedQuestions = [
  { id: "q1", game: "Detective de palabras", question: "Al referirnos a un espacio físico adaptado, ¿qué expresión es la más adecuada?", options: ["Baño para discapacitados", "Baño para capacidades especiales", "Baño accesible", "Baño para lisiados"], answer: 2, explanation: "“Baño accesible” describe la característica del espacio sin definir a las personas." },
  { id: "q2", game: "Detective de palabras", question: "¿Cuál es el error principal en la frase “Mi compañero sufre de autismo”?", options: ["No usar el nombre del compañero", "No usar el término especial", "El término autismo es incorrecto", "El uso del verbo sufrir"], answer: 3, explanation: "El verbo “sufrir” condiciona la discapacidad como si fuera sinónimo de padecimiento." },
  { id: "q3", game: "Detective de palabras", question: "En el contexto de la visión, ¿cuál de estas opciones es preferible?", options: ["El corto de vista", "El no vidente/invidente", "Persona ciega", "2 y 3 son correctas"], answer: 2, explanation: "“Persona ciega” antepone a la persona sin invisibilizar su condición." },
  { id: "q4", game: "Detective de palabras", question: "Según el principio de Persona Primero, ¿cuál es la forma correcta?", options: ["Persona con discapacidad", "Discapacitado", "Persona especial", "Persona con capacidades diferentes"], answer: 0, explanation: "“Persona con discapacidad” antepone a la persona y es consistente con los estándares de derechos humanos." },
  { id: "q5", game: "Detective de palabras", question: "¿Por qué “capacidades diferentes” es un término innecesario?", options: ["Es muy largo", "Es demasiado formal", "Solo aplica a niños", "Invisibiliza la discapacidad"], answer: 3, explanation: "Puede invisibilizar la discapacidad y convertir a la persona en un supuesto “superhéroe”." },
  { id: "q6", game: "Detective de palabras", question: "Si una persona no tiene discapacidad, el término correcto es:", options: ["Persona normal", "Persona sana", "Persona sin discapacidad", "Persona completa"], answer: 2, explanation: "Los otros términos asocian la discapacidad con enfermedad, falta o anormalidad." },
  { id: "q7", game: "Detective de palabras", question: "¿Cuál de estas frases usa un lenguaje preciso y no estigmatizante?", options: ["Hay que ayudar a los discapacitados de la organización.", "Viene una persona no vidente a atenderse.", "El normal de la oficina técnica ya llegó.", "Se debe aclarar en la ficha que el paciente tiene Autismo."], answer: 3, explanation: "La frase es precisa y evita términos estigmatizantes o victimizantes." }
];

let questions = seedQuestions;
let leaders = [{ name: "Equipo Accesible", branch: "Fundación Visión", points: 320 }, { name: "Incluir Es Hoy", branch: "Fundación Visión", points: 280 }, { name: "Palabras Abren", branch: "Fundación Visión", points: 250 }];
let current = 0;
let responses = [];
let isSubmitting = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(text) {
  const element = document.createElement("div");
  element.textContent = text || "Participante";
  return element.innerHTML;
}

function renderBoard() {
  const list = $("#leaderboard-list");
  list.innerHTML = leaders.slice(0, 10).map((entry, index) => {
    const name = entry.name || entry.nombre || entry.alias || "Participante";
    const branch = entry.branch || entry.entidad_sucursal || "Fundación Visión";
    const points = Number(entry.points ?? entry.puntos ?? 0);
    return `<li><span class="rank">${index + 1}</span><span class="participant"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(branch)}</small></span><span class="points">${points} puntos</span></li>`;
  }).join("");
}

function normalizeQuestions(rawQuestions) {
  return rawQuestions.map((question) => {
    const fallback = seedQuestions.find((item) => item.id === question.id) || {};
    return {
      ...fallback,
      ...question,
      answer: Number.isInteger(question.answer) ? question.answer : fallback.answer,
      explanation: question.explanation || fallback.explanation || "Esta explicación estará disponible próximamente."
    };
  }).filter((question) => Array.isArray(question.options) && question.options.length >= 2);
}

function setBranchOptions(branches = []) {
  $("#branch-options").innerHTML = [...new Set(branches.filter(Boolean))]
    .map((branch) => `<option value="${escapeHtml(branch)}"></option>`).join("");
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || "No fue posible completar la conexión.");
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function loadData() {
  if (!API_URL) {
    $("#connection-state").textContent = "Modo demostración";
    renderBoard();
    return;
  }
  try {
    const data = await fetchJson(`${API_URL}?action=bootstrap`, { cache: "no-store" });
    const loadedQuestions = normalizeQuestions(data.questions || []);
    questions = loadedQuestions.length ? loadedQuestions : seedQuestions;
    leaders = data.leaderboard || [];
    setBranchOptions(data.branches || []);
    $("#connection-state").textContent = "Tablero actualizado";
  } catch (error) {
    $("#connection-state").textContent = "Mostrando datos locales";
  }
  renderBoard();
}

function beginQuiz() {
  current = 0;
  responses = [];
  $("#quiz").hidden = false;
  $("#quiz").scrollIntoView({ behavior: "smooth", block: "start" });
  renderQuestion();
}

function renderQuestion() {
  const question = questions[current];
  $("#quiz-progress").textContent = `${current + 1} / ${questions.length}`;
  $("#progress-fill").style.width = `${((current + 1) / questions.length) * 100}%`;
  $("#question-game").textContent = question.game || "Detective de palabras";
  $("#question-text").textContent = question.question;
  $("#feedback").hidden = true;
  $("#answers").innerHTML = "";
  question.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.className = "answer";
    button.textContent = option;
    button.addEventListener("click", () => answer(index));
    $("#answers").append(button);
  });
}

function answer(selected) {
  const question = questions[current];
  const hasAnswer = Number.isInteger(question.answer);
  $$(".answer").forEach((button, index) => {
    button.disabled = true;
    if (hasAnswer && index === question.answer) button.classList.add("correct");
    else if (hasAnswer && index === selected) button.classList.add("incorrect");
  });
  responses.push({ id: question.id, selected });
  const right = hasAnswer && selected === question.answer;
  const feedback = $("#feedback");
  feedback.innerHTML = `<h3>${right ? "Una palabra abre puertas" : "Sigamos aprendiendo"}</h3><p>${question.explanation}</p><button class="button ${right ? "button-primary" : ""}" id="next-question">${current === questions.length - 1 ? "Ver mi resultado" : "Continuar"} <span aria-hidden="true">→</span></button>`;
  feedback.hidden = false;
  $("#next-question").addEventListener("click", () => {
    current += 1;
    if (current < questions.length) renderQuestion();
    else completeQuiz();
  });
}

function completeQuiz() {
  $("#quiz").hidden = true;
  $("#participant-dialog").showModal();
}

async function submitScore(profile) {
  if (isSubmitting) return false;
  isSubmitting = true;
  const saveButton = $("#save-score");
  saveButton.disabled = true;
  saveButton.textContent = "Guardando…";
  try {
    const fallbackScore = responses.reduce((sum, response, index) => sum + (response.selected === questions[index].answer ? 100 : 0), 0);
    let result = { name: profile.name, branch: profile.branch, points: fallbackScore };
    if (API_URL) {
      result = await fetchJson(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "submit", name: profile.name, branch: profile.branch, consent: true, alias: profile.name, responses, clientId: getClientId() })
      });
    }
    leaders = [...leaders, result].sort((a, b) => Number(b.points ?? b.puntos) - Number(a.points ?? a.puntos));
    renderBoard();
    $("#participant-dialog").close();
    $("#tablero").scrollIntoView({ behavior: "smooth" });
    toast(`¡Misión completada! Sumaste ${result.points} puntos.`);
    return true;
  } catch (error) {
    toast(error.name === "AbortError" ? "La conexión tardó demasiado. Intentá nuevamente." : error.message);
    return false;
  } finally {
    isSubmitting = false;
    saveButton.disabled = false;
    saveButton.innerHTML = 'Guardar mi puntaje <span aria-hidden="true">→</span>';
  }
}

function getClientId() {
  let id = localStorage.getItem("didClientId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("didClientId", id);
  }
  return id;
}

function toast(message) {
  const toastElement = $("#toast");
  toastElement.textContent = message;
  toastElement.hidden = false;
  setTimeout(() => { toastElement.hidden = true; }, 3500);
}

$$(".start-quiz").forEach((button) => button.addEventListener("click", beginQuiz));
$(".exit-quiz").addEventListener("click", () => { $("#quiz").hidden = true; });
$(".puzzle-button").addEventListener("click", () => toast("Este rompecabezas estará disponible en una próxima misión."));
$("#participant-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#participant-name").value.trim();
  const branch = $("#participant-branch").value.trim();
  if (name.length < 3 || branch.length < 2 || !$("#public-consent").checked) return;
  await submitScore({ name, branch });
});

loadData();
