import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('docs/', root);
const files = ['index.html', 'style.css', 'app.js', 'letters.js', '.nojekyll'];

await mkdir(output, { recursive: true });
for (const file of files) {
  await copyFile(new URL(file, root), new URL(file, output));
}
console.log(`Prepared ${files.length} static files in ${fileURLToPath(output)}`);
