import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename  = fileURLToPath(import.meta.url);
const TASKS_BIN   = path.resolve(path.dirname(__filename), '../bin/tasks.js');
const SYSTEMD_DIR = path.join(os.homedir(), '.config', 'systemd', 'user');
const SERVICE     = path.join(SYSTEMD_DIR, 'tasks-daemon.service');

function systemctl(...args) {
  execFileSync('systemctl', ['--user', ...args], { stdio: 'inherit' });
}

export function installService(hotkey = 'control+space') {
  // Verify xbindkeys is available before writing anything
  try {
    execFileSync('which', ['xbindkeys'], { stdio: 'ignore' });
  } catch {
    console.error('tasks: xbindkeys not found. Install it first:');
    console.error('  sudo apt install xbindkeys');
    process.exit(1);
  }

  fs.mkdirSync(SYSTEMD_DIR, { recursive: true });

  const unit = `[Unit]
Description=Tasks CLI — hotkey capture daemon
After=graphical-session.target
PartOf=graphical-session.target

[Service]
Type=simple
ExecStart=${process.execPath} ${TASKS_BIN} daemon --hotkey ${hotkey}
Restart=on-failure
RestartSec=3s
Environment=HOME=${os.homedir()}
PassEnvironment=DISPLAY XAUTHORITY

[Install]
WantedBy=graphical-session.target
`;

  fs.writeFileSync(SERVICE, unit);
  console.log(`✓ Wrote ${SERVICE}`);

  // Import current DISPLAY/XAUTHORITY so systemd knows which X session to use
  try {
    const display  = process.env.DISPLAY  ?? ':0';
    const xauth    = process.env.XAUTHORITY ?? path.join(os.homedir(), '.Xauthority');
    execSync(
      `systemctl --user import-environment DISPLAY XAUTHORITY`,
      { env: { ...process.env, DISPLAY: display, XAUTHORITY: xauth }, stdio: 'inherit' }
    );
  } catch {}

  try {
    systemctl('daemon-reload');
    systemctl('enable', 'tasks-daemon');
    systemctl('start',  'tasks-daemon');
    console.log(`✓ Service enabled and started`);
    console.log(`✓ Hotkey: ${hotkey} → tasks capture`);
    console.log(`  Log:    ~/.local/share/tasks/daemon.log`);
    console.log(`  Inbox:  ~/.local/share/tasks/inbox.md`);
  } catch {
    console.log('');
    console.log('Could not start via systemctl. Start manually with:');
    console.log('  tasks daemon');
  }
}

export function uninstallService() {
  try { systemctl('stop',    'tasks-daemon'); } catch {}
  try { systemctl('disable', 'tasks-daemon'); } catch {}

  if (fs.existsSync(SERVICE)) {
    fs.unlinkSync(SERVICE);
    try { systemctl('daemon-reload'); } catch {}
    console.log('✓ tasks-daemon service removed');
  } else {
    console.log('tasks service: not installed');
  }

  // Kill any lingering xbindkeys started by the daemon
  try { execFileSync('pkill', ['-x', 'xbindkeys'], { stdio: 'ignore' }); } catch {}
}

export function serviceStatus() {
  try {
    execSync('systemctl --user status tasks-daemon', { stdio: 'inherit' });
  } catch (err) {
    // systemctl exits non-zero for stopped; that's fine — output already printed
  }
}
