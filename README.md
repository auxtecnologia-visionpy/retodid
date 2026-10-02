# Reto DID

Sitio estático para GitHub Pages. Su backend lo administra DID desde Google Sheets + Apps Script.

**Todo el contenido del reto vive en la planilla:** preguntas, opciones, respuestas correctas, explicaciones, puntos, sucursales, título, descripción y mensajes de correcto/incorrecto. El código no trae contenido propio: si una celda está vacía, la página no inventa nada; lo oculta, o descarta la pregunta si le falta un dato obligatorio.

## Actualizar desde la versión anterior (v2 → v3)

Seguí este orden. La página nueva necesita la API nueva para funcionar.

1. En la planilla: **Archivo → Crear una copia** (respaldo).
2. **Extensiones → Apps Script**: reemplazá todo el código por `apps-script/Code.gs` y guardá.
3. Elegí la función `migrarAV3` y ejecutala **una vez**. Solo reorganiza lo que ya está en la planilla:
   - crea la pestaña **Sucursales** con la lista de Configuración;
   - pasa las opciones de cada pregunta a columnas y `respuesta_correcta` a 1, 2, 3, 4;
   - agrega `intento_id` a Puntajes, sin borrar resultados;
   - agrega en Configuración las claves nuevas, vacías.

   Si la ejecutás de nuevo, no daña nada. Al terminar, el registro de ejecución lista las sucursales de Puntajes que no reconoce.
4. Completá la planilla:
   - **Configuración**: `titulo_reto`, `descripcion_reto`, `mensaje_correcto`, `mensaje_incorrecto` y `puntos_por_defecto` (por ejemplo, `100`).
   - **Preguntas**: poné `NO` en `mezclar_opciones` en las preguntas que tengan opciones como "2 y 3 son correctas" (hoy, la q3).
   - **Sucursales → variantes**: cargá las escrituras viejas que aparecen en Puntajes. Hoy son:

     | Sucursal | variantes |
     |---|---|
     | ROP | `PV/ROP` |
     | CONTACT CENTER | `FUNDACION VISION/CC` |
     | ADMINISTRACION | `Fundacion Vision` |

     "Clínica Central" ya coincide sola con CLINICA CENTRAL, porque no se distinguen acentos ni mayúsculas.
   - Ejecutá `normalizarSucursalesDePuntajes` para unificar esas filas.
5. **Implementar → Gestionar implementaciones → Editar → Versión: Nueva versión → Implementar**. La URL `/exec` no cambia.
6. Recién entonces subí `index.html`, `app.js`, `styles.css`, `assets/` y `.gitignore` a GitHub.

## Publicación desde cero

1. Creá una hoja de cálculo de Google y abrí **Extensiones → Apps Script**.
2. Pegá `apps-script/Code.gs` y ejecutá `prepararLibro()` una vez. Crea las pestañas vacías con sus encabezados y no borra información existente.
3. Cargá Configuración, Sucursales y Preguntas.
4. **Implementar → Nueva implementación → Aplicación web**, ejecutar como tu cuenta, acceso **Cualquiera**. Copiá la URL terminada en `/exec` en `API_URL` dentro de `app.js`.
5. En GitHub: **Settings → Pages → Deploy from a branch** (rama `main`, carpeta raíz).

## Operación de DID

**Configuración** (`clave` | `valor`):

| Clave | Uso |
|---|---|
| `titulo_reto` | Título de la tarjeta del reto. |
| `descripcion_reto` | Texto debajo del título. |
| `mensaje_correcto` / `mensaje_incorrecto` | Título del recuadro que aparece al responder. Si queda vacío, se muestra "Correcto"/"Incorrecto". |
| `puntos_por_defecto` | Puntos de las preguntas que tienen la columna `puntos` vacía. |

**Preguntas** (una fila por pregunta):

| Columna | Qué poner |
|---|---|
| `id` | Identificador único (q1, q2…). No lo cambies después de publicar. |
| `pregunta` | Texto de la pregunta. |
| `opcion_1` … `opcion_4` | Las opciones. Se pueden agregar columnas `opcion_5`, `opcion_6`… No dejes huecos entre opciones. |
| `respuesta_correcta` | El **número** de la opción correcta: `1` es `opcion_1`. |
| `explicacion` | Se muestra después de responder. Si queda vacía, no se muestra. |
| `puntos` | Si queda vacío, se usa `puntos_por_defecto`. |
| `mezclar_opciones` | `NO` para mantener el orden de las opciones (necesario si una dice "2 y 3 son correctas" o "Todas las anteriores"). El orden de las preguntas siempre se mezcla. |
| `estado` | `ACTIVA` o `INACTIVA`. |

No modifiques los encabezados. Una pregunta con datos inválidos (sin respuesta correcta, sin puntos, con menos de dos opciones) no aparece en el juego. El motivo queda en **Apps Script → Ejecuciones**.

**Sucursales**: una por fila (`nombre` | `variantes` | `estado`). Es la lista que muestra el formulario.
- `variantes`: otras formas de escribir la misma sucursal, separadas por `|`. Sirven para unificar registros viejos en el tablero.
- Para quitar una sucursal sin borrarla, poné `INACTIVA` en `estado`.

**Puntajes**: se guardan todos los intentos. El tablero muestra el mejor puntaje de cada persona (nombre + sucursal). En empate gana quien lo logró primero. Solo se publica a quien tiene `SI` en `consentimiento_publico`. Para quitar a alguien del tablero, borrá sus filas o cambiá ese valor a `NO`.

Los cambios en la planilla se ven al instante: un activador `onEdit` limpia el caché.

## Seguridad y rendimiento

- Apps Script calcula los puntos con las respuestas guardadas en Sheets. Solo acepta una respuesta válida por cada pregunta activa.
- Cada partida tiene un `intento_id`: un doble clic o un reintento nunca crea filas duplicadas.
- Los nombres que empiezan con `=`, `+`, `-` o `@` se guardan como texto, para que Sheets no los interprete como fórmulas.
- La carpeta `_no-publicar/` (copia de la planilla, diseños, fuentes) está en `.gitignore`. No la subas: contiene datos personales.
