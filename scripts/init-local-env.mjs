import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const localEnv = new URL('../.env', import.meta.url);
const template = new URL('../.env.example', import.meta.url);
const existing = existsSync(localEnv);
let contents = readFileSync(existing ? localEnv : template, 'utf8');
const parsed = parseEnv(contents);
const keys = { JWT_ACCESS_SECRET: 32, JWT_REFRESH_SECRET: 32, PICKUP_SECRET: 32, SEED_PASSWORD: 18 };
const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
const missing = Object.entries(keys).filter(([key]) => !parsed[key]);

for (const [key, bytes] of missing) {
  const line = `${key}=${randomBytes(bytes).toString('base64url')}`;
  const setting = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=[^\\r\\n]*`, 'm');
  if (setting.test(contents)) {
    contents = contents.replace(setting, line);
  } else {
    contents = contents.trimEnd() + lineEnding + line + lineEnding;
  }
}

if (!existing || missing.length > 0) {
  writeFileSync(localEnv, contents, { mode: 0o600, flag: existing ? 'w' : 'wx' });
}
console.info('Local .env is ready. Read SEED_PASSWORD from that file for demo login.');
