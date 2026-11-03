import { access, copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const dist = resolve(root, 'dist');
const cloudflareOutput = resolve(dist, 'perler_pattern_web');
const server = resolve(dist, 'server');

await access(resolve(cloudflareOutput, 'index.js'));
await rm(server, { recursive: true, force: true });
await mkdir(server, { recursive: true });
await copyFile(resolve(cloudflareOutput, 'index.js'), resolve(server, 'index.js'));

for (const name of ['assets', 'favicon.svg', 'index.html']) {
  await rm(resolve(dist, name), { recursive: true, force: true });
}

await rm(cloudflareOutput, { recursive: true, force: true });

const required = [
  resolve(dist, 'server', 'index.js'),
  resolve(dist, 'client', 'index.html'),
  resolve(dist, '.openai', 'hosting.json'),
];
for (const path of required) await access(path);

const files = await readdir(resolve(dist, 'client'));
if (!files.length) throw new Error('Sites client build is empty');
