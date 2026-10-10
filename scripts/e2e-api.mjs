import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../apps/api/', import.meta.url));
const localPython = path.join(cwd, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const python = existsSync(localPython) ? localPython : 'python';
const db = path.join(mkdtempSync(path.join(tmpdir(), 'simsa-e2e-')), 'test.db').replaceAll('\\', '/');
const env = {
  ...process.env, DATABASE_URL: `sqlite:///${db}`, SIMSAIMDANG_DEMO_AUTH: 'true',
  // 평가위원 본인확인 데모(로컬 E2E 전용 값). 응답에 코드가 노출되지 않는지 E2E가 확인한다.
  APP_ENV: 'ci', SESSION_SECRET: 'e2e-only-secret', DEMO_VERIFY_CODE: '000000',
};
const migrate = spawnSync(python, ['-m', 'alembic', 'upgrade', 'head'], { cwd, env, stdio: 'inherit' });
if (migrate.status !== 0) process.exit(migrate.status ?? 1);
const server = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'],
  { cwd, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill());
server.on('error', err => { console.error(err); process.exit(1); });
server.on('exit', code => process.exit(code ?? 0));
