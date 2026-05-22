import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadDotEnv(path = '.env.local') {
  const file = resolve(path);
  if (!existsSync(file)) return;

  const text = readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (!process.env[key]) process.env[key] = value;
  }
}
