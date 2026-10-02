/**
 * Reto DID — API para Google Apps Script (estructura v3).
 * Todo el contenido (preguntas, opciones, respuestas, explicaciones, puntos, sucursales y textos del reto)
 * se lee de la planilla. Este archivo solo contiene lógica.
 * Desplegar como Aplicación web con acceso: Cualquiera.
 * Si el libro viene de una versión anterior, ejecutar migrarAV3() una vez.
 */
const SHEETS = { config: 'Configuración', branches: 'Sucursales', questions: 'Preguntas', scores: 'Puntajes' };
const CONFIG_KEYS = ['nombre', 'version', 'titulo_reto', 'descripcion_reto', 'mensaje_correcto', 'mensaje_incorrecto', 'puntos_por_defecto'];
const BRANCH_HEADERS = ['nombre', 'variantes', 'estado'];
const QUESTION_HEADERS = ['id', 'pregunta', 'opcion_1', 'opcion_2', 'opcion_3', 'opcion_4', 'respuesta_correcta', 'explicacion', 'puntos', 'mezclar_opciones', 'estado'];
const SCORE_HEADERS = ['fecha', 'nombre', 'entidad_sucursal', 'puntos', 'intento_id', 'cliente_id', 'respuestas', 'consentimiento_publico'];
const CACHE_KEY = 'bootstrap-v3';
const CACHE_SECONDS = 300;
const LEADERBOARD_SIZE = 10;

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'bootstrap').toLowerCase();
    if (action !== 'bootstrap') return json_({ error: 'Acción no válida.' });
    return json_(bootstrap_());
  } catch (err) {
    console.error(err);
    return json_({ error: err.message });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data.action !== 'submit') return json_({ error: 'Acción no válida.' });
    return json_(submit_(data));
  } catch (err) {
    console.error(err);
    return json_({ error: err instanceof SyntaxError ? 'Solicitud inválida.' : err.message });
  }
}

/** Limpia el caché cuando DID edita la planilla, para que los cambios se vean al instante. */
function onEdit() {
  CacheService.getScriptCache().remove(CACHE_KEY);
}

function bootstrap_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const ss = SpreadsheetApp.getActive();
  assertSchema_(ss);
  const config = config_(ss);
  const response = {
    quiz: {
      title: String(config.titulo_reto || '').trim(),
      description: String(config.descripcion_reto || '').trim(),
      correctMessage: String(config.mensaje_correcto || '').trim(),
      incorrectMessage: String(config.mensaje_incorrecto || '').trim()
    },
    questions: loadQuestions_(ss, config).map(q => ({ id: q.id, question: q.question, options: q.options, answer: q.answer, explanation: q.explanation, points: q.points, shuffle: q.shuffle })),
    leaderboard: leaderboard_(ss),
    branches: loadBranches_(ss).map(branch => branch.name)
  };
  cache.put(CACHE_KEY, JSON.stringify(response), CACHE_SECONDS);
  return response;
}

/** Preguntas activas y válidas. answer queda en base 0 para uso interno; en la planilla es 1, 2, 3… */
function loadQuestions_(ss, config) {
  const seen = new Set();
  return records_(ss.getSheetByName(SHEETS.questions))
    .filter(row => String(row.estado).trim().toUpperCase() === 'ACTIVA')
    .map(row => parseQuestion_(row, seen, config.puntos_por_defecto))
    .filter(Boolean);
}

