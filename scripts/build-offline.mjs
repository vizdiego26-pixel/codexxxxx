import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const releases = join(root, 'releases');
const staging = join(releases, '.portable');
await mkdir(staging, { recursive: true });
const mime = path => ({'.svg':'image/svg+xml','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'}[extname(path).toLowerCase()] || 'application/octet-stream');
const dataURI = async path => `data:${mime(path)};base64,${(await readFile(path)).toString('base64')}`;

let html = await readFile(join(dist, 'index.html'), 'utf8');
const scriptMatch = html.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/);
if (!scriptMatch) throw new Error('Build index has no application script. Run npm run build first.');
const jsPath = join(dist, scriptMatch[1].replace(/^\.?\//, ''));
const js = (await readFile(jsPath, 'utf8')).replace(/<\/script/gi, '<\\/script');
const cssMatches = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)];
for (const match of cssMatches) {
  const cssPath = join(dist, match[1].replace(/^\.?\//, ''));
  let css = await readFile(cssPath, 'utf8');
  // The portable edition must never need a font provider or any other network.
  css = css.replace(/@import\s*(?:url\([^)]*\)|["'][^"']+["'])[^;]*;/g, '');
  for (const url of [...css.matchAll(/url\((['"]?)([^)'"\s]+)\1\)/g)]) {
    if (/^(?:data:|https?:|#)/.test(url[2])) continue;
    const path = url[2].startsWith('/') ? join(dist, url[2].slice(1)) : resolve(dirname(cssPath), url[2]);
    css = css.replaceAll(url[0], `url("${await dataURI(path)}")`);
  }
  html = html.replace(match[0], () => `<style>${css}</style>`);
}
const cards = JSON.parse(await readFile(join(dist, 'data/cards.json'), 'utf8'));
for (const card of cards) card.image = await dataURI(join(dist, card.image.replace(/^\.?\//, '')));
const bootstrap = `window.__LAMINA_CARDS__=${JSON.stringify(cards).replaceAll('<', '\\u003c')};window.__LAMINA_SOURCE__='./pauta.pdf';`;
html = html.replace(scriptMatch[0], () => `<script>${bootstrap}</script><script type="module">${js}</script>`);
html = html.replace(/<link\b[^>]*rel="manifest"[^>]*>/g, '');
for (const match of [...html.matchAll(/<link\b[^>]*href="((?!https?:|data:)[^"?#]+)"[^>]*>/g)]) {
  if (/rel="(?:icon|apple-touch-icon)"/.test(match[0])) html = html.replace(match[0], match[0].replace(match[1], await dataURI(join(dist, match[1].replace(/^\.?\//, '')))));
}
await writeFile(join(staging, 'Lamina.html'), html);
await copyFile(join(dist, 'source.pdf'), join(staging, 'pauta.pdf'));

const common = `\nEsta es una versión portable para navegador; no es un instalador nativo.\nIncluye las 70 preguntas e imágenes originales, un temporizador de dos minutos por intento y corrección inmediata.\nNo necesitas Node, Python, una cuenta ni conexión a Internet para estudiar.\n\nTu progreso se guarda en este navegador y dispositivo. No se sincroniza entre equipos.\nAlgunos navegadores limitan el almacenamiento al abrir archivos locales. Si ves el aviso de guardado, usa la versión web HTTPS o permite almacenamiento local.\nConserva Lamina.html en el mismo lugar para que el navegador pueda recuperar su progreso.\nLa pauta completa está en pauta.pdf, junto a Lamina.html.\n`;
for (const [os, intro] of [
  ['Mac', 'LÁMINA PARA MAC\n\n1. Haz doble clic en Lamina-Mac.zip para descomprimirlo.\n2. Abre la carpeta extraída.\n3. Haz doble clic en Lamina.html para abrirla en Safari, Chrome o Edge.\nSi se abre un editor, usa clic derecho > Abrir con > tu navegador.\n'],
  ['Windows', 'LÁMINA PARA WINDOWS\n\n1. Haz clic derecho en Lamina-Windows.zip > Extraer todo.\n2. Abre la carpeta extraída.\n3. Haz doble clic en Lamina.html para abrirla en Edge, Chrome o Firefox.\nSi se abre un editor, usa clic derecho > Abrir con > tu navegador.\n'],
]) {
  await writeFile(join(staging, 'LEEME.txt'), intro + common);
  execFileSync('python', ['-c', 'import pathlib,sys,zipfile\np=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as z:\n for f in p.iterdir():\n  if f.is_file(): z.write(f,f.name)', staging, join(releases, `Lamina-${os}.zip`)]);
}
execFileSync('python', ['-c', 'import pathlib,sys,zipfile\np=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED) as z:\n for f in p.rglob("*"):\n  if f.is_file(): z.write(f,f.relative_to(p))', dist, join(releases, 'Lamina-Web.zip')]);
await writeFile(join(releases, 'PUBLICAR.txt'), `LÁMINA EN INTERNET E IPAD\n\nLamina-Web.zip contiene el sitio estático de producción.\n1. Descomprime Lamina-Web.zip.\n2. Publica la carpeta que contiene index.html en tu proveedor de alojamiento estático (por ejemplo, Netlify Drop o Cloudflare Pages). Usa HTTPS; admite dominio raíz o una subcarpeta como GitHub Pages.\n3. Abre la dirección HTTPS en Safari del iPad.\n4. Toca Compartir > Añadir a pantalla de inicio > Añadir.\n\nEn Mac con Safari: Archivo > Añadir al Dock, si está disponible.\nEn Chrome o Edge de Mac/Windows: abre el menú del navegador > Instalar Lámina, si está disponible.\n\nPrimero abre la versión web con Internet y espera a que termine de preparar su caché. Después puede abrirse sin conexión con las 70 imágenes.\nEl progreso se guarda por navegador y dispositivo; no hay sincronización entre equipos.\n\nEste paquete no publica el sitio automáticamente ni contiene credenciales.\n`);
await rm(staging, { recursive: true, force: true });
console.log(`Portable editions generated: ${cards.length} cards, ${Math.round(Buffer.byteLength(html) / 1024)} KB HTML. Mac, Windows and Web ZIPs are in releases/.`);
