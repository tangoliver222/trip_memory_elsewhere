import { access, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repositoryRoot, 'design-lab/prototypes-vanilla/dist');
const destination = path.join(repositoryRoot, 'firebase/hosting');

await access(path.join(source, 'index.html'));
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

console.log(`Prepared Firebase Hosting assets at ${destination}`);