function parseQuestion_(row, seen, defaultPoints) {
  const id = String(row.id || '').trim();
  const skip = reason => { console.warn(`Pregunta ${id || '(sin id)'} omitida: ${reason}`); return null; };
  if (!id) return skip('falta el id.');
  if (seen.has(id)) return skip('el id está repetido.');
  const question = String(row.pregunta || '').trim();
  if (!question) return skip('falta el texto de la pregunta.');

  const optionCells = Object.keys(row)
    .filter(key => /^opcion_\d+$/.test(key))
    .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]))
    .map(key => String(row[key]).trim());
  while (optionCells.length && !optionCells[optionCells.length - 1]) optionCells.pop();
  if (optionCells.includes('')) return skip('hay una opción vacía entre otras opciones.');
  if (optionCells.length < 2) return skip('necesita al menos dos opciones.');

  const answer = Number(row.respuesta_correcta);
  if (String(row.respuesta_correcta).trim() === '' || !Number.isInteger(answer) || answer < 1 || answer > optionCells.length) {
    return skip(`respuesta_correcta debe ser un número entre 1 y ${optionCells.length}.`);
  }
  // puntos vacío → se usa puntos_por_defecto de Configuración.
  const rawPoints = String(row.puntos).trim() === '' ? String(defaultPoints == null ? '' : defaultPoints).trim() : String(row.puntos).trim();
  const points = Number(rawPoints);
  if (rawPoints === '' || !Number.isFinite(points) || points < 0) return skip('completá puntos (o puntos_por_defecto en Configuración) con un número igual o mayor a 0.');

  seen.add(id);
  return {
    id,
    question,
    options: optionCells,
    answer: answer - 1,
    explanation: String(row.explicacion || '').trim(),
    points,
    shuffle: String(row.mezclar_opciones).trim().toUpperCase() !== 'NO'
  };
}

/** Sucursales activas. "variantes" son otras formas de escribirla (separadas por |), usadas para unificar registros. */
function loadBranches_(ss) {
  const seen = new Set();
  return records_(ss.getSheetByName(SHEETS.branches))
    .filter(row => String(row.estado).trim().toUpperCase() !== 'INACTIVA')
    .map(row => ({ name: cleanText_(row.nombre, 100), variants: String(row.variantes || '').split('|').map(normalize_).filter(Boolean) }))
    .filter(branch => branch.name && !seen.has(branch.name) && seen.add(branch.name));
}

/** Devuelve una función que convierte cualquier escritura conocida de una sucursal en su nombre oficial ('' si no la reconoce). */
function branchResolver_(ss) {
  const index = new Map();
  loadBranches_(ss).forEach(branch => {
    index.set(normalize_(branch.name), branch.name);
    branch.variants.forEach(variant => { if (!index.has(variant)) index.set(variant, branch.name); });
  });
  return value => index.get(normalize_(value)) || '';
}

/** Mejor puntaje de cada persona (nombre + sucursal). En empate gana quien lo logró primero. */
function leaderboard_(ss) {
  const resolve = branchResolver_(ss);
  const best = new Map();
  records_(ss.getSheetByName(SHEETS.scores))
    .filter(row => String(row.consentimiento_publico).trim().toUpperCase() === 'SI')
    .forEach(row => {
      const rawBranch = String(row.entidad_sucursal || '').trim();
      const entry = { name: String(row.nombre || '').trim() || 'Participante', branch: resolve(rawBranch) || rawBranch, points: Number(row.puntos) || 0, time: timeOf_(row.fecha) };
      const key = `${normalize_(entry.name)}|${normalize_(entry.branch)}`;
      const previous = best.get(key);
      if (!previous || compareEntries_(entry, previous) < 0) best.set(key, entry);
    });
  return [...best.values()]
    .sort(compareEntries_)
    .slice(0, LEADERBOARD_SIZE)
    .map(({ name, branch, points }) => ({ name, branch, points }));
}

function compareEntries_(a, b) {
  return b.points - a.points || a.time - b.time;
}

