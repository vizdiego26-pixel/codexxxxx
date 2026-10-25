import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (!['sw.js', 'precache.json'].includes(relative(dist, path))) files.push(path);
  }
}
await walk(dist);
files.sort();
const hash = createHash('sha256');
for (const path of files) hash.update(relative(dist, path)).update(await readFile(path));
const build = hash.digest('hex').slice(0, 16);
const urls = files.map(path => relative(dist, path).split('\\').join('/'));
await writeFile(join(dist, 'precache.json'), JSON.stringify({ build, urls }, null, 2) + '\n');
const source = await readFile(join(root, 'public/sw.js'), 'utf8');
await writeFile(join(dist, 'sw.js'), source.replaceAll('__BUILD_ID__', build));
console.log(`Offline cache: ${urls.length} assets, build ${build}.`);
