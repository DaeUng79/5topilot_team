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
  // APP_ENV=ci: 관리자용 로컬 마스터 번호는 local에서만 열리므로 E2E에서는 막혀야 한다.
  APP_ENV: 'ci', SESSION_SECRET: 'e2e-only-secret',
};
const migrate = spawnSync(python, ['-m', 'alembic', 'upgrade', 'head'], { cwd, env, stdio: 'inherit' });
if (migrate.status !== 0) process.exit(migrate.status ?? 1);
// 시작용 샘플(demo-project, 테스트위원 5명)을 넣는다. seed는 기존 행을 덮어쓰지 않는다.
const seed = spawnSync(python, ['-m', 'app.seed'], { cwd, env, stdio: 'inherit' });
if (seed.status !== 0) process.exit(seed.status ?? 1);
const server = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'],
  { cwd, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill());
server.on('error', err => { console.error(err); process.exit(1); });
server.on('exit', code => process.exit(code ?? 0));