function timeOf_(value) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function submit_(data) {
  const name = cleanText_(data.name, 80);
  const branchInput = cleanText_(data.branch, 100);
  const attemptId = String(data.attemptId || '').trim();
  const clientId = String(data.clientId || '').trim().slice(0, 80);
  if (name.length < 3) throw new Error('Ingresá tu nombre y apellido.');
  if (!branchInput) throw new Error('Seleccioná tu Entidad/Sucursal de Fundación Visión.');
  if (data.consent !== true) throw new Error('Necesitamos tu autorización para mostrar tus datos en el tablero público.');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(attemptId)) throw new Error('No fue posible identificar esta partida. Actualizá la página y volvé a jugar.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Hay muchas personas guardando resultados. Intentá nuevamente en unos segundos.');
  try {
    const ss = SpreadsheetApp.getActive();
    assertSchema_(ss);
    const sheet = ss.getSheetByName(SHEETS.scores);
    const headers = headersOf_(sheet);

    // Reintento o doble envío de la misma partida: devolvemos lo ya guardado sin crear otra fila.
    const saved = findAttempt_(sheet, headers, attemptId);
    if (saved) return { name: saved.nombre, branch: saved.entidad_sucursal, points: Number(saved.puntos) || 0, leaderboard: leaderboard_(ss) };

    const branch = branchResolver_(ss)(branchInput);
    if (!branch) throw new Error('Seleccioná una Entidad/Sucursal de la lista.');

    const points = scoreResponses_(loadQuestions_(ss, config_(ss)), data.responses);
    const values = {
      fecha: new Date(),
      nombre: safeCell_(name),
      entidad_sucursal: safeCell_(branch),
      puntos: points,
      intento_id: attemptId,
      cliente_id: safeCell_(clientId),
      respuestas: data.responses.length,
      consentimiento_publico: 'SI'
    };
    sheet.appendRow(headers.map(header => (header in values ? values[header] : '')));
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove(CACHE_KEY);
    return { name, branch, points, leaderboard: leaderboard_(ss) };
  } finally {
    lock.releaseLock();
  }
}

/** Exige exactamente una respuesta válida por cada pregunta activa. */
function scoreResponses_(questions, responses) {
  const invalid = () => new Error('No pudimos validar tus respuestas. Actualizá la página y volvé a jugar.');
  if (!questions.length) throw new Error('No hay preguntas activas en este momento.');
  if (!Array.isArray(responses) || responses.length !== questions.length) throw invalid();
  const byId = new Map(questions.map(question => [question.id, question]));
  const answered = new Set();
  return responses.reduce((total, response) => {
    const question = byId.get(String(response && response.id));
    const selected = response && response.selected;
    if (!question || answered.has(question.id) || !Number.isInteger(selected) || selected < 0 || selected >= question.options.length) throw invalid();
    answered.add(question.id);
    return total + (selected === question.answer ? question.points : 0);
  }, 0);
}

function findAttempt_(sheet, headers, attemptId) {
  const column = headers.indexOf('intento_id') + 1;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const match = sheet.getRange(2, column, lastRow - 1, 1).createTextFinder(attemptId).matchEntireCell(true).findNext();
  if (!match) return null;
  const row = sheet.getRange(match.getRow(), 1, 1, headers.length).getValues()[0];
  return Object.fromEntries(headers.map((header, i) => [header, row[i]]));
}

function assertSchema_(ss) {
  const has = (name, required) => {
    const sheet = ss.getSheetByName(name);
    return sheet && sheet.getLastColumn() > 0 && required.every(header => headersOf_(sheet).includes(header));
  };
  const ok = has(SHEETS.branches, ['nombre']) && has(SHEETS.questions, ['id', 'opcion_1', 'respuesta_correcta']) && has(SHEETS.scores, ['nombre', 'entidad_sucursal', 'intento_id']);
  if (!ok) throw new Error('La planilla aún usa la estructura anterior. Ejecutá migrarAV3() una vez.');
}

function headersOf_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(value => String(value).toLowerCase().trim());
}

function records_(sheet) {
  if (!sheet) throw new Error('Falta una pestaña requerida. Ejecutá prepararLibro() o migrarAV3().');
  const [headers, ...rows] = sheet.getDataRange().getValues();
  const keys = headers.map(header => String(header).toLowerCase().trim());
  return rows.filter(row => row.some(value => value !== '')).map(row => Object.fromEntries(keys.map((key, i) => [key, row[i]])));
}

function config_(ss) {
  return records_(ss.getSheetByName(SHEETS.config)).reduce((result, row) => ({ ...result, [String(row.clave || '').trim().toLowerCase()]: row.valor }), {});
}

function cleanText_(value, maxLength) {
  return String(value == null ? '' : value).trim().replace(/[<>]/g, '').replace(/\s+/g, ' ').slice(0, maxLength);
}

