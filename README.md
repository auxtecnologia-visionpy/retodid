# Reto DID

Sitio estático para GitHub Pages y backend editable por DID mediante Google Sheets + Apps Script.

## Publicación rápida

1. Creá una hoja de cálculo de Google y abrí **Extensiones → Apps Script**.
2. Copiá el contenido de `apps-script/Code.gs`, guardá y ejecutá `prepararLibro()` una vez. Otorgá permisos al proyecto.
3. En **Implementar → Nueva implementación**, elegí **Aplicación web**, ejecutá como tu cuenta y acceso **Cualquiera**. Copiá la URL terminada en `/exec`.
4. Pegá esa URL como valor de `API_URL` en `app.js`.
5. Subí esta carpeta a un repositorio GitHub y activá **Settings → Pages → Deploy from a branch** (rama `main`, carpeta raíz).

## Operación de DID

- En `Preguntas`, cada fila activa es un desafío. `opciones` debe ser un arreglo JSON de textos y `respuesta_correcta` usa posición desde cero: la primera opción es `0`.
- DID puede desactivar una pregunta cambiando `estado` a `INACTIVA`. No debe modificar los encabezados.
- `Puntajes` se completa automáticamente; conserva solo alias, puntos, fecha y un identificador técnico aleatorio. No pide ni publica nombres personales.

## Seguridad y rendimiento

Apps Script calcula los puntos con la respuesta correcta guardada en Sheets; el navegador no decide el resultado. La respuesta inicial se guarda cinco minutos en caché y cada misión se registra mediante una sola solicitud. Para el lanzamiento, conviene revisar el despliegue periódicamente y restringir la edición del libro al equipo DID.
