# Reto DID

Sitio estático para GitHub Pages y backend editable por DID mediante Google Sheets + Apps Script.

## Publicación rápida

1. Creá una hoja de cálculo de Google y abrí **Extensiones → Apps Script**.
2. Copiá el contenido de `apps-script/Code.gs`, guardá y ejecutá `prepararLibro()` una vez. Otorgá permisos al proyecto. Esta función no borra información existente.
3. En **Implementar → Nueva implementación**, elegí **Aplicación web**, ejecutá como tu cuenta y acceso **Cualquiera**. Copiá la URL terminada en `/exec`.
4. Pegá esa URL como valor de `API_URL` en `app.js`. Si ya tenías un despliegue, creá una nueva versión y actualizá la implementación.
5. Subí esta carpeta a un repositorio GitHub y activá **Settings → Pages → Deploy from a branch** (rama `main`, carpeta raíz).

## Operación de DID

- En `Preguntas`, cada fila activa es un desafío. `opciones` debe ser un arreglo JSON de textos y `respuesta_correcta` usa posición desde cero: la primera opción es `0`.
- DID puede desactivar una pregunta cambiando `estado` a `INACTIVA`. No debe modificar los encabezados.
- En `Configuración`, completá `entidades_sucursales` con las opciones válidas separadas por `|`. El formulario las sugerirá, pero también permite escribir una sucursal válida.
- `Puntajes` guarda nombre, Entidad/Sucursal, puntos, fecha y un identificador técnico aleatorio. Solo se publica en el tablero quien aceptó expresamente esa publicación.
- Si el libro ya tiene la columna `alias`, ejecutá `migrarPuntajesAV2()` una sola vez. Conserva los puntajes históricos y no modifica Preguntas.

## Seguridad y rendimiento

Apps Script calcula los puntos con la respuesta correcta guardada en Sheets; el navegador no decide el resultado. La respuesta inicial se guarda cinco minutos en caché y cada misión se registra mediante una sola solicitud. El cliente corta una conexión que tarde más de 12 segundos y Apps Script evita envíos duplicados durante 20 segundos. Para el lanzamiento, restringí la edición del libro al equipo DID y definí con DID el plazo de conservación de nombres y sucursales.