/** Evita que un texto que empieza con = + - @ se interprete como fórmula en Sheets. */
function safeCell_(value) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/** Minúsculas, sin acentos y con espacios simples: para comparar nombres y sucursales. */
function normalize_(value) {
  return String(value == null ? '' : value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/** Libro nuevo: crea las pestañas vacías con sus encabezados. No borra datos existentes. El contenido lo carga DID. */
function prepararLibro() {
  const ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, SHEETS.config, ['clave', 'valor'], CONFIG_KEYS.map(key => [key, key === 'version' ? 3 : '']));
  ensureSheet_(ss, SHEETS.branches, BRANCH_HEADERS, []);
  ensureSheet_(ss, SHEETS.questions, QUESTION_HEADERS, []);
  ensureSheet_(ss, SHEETS.scores, SCORE_HEADERS, []);
}

function ensureSheet_(ss, name, headers, initialRows) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() > 0) return sheet;
  writeTable_(sheet, headers, initialRows);
  return sheet;
}

function writeTable_(sheet, headers, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#87B5D9');
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * Ejecutar UNA VEZ para pasar un libro v2 a la estructura v3. Antes, hacé Archivo → Crear una copia.
 * Solo reorganiza lo que ya está en la planilla; no agrega contenido propio:
 * - Crea la pestaña Sucursales con la lista de Configuración (entidades_sucursales).
 * - Pasa las opciones de Preguntas de JSON a columnas y respuesta_correcta a 1, 2, 3…
 * - Agrega intento_id a Puntajes. No borra ningún resultado.
 * - Agrega a Configuración las claves nuevas vacías para que DID las complete.
 * Se puede ejecutar de nuevo sin dañar nada.
 */
function migrarAV3() {
  const ss = SpreadsheetApp.getActive();
  const log = [];

  // 1. Sucursales
  const configSheet = ss.getSheetByName(SHEETS.config);
  if (!configSheet) throw new Error('No existe la pestaña Configuración.');
  const configRows = configSheet.getDataRange().getValues();
  const configKey = row => String(row[0]).trim().toLowerCase();
  let branchSheet = ss.getSheetByName(SHEETS.branches);
  if (!branchSheet || branchSheet.getLastRow() < 2) {
    const listRow = configRows.find(row => configKey(row) === 'entidades_sucursales');
    const names = [...new Set(String(listRow ? listRow[1] : '').split('|').map(value => cleanText_(value, 100)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es'));
    if (!branchSheet) branchSheet = ss.insertSheet(SHEETS.branches);
    writeTable_(branchSheet, BRANCH_HEADERS, names.map(name => [name, '', 'ACTIVA']));
    log.push(`${names.length} sucursales cargadas en la pestaña Sucursales.`);
  }

  // 2. Preguntas (se valida todo antes de escribir)
  const questionSheet = ss.getSheetByName(SHEETS.questions);
  if (!questionSheet) throw new Error('No existe la pestaña Preguntas.');
  if (headersOf_(questionSheet).includes('opciones')) {
    const rows = records_(questionSheet).map(row => {
      let options;
      try { options = JSON.parse(row.opciones); } catch (err) { options = null; }
      if (!Array.isArray(options)) throw new Error(`La pregunta ${row.id || '(sin id)'} tiene opciones que no son un JSON válido. Corregila y volvé a ejecutar.`);
      const answer = String(row.respuesta_correcta).trim() === '' ? '' : Number(row.respuesta_correcta) + 1;
      return { row, options: options.map(String), answer };
    });
    const optionCount = Math.max(4, ...rows.map(item => item.options.length));
    const optionHeaders = Array.from({ length: optionCount }, (_, i) => `opcion_${i + 1}`);
    const headers = ['id', 'pregunta', ...optionHeaders, 'respuesta_correcta', 'explicacion', 'puntos', 'mezclar_opciones', 'estado'];
    const values = rows.map(({ row, options, answer }) => [
      row.id, row.pregunta,
      ...optionHeaders.map((_, i) => options[i] || ''),
      answer, row.explicacion, row.puntos, 'SI', row.estado
    ]);
    writeTable_(questionSheet, headers, values);
    log.push(`${values.length} preguntas convertidas a columnas (respuesta_correcta ahora empieza en 1). Revisá mezclar_opciones: poné NO en preguntas con opciones como "2 y 3 son correctas".`);
  }

  // 3. Puntajes (todas las filas se conservan)
  const scoreSheet = ss.getSheetByName(SHEETS.scores);
  if (!scoreSheet) throw new Error('No existe la pestaña Puntajes.');
  if (scoreSheet.getLastRow() > 0 && !headersOf_(scoreSheet).includes('intento_id')) {
    const all = scoreSheet.getDataRange().getValues();
    const index = Object.fromEntries(all[0].map((header, i) => [String(header).toLowerCase().trim(), i]));
    const read = (row, key) => (key in index ? row[index[key]] : '');
    const rows = all.slice(1).filter(row => row.some(value => value !== '')).map((row, i) => [
      read(row, 'fecha'),
      read(row, 'nombre') || read(row, 'alias'),
      read(row, 'entidad_sucursal'),
      read(row, 'puntos'),
      `legado-${i + 2}`,
      read(row, 'cliente_id'),
      read(row, 'respuestas'),
      String(read(row, 'consentimiento_publico')).trim() || 'SI'
    ]);
    writeTable_(scoreSheet, SCORE_HEADERS, rows);
    log.push(`${rows.length} resultados conservados.`);
  } else if (scoreSheet.getLastRow() === 0) {
    writeTable_(scoreSheet, SCORE_HEADERS, []);
  }

  // 4. Configuración: la lista de sucursales pasa a su pestaña; se agregan las claves nuevas vacías.
  const obsolete = ['entidades_sucursales', 'nota'];
  for (let i = configRows.length - 1; i >= 1; i -= 1) {
    if (obsolete.includes(configKey(configRows[i]))) configSheet.deleteRow(i + 1);
  }
  const existing = configSheet.getDataRange().getValues().map(configKey);
  CONFIG_KEYS.filter(key => !existing.includes(key)).forEach(key => configSheet.appendRow([key, '']));
  const versionRow = configSheet.getDataRange().getValues().findIndex(row => configKey(row) === 'version');
  configSheet.getRange(versionRow + 1, 2).setValue(3);

  CacheService.getScriptCache().remove(CACHE_KEY);
  log.push(revisarSucursalesDePuntajes_(ss));
  log.push('Migración a v3 completa. Completá en Configuración: titulo_reto, descripcion_reto, mensaje_correcto, mensaje_incorrecto y puntos_por_defecto.');
  console.log(log.join('\n'));
  return log.join('\n');
}

/**
 * Unifica la columna entidad_sucursal de Puntajes con los nombres oficiales de la pestaña Sucursales,
 * usando también la columna "variantes". Ejecutar después de completar variantes. No borra filas.
 */
function normalizarSucursalesDePuntajes() {
  const ss = SpreadsheetApp.getActive();
  const resolve = branchResolver_(ss);
  const sheet = ss.getSheetByName(SHEETS.scores);
  const column = headersOf_(sheet).indexOf('entidad_sucursal') + 1;
  if (!column || sheet.getLastRow() < 2) return 'No hay resultados para revisar.';
  const range = sheet.getRange(2, column, sheet.getLastRow() - 1, 1);
  let fixed = 0;
  const values = range.getValues().map(([value]) => {
    const canonical = resolve(value);
    if (canonical && canonical !== value) { fixed += 1; return [canonical]; }
    return [value];
  });
  range.setValues(values);
  CacheService.getScriptCache().remove(CACHE_KEY);
  const message = `${fixed} sucursales unificadas.\n${revisarSucursalesDePuntajes_(ss)}`;
  console.log(message);
  return message;
}

/** Lista las sucursales de Puntajes que no coinciden con la pestaña Sucursales (ni con sus variantes). */
function revisarSucursalesDePuntajes_(ss) {
  const resolve = branchResolver_(ss);
  const unknown = [...new Set(records_(ss.getSheetByName(SHEETS.scores)).map(row => String(row.entidad_sucursal || '').trim()).filter(value => value && !resolve(value)))];
  return unknown.length
    ? `Sucursales en Puntajes que no están en la lista: ${unknown.join(', ')}. Agregalas como "variantes" de la sucursal correcta y ejecutá normalizarSucursalesDePuntajes().`
    : 'Todas las sucursales de Puntajes coinciden con la lista.';
}
