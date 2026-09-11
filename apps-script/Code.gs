/** Reto DID — API para Google Apps Script. Desplegar como Web App con acceso: Cualquiera. */
const SHEETS = { config: 'Configuración', questions: 'Preguntas', scores: 'Puntajes' };

function doGet(e) {
  try {
    if ((e.parameter.action || 'bootstrap').toLowerCase() !== 'bootstrap') return json_({ error: 'Acción no válida' });
    return json_(bootstrap_());
  } catch (err) { return json_({ error: err.message }); }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    if (data.action !== 'submit') return json_({ error: 'Acción no válida' });
    return json_(submit_(data));
  } catch (err) { return json_({ error: err.message }); }
}

function bootstrap_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('bootstrap');
  if (cached) return JSON.parse(cached);
  const ss = SpreadsheetApp.getActive();
  const questions = records_(ss.getSheetByName(SHEETS.questions))
    .filter(q => String(q.estado).toUpperCase() === 'ACTIVA')
    .map(q => ({ id: q.id, game: q.juego, question: q.pregunta, options: JSON.parse(q.opciones) }));
  const leaderboard = records_(ss.getSheetByName(SHEETS.scores))
    .sort((a, b) => Number(b.puntos) - Number(a.puntos) || new Date(a.fecha) - new Date(b.fecha))
    .slice(0, 10).map(x => ({ alias: x.alias, points: Number(x.puntos) }));
  const response = { questions, leaderboard };
  cache.put('bootstrap', JSON.stringify(response), 300);
  return response;
}

function submit_(data) {
  const alias = String(data.alias || '').trim().replace(/[<>]/g, '');
  if (alias.length < 3 || alias.length > 20) throw new Error('El alias debe tener entre 3 y 20 caracteres.');
  if (!Array.isArray(data.responses) || !data.responses.length) throw new Error('No hay respuestas para registrar.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActive();
    const items = records_(ss.getSheetByName(SHEETS.questions));
    let points = 0;
    data.responses.forEach(r => {
      const q = items.find(x => String(x.id) === String(r.id) && String(x.estado).toUpperCase() === 'ACTIVA');
      if (q && Number(r.selected) === Number(q.respuesta_correcta)) points += Number(q.puntos || 100);
    });
    ss.getSheetByName(SHEETS.scores).appendRow([new Date(), alias, points, String(data.clientId || '').slice(0, 80), data.responses.length]);
    CacheService.getScriptCache().remove('bootstrap');
    return { alias, points };
  } finally { lock.releaseLock(); }
}

function records_(sheet) {
  if (!sheet) throw new Error('Falta una pestaña requerida. Ejecutá prepararLibro() una vez.');
  const [headers, ...rows] = sheet.getDataRange().getValues();
  return rows.filter(row => row.some(value => value !== '')).map(row => Object.fromEntries(headers.map((header, i) => [String(header).toLowerCase().trim(), row[i]])));
}

function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }

function prepararLibro() {
  const ss = SpreadsheetApp.getActive();
  Object.values(SHEETS).forEach(name => { let sheet = ss.getSheetByName(name); if (!sheet) sheet = ss.insertSheet(name); sheet.clear(); });
  ss.getSheetByName(SHEETS.config).getRange(1, 1, 4, 2).setValues([
    ['clave', 'valor'], ['nombre', 'Reto DID'], ['version', '1'], ['nota', 'Editar solo las pestañas Preguntas y Puntajes.']
  ]);
  const questions = ss.getSheetByName(SHEETS.questions);
  questions.getRange(1, 1, initialQuestions_().length + 1, 8).setValues([
    ['id', 'juego', 'pregunta', 'opciones', 'respuesta_correcta', 'explicacion', 'puntos', 'estado'], ...initialQuestions_()
  ]);
  const scores = ss.getSheetByName(SHEETS.scores);
  scores.getRange(1, 1, 1, 5).setValues([['fecha', 'alias', 'puntos', 'cliente_id', 'respuestas']]);
  [questions, scores].forEach(sheet => { sheet.setFrozenRows(1); sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#87B5D9'); sheet.autoResizeColumns(1, sheet.getLastColumn()); });
}

function initialQuestions_() {
  const game = 'Detective de palabras';
  return [
    ['q1', game, 'Al referirnos a un espacio físico adaptado, ¿qué expresión es la más adecuada?', '["Baño para discapacitados","Baño para capacidades especiales","Baño accesible","Baño para lisiados"]', 2, '“Baño accesible” describe la característica del espacio sin definir a las personas.', 100, 'ACTIVA'],
    ['q2', game, '¿Cuál es el error principal en la frase “Mi compañero sufre de autismo”?', '["No usar el nombre del compañero","No usar el término especial","El término autismo es incorrecto","El uso del verbo sufrir"]', 3, 'El verbo “sufrir” condiciona la discapacidad como si fuera sinónimo de padecimiento.', 100, 'ACTIVA'],
    ['q3', game, 'En el contexto de la visión, ¿cuál de estas opciones es preferible?', '["El corto de vista","El no vidente/invidente","Persona ciega","2 y 3 son correctas"]', 2, '“Persona ciega” antepone a la persona sin invisibilizar su condición.', 100, 'ACTIVA'],
    ['q4', game, 'Según el principio de Persona Primero, ¿cuál es la forma correcta?', '["Persona con discapacidad","Discapacitado","Persona especial","Persona con capacidades diferentes"]', 0, '“Persona con discapacidad” antepone a la persona y es consistente con los estándares de derechos humanos.', 100, 'ACTIVA'],
    ['q5', game, '¿Por qué “capacidades diferentes” es un término innecesario?', '["Es muy largo","Es demasiado formal","Solo aplica a niños","Invisibiliza la discapacidad"]', 3, 'Puede invisibilizar la discapacidad y convertir a la persona en un supuesto “superhéroe”.', 100, 'ACTIVA'],
    ['q6', game, 'Si una persona no tiene discapacidad, el término correcto es:', '["Persona normal","Persona sana","Persona sin discapacidad","Persona completa"]', 2, 'Los otros términos asocian la discapacidad con enfermedad, falta o anormalidad.', 100, 'ACTIVA'],
    ['q7', game, '¿Cuál de estas frases usa un lenguaje preciso y no estigmatizante?', '["Hay que ayudar a los discapacitados de la organización.","Viene una persona no vidente a atenderse.","El normal de la oficina técnica ya llegó.","Se debe aclarar en la ficha que el paciente tiene Autismo."]', 3, 'La frase es precisa y evita términos estigmatizantes o victimizantes.', 100, 'ACTIVA']
  ];
}
