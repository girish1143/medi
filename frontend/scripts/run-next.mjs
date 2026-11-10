import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(currentDir, '..');
const wasmDir = path.join(frontendRoot, 'node_modules', '@next', 'swc-wasm-nodejs');
const nextBin = path.join(frontendRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

const env = { ...process.env };
if (process.platform === 'win32' && !env.NEXT_TEST_WASM_DIR && fs.existsSync(wasmDir)) {
  env.NEXT_TEST_WASM_DIR = wasmDir;
}

const args = process.argv.slice(2);
const child = spawn(process.execPath, [nextBin, ...args], {
  cwd: frontendRoot,
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});
