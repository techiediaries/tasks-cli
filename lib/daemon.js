import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const TASKS_BIN   = path.resolve(path.dirname(__filename), '../bin/tasks.js');
const DATA_DIR    = path.join(os.homedir(), '.local', 'share', 'tasks');
const CONFIG_DIR  = path.join(os.homedir(), '.config', 'tasks');
const PID_FILE    = path.join(DATA_DIR, 'daemon.pid');
const LOG_FILE    = path.join(DATA_DIR, 'daemon.log');
const HOTKEY_CONF = path.join(CONFIG_DIR, 'hotkey.xbindkeysrc');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stderr.write(line);
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

// ── PID helpers ──────────────────────────────────────────────────────────────

export function isDaemonRunning() {
  if (!fs.existsSync(PID_FILE)) return false;
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function getDaemonPid() {
  if (!fs.existsSync(PID_FILE)) return null;
  return parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
}

export function stopDaemon() {
  if (!isDaemonRunning()) { console.log('tasks daemon: not running'); return; }
  const pid = getDaemonPid();
  process.kill(pid, 'SIGTERM');
  console.log(`tasks daemon: stopped (pid ${pid})`);
}

// ── terminal detection ───────────────────────────────────────────────────────

function findTerminal(nodeExec, captureCmd) {
  const cmd = `${nodeExec} ${captureCmd}`;
  const candidates = [
    // alacritty: floating class, compact geometry
    ['alacritty', '--class', 'float,float',
      '--option', 'window.dimensions.columns=66',
      '--option', 'window.dimensions.lines=10',
      '-e', nodeExec, captureCmd],
    // kitty
    ['kitty', '--class', 'float',
      '--override', 'initial_window_width=640',
      '--override', 'initial_window_height=160',
      '-e', nodeExec, captureCmd],
    // xterm — widest compatibility
    ['xterm', '-geometry', '66x10',
      '-title', 'Tasks: Quick Capture',
      '-bg', '#0f172a', '-fg', '#f8fafc',
      '-fa', 'Monospace', '-fs', '11',
      '-e', nodeExec, captureCmd],
    // gnome-terminal
    ['gnome-terminal', '--geometry=66x10', '--title=Tasks: Quick Capture',
      '--', nodeExec, captureCmd],
    // xfce4-terminal
    ['xfce4-terminal', '--geometry=66x10', '--title=Tasks: Quick Capture',
      '-x', nodeExec, captureCmd],
  ];

  for (const [bin, ...rest] of candidates) {
    try {
      execFileSync('which', [bin], { stdio: 'ignore' });
      return [bin, ...rest];
    } catch {}
  }
  return null;
}

// ── xbindkeys config ─────────────────────────────────────────────────────────

function writeHotkeyConfig(hotkey, nodeExec, captureCmd) {
  const termArgs = findTerminal(nodeExec, captureCmd);
  if (!termArgs) {
    throw new Error(
      'No terminal emulator found. Install xterm, alacritty, kitty, or gnome-terminal.'
    );
  }

  // xbindkeys config: quoted shell command on line 1, keysym on line 2
  // Shell-escape each arg
  const shellCmd = termArgs
    .map(a => (a.includes(' ') ? `"${a}"` : a))
    .join(' ');

  const config = `"${shellCmd}"\n  ${hotkey}\n`;
  ensureDir(CONFIG_DIR);
  fs.writeFileSync(HOTKEY_CONF, config);
  log(`hotkey config: ${HOTKEY_CONF}`);
  log(`command: ${shellCmd}`);
  log(`hotkey: ${hotkey}`);
}

// ── main daemon loop ─────────────────────────────────────────────────────────

export function daemonMain({ hotkey = 'control+space' } = {}) {
  ensureDir(DATA_DIR);
  ensureDir(CONFIG_DIR);

  // Check xbindkeys is available
  try {
    execFileSync('which', ['xbindkeys'], { stdio: 'ignore' });
  } catch {
    log('ERROR: xbindkeys not found. Install with: sudo apt install xbindkeys');
    process.exit(1);
  }

  // Write PID
  fs.writeFileSync(PID_FILE, String(process.pid));
  log(`daemon started (pid ${process.pid}, hotkey ${hotkey})`);

  const nodeExec  = process.execPath;
  const captureCmd = TASKS_BIN + ' capture';

  try {
    writeHotkeyConfig(hotkey, nodeExec, captureCmd);
  } catch (err) {
    log(`ERROR: ${err.message}`);
    process.exit(1);
  }

  // Kill any existing xbindkeys so our config takes effect
  try { execFileSync('pkill', ['-x', 'xbindkeys'], { stdio: 'ignore' }); } catch {}

  let xbk;
  let stopping = false;

  function startXbindkeys() {
    if (stopping) return;
    // -n = nodaemon (foreground); -f = config file
    xbk = spawn('xbindkeys', ['-n', '-f', HOTKEY_CONF], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    log(`xbindkeys started (pid ${xbk.pid})`);

    xbk.stdout.on('data', d => log(`xbk: ${d.toString().trim()}`));
    xbk.stderr.on('data', d => log(`xbk: ${d.toString().trim()}`));

    xbk.on('exit', code => {
      if (stopping) return;
      log(`xbindkeys exited (${code ?? 'signal'}), restarting in 3s`);
      setTimeout(startXbindkeys, 3000);
    });
  }

  startXbindkeys();

  // Keep Node alive
  const heartbeat = setInterval(() => {
    log('heartbeat');
  }, 60 * 60 * 1000); // hourly — just to log it's alive

  function shutdown() {
    stopping = true;
    clearInterval(heartbeat);
    log('shutting down');
    if (xbk) { try { xbk.kill(); } catch {} }
    try { fs.unlinkSync(PID_FILE); } catch {}
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}
