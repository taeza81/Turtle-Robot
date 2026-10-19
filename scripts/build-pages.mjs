import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('docs/', root);
const files = ['index.html', 'style.css', 'app.js', 'letters.js', 'sound.js', '.nojekyll'];

await mkdir(output, { recursive: true });
for (const file of files) {
  await copyFile(new URL(file, root), new URL(file, output));
}
// Give browser caches a new URL when an asset or its module dependencies change.
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const versions = {};
for (const file of ['letters.js', 'sound.js', 'style.css']) {
  versions[file] = hash(await readFile(new URL(file, root)));
}
let app = await readFile(new URL('app.js', root), 'utf8');
for (const file of ['letters.js', 'sound.js']) {
  app = app.replace(`'./${file}'`, `'./${file}?v=${versions[file]}'`);
}
versions['app.js'] = hash(app);
await writeFile(new URL('app.js', output), app);
let html = await readFile(new URL('index.html', root), 'utf8');
for (const file of ['app.js', 'style.css']) {
  html = html.replace(`="${file}"`, `="${file}?v=${versions[file]}"`);
}
await writeFile(new URL('index.html', output), html);
console.log(`Prepared ${files.length} static files in ${fileURLToPath(output)}`);
