# Lámina

Una app de estudio de Morfología I: 70 imágenes originales de la pauta, una pregunta a la vez y dos minutos por intento. Diseñada para Mac, Windows y iPad.

## Estudiar

- Al entrar, elige una sesión de **10, 15, 30, 40 o 70 láminas**. Cada sesión toma una selección y un orden aleatorios, sin repetir láminas dentro de ella.
- Escribe la respuesta y pulsa **Comprobar respuesta** o Enter.
- Si aciertas, se habilita **Siguiente lámina**.
- Si fallas, revelas la respuesta o se acaba el tiempo, ves inmediatamente la respuesta oficial. Debes reintentar la misma pregunta y acertar para avanzar.
- Cada intento tiene **2 minutos**. El reloj empieza al pulsar **Comenzar sesión**. Pausar oculta la pregunta y congela el reloj. Al recargar o volver a abrir, aparece el selector para comenzar una sesión nueva; el progreso acumulado y las guardadas se conservan.
- Se toleran mayúsculas, tildes, espacios, pequeñas erratas y sinónimos revisados. El corrector es local y conservador: no usa IA ni pretende evaluar cualquier explicación libre.
- Amplía las imágenes, guarda favoritas, consulta las explicaciones y practica por tema.
- El progreso queda en el navegador, sin cuenta y sin sincronización entre equipos. Los repasos se programan a 1, 3, 7, 14 y 30 días.

El banco procede exclusivamente de `Solucionario_control_formativo.pdf`. El PDF `CONTROLES HE 2024.pdf` se usó como referencia visual de la interfaz; sus preguntas no se incorporaron al banco.

## Versiones para Mac y Windows

Descarga directa desde GitHub:

- [Descargar para Mac](https://github.com/vizdiego26-pixel/codexxxxx/raw/refs/heads/main/downloads/Lamina-Mac.zip)
- [Descargar para Windows](https://github.com/vizdiego26-pixel/codexxxxx/raw/refs/heads/main/downloads/Lamina-Windows.zip)

Si el repositorio es privado, inicia sesión con la cuenta que tiene acceso.

Después de compilar, `releases/Lamina-Mac.zip` y `releases/Lamina-Windows.zip` contienen una versión portable. Descomprime el ZIP y abre `Lamina.html` en tu navegador. No requieren Node, instaladores, conexión ni permisos de administrador. Son distribuciones de la app web, no binarios nativos `.app`/`.exe`.

La pauta se incluye como `pauta.pdf`. En modo `file://` algunos navegadores restringen la persistencia de datos locales; para el guardado más fiable, usa la versión web instalada.

## iPad y app instalada

Abre la dirección **HTTPS publicada** en Safari y selecciona **Compartir → Añadir a pantalla de inicio**. En Mac y Windows puedes instalarla desde el menú del navegador (Chrome o Edge: **Instalar Lámina**). La misma app se adapta a todas las pantallas.

Tras la primera visita completa, el service worker guarda las 70 imágenes, datos, fuentes y pauta para uso sin conexión. La instalación del caché requiere que todos los recursos se descarguen correctamente. No incluye sincronización: cada dispositivo tiene su propio progreso.

## Desarrollo

Requiere Node.js 22.12+ o 24 (validado con 24.19.0), npm y Python 3 para empaquetar ZIP.

```sh
npm ci
npm run dev
```

Usar el checkout existente; cada tarea de nube ya está aislada, no necesita un worktree adicional.

```sh
npm test
npm run build
npm run preview
```

`build` genera `dist/`, el manifiesto de precaché y las tres distribuciones ZIP en `releases/`. `releases/Lamina-Web.zip` contiene el sitio listo para hosting estático HTTPS.

Prueba de navegador (opcional, requiere Python Playwright y Chromium; iniciar antes `npm run dev -- --port 5173`):

```sh
python test/e2e.py
```

## Publicar un enlace

### Netlify Drop (sin configurar compilación)

1. Compila con `npm run build`.
2. Abre https://app.netlify.com/drop con tu cuenta.
3. Descomprime `releases/Lamina-Web.zip` y arrastra la carpeta que contiene `index.html`.
4. Netlify entrega la dirección HTTPS. Esa es la que se abre en el iPad.

### GitHub Pages

El workflow `.github/workflows/deploy.yml` compila, prueba y publica al hacer push a `main`. Se necesita activar **Settings → Pages → Source: GitHub Actions** en el repositorio. El sitio usa rutas relativas y puede servirse tanto en la raíz de un dominio como en la subruta del repositorio. GitHub entrega el enlace una vez completada la primera publicación.

No se ha confirmado una publicación pública durante el desarrollo; un servidor local no es una dirección pública.

## Contenido y extracción

- `public/data/cards.json`: preguntas, respuestas oficiales, temas y explicaciones.
- `public/slides/`: imágenes originales, conservando flechas y sin respuestas sobrepuestas.
- `public/source.pdf`: pauta completa.
- `scripts/extract_cards.py`: extracción reproducible con PyMuPDF.

Para regenerar el contenido se requiere `PyMuPDF` y el PDF fuente. Consultar las opciones del script. La extracción no forma parte de la instalación normal porque los 70 registros y sus imágenes ya están incluidos.
