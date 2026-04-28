#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { parseTasks, parseNotes, addTask, markDone, addToDone, addNote, initTodo, initNotes } from '../lib/md.js';
import { findProjects, findGlobalProject, todoPath, notesPath, readFile, writeFile } from '../lib/discover.js';
import { loadConfig, saveConfig, addRoot, pin, unpin } from '../lib/config.js';
import { launchTui } from '../lib/tui.js';

const [,, cmd, ...args] = process.argv;
const today = new Date().toISOString().slice(0, 10);

// ── helpers ──────────────────────────────────────────────────────────────────

function resolveProject(flag) {
  if (flag) {
    const p = findProjects().find(p => p.name === flag);
    return p ?? die(`Project "${flag}" not found. Run \`tasks init\` inside it first.`);
  }
  const cwd = process.cwd();
  const p = findProjects().find(p => cwd.startsWith(p.dir));
  if (p) return p;
  // check if cwd itself has a TODO.md
  if (fs.existsSync(path.join(cwd, 'TODO.md')))
    return { name: path.basename(cwd), dir: cwd, pinned: false };
  die('Not inside a known project. Run `tasks init` here first.');
}

function die(msg) { console.error(`tasks: ${msg}`); process.exit(1); }

function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' || args[i] === '-p') flags.project = args[++i];
    else rest.push(args[i]);
  }
  return { flags, rest };
}

function ensureTodo(dir, name) {
  const p = todoPath(dir);
  if (!fs.existsSync(p)) writeFile(p, initTodo(name));
  return p;
}

function ensureNotes(dir, name) {
  const p = notesPath(dir);
  if (!fs.existsSync(p)) writeFile(p, initNotes(name));
  return p;
}

// ── commands ─────────────────────────────────────────────────────────────────

function cmdInit(args) {
  const dir  = path.resolve(args[0] ?? '.');
  const name = path.basename(dir);
  const p    = todoPath(dir);
  if (fs.existsSync(p)) {
    console.log(`${name}: already initialized (${p})`);
  } else {
    writeFile(p, initTodo(name));
    console.log(`✓ Initialized ${name} — created TODO.md`);
  }
  // ensure dir is reachable from a root; if not, add its parent
  const config = loadConfig();
  const parent = path.dirname(dir);
  if (!config.roots.some(r => dir.startsWith(r) || parent.startsWith(r))) {
    addRoot(parent);
    console.log(`✓ Added root: ${parent}`);
  }
}

function printProject(proj) {
  const content = readFile(todoPath(proj.dir));
  const notes   = readFile(notesPath(proj.dir));
  const { current, backlog, done } = content
    ? parseTasks(content)
    : { current: [], backlog: [], done: [] };
  const parsedNotes = notes ? parseNotes(notes) : [];

  const label = proj.isGlobal
    ? `🌐 Global  (~/TODO.md)`
    : `📁 ${proj.name}${proj.pinned ? ' 📌' : ''}`;
  console.log(`\n${label}`);

  if (current.length) {
    console.log('  Current:');
    current.forEach(t => console.log(`    [ ] ${t.text}`));
  }
  if (backlog.length) {
    console.log('  Backlog:');
    backlog.forEach(t => console.log(`    [ ] ${t.text}`));
  }
  if (done.length) {
    console.log('  Done:');
    done.slice(-5).forEach(t => console.log(`    [x] ${t.text}`));
  }
  if (parsedNotes.length) {
    console.log('  Notes:');
    parsedNotes.slice(-5).forEach(n => console.log(`    ${n.date}  ${n.text}`));
  }
  if (!current.length && !backlog.length && !done.length && !parsedNotes.length)
    console.log('  (empty)');
}

function cmdList(args) {
  const { flags, rest } = parseFlags(args);
  if (rest[0]) {
    const proj = rest[0] === 'global'
      ? findGlobalProject()
      : resolveProject(rest[0]);
    printProject(proj);
    console.log('');
  } else {
    const global   = findGlobalProject();
    const projects = [global, ...findProjects()];
    console.log('');
    let any = false;
    for (const proj of projects) {
      const content = readFile(todoPath(proj.dir));
      const notes   = readFile(notesPath(proj.dir));
      const { current, backlog } = content ? parseTasks(content) : { current: [], backlog: [] };
      const noteCount = notes ? parseNotes(notes).length : 0;
      if (!current.length && !backlog.length && !noteCount) continue;
      any = true;
      const pinMark = proj.isGlobal ? '🌐 ' : proj.pinned ? '📌 ' : '   ';
      const cur  = current.length  ? `${current.length} current`  : '';
      const bkl  = backlog.length  ? `${backlog.length} backlog`  : '';
      const nts  = noteCount       ? `${noteCount} notes`         : '';
      console.log(`  ${pinMark}${proj.name.padEnd(22)} ${[cur, bkl, nts].filter(Boolean).join(', ')}`);
      current.forEach(t => console.log(`       [ ] ${t.text}`));
    }
    if (!any) console.log('  Nothing pending.');
    console.log('');
  }
}

function cmdAdd(args) {
  const { flags, rest } = parseFlags(args);
  const text = rest.join(' ');
  if (!text) die('Usage: tasks add "task description" [-p project]');
  const proj = resolveProject(flags.project);
  const p    = ensureTodo(proj.dir, proj.name);
  writeFile(p, addTask(readFile(p), text, 'current'));
  console.log(`✓ Added to ${proj.name}: ${text}`);
}

function cmdBacklog(args) {
  const { flags, rest } = parseFlags(args);
  const text = rest.join(' ');
  if (!text) die('Usage: tasks backlog "task description" [-p project]');
  const proj = resolveProject(flags.project);
  const p    = ensureTodo(proj.dir, proj.name);
  writeFile(p, addTask(readFile(p), text, 'backlog'));
  console.log(`✓ Backlog in ${proj.name}: ${text}`);
}

function cmdDone(args) {
  const { flags, rest } = parseFlags(args);
  const text = rest.join(' ');
  if (!text) die('Usage: tasks done "task description" [-p project]');
  const proj    = resolveProject(flags.project);
  const p       = todoPath(proj.dir);
  const content = readFile(p);
  if (!content) die('No TODO.md found.');
  const { content: updated, found } = markDone(content, text);
  if (!found) die(`Task not found: "${text}"`);
  writeFile(p, addToDone(updated, text, today));
  console.log(`✓ Done in ${proj.name}: ${text}`);
}

function cmdNote(args) {
  const { flags, rest } = parseFlags(args);
  const text = rest.join(' ');
  if (!text) die('Usage: tasks note "text" [-p project]');
  const proj = resolveProject(flags.project);
  const p    = ensureNotes(proj.dir, proj.name);
  writeFile(p, addNote(readFile(p) ?? initNotes(proj.name), text, today));
  console.log(`✓ Note added to ${proj.name}`);
}

function cmdPin(args) {
  const { rest } = parseFlags(args);
  const proj = resolveProject(rest[0]);
  pin(proj.name);
  console.log(`✓ Pinned: ${proj.name}`);
}

function cmdUnpin(args) {
  const { rest } = parseFlags(args);
  const proj = resolveProject(rest[0]);
  unpin(proj.name);
  console.log(`✓ Unpinned: ${proj.name}`);
}

function cmdRoot(args) {
  const [sub, dir] = args;
  if (sub === 'add') {
    addRoot(dir ? path.resolve(dir) : process.cwd());
    console.log(`✓ Root added: ${dir ? path.resolve(dir) : process.cwd()}`);
  } else {
    const { roots } = loadConfig();
    roots.forEach(r => console.log(`  ${r}`));
  }
}

function cmdHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                        tasks — cheatsheet                        ║
╚══════════════════════════════════════════════════════════════════╝

OVERVIEW
  Each project gets a TODO.md with three sections: Current, Backlog, Done.
  A global ~/TODO.md is always visible in the TUI as the "Global" project.
  Raw notes go to ~/NOTES.md and appear under Global → Notes in the TUI.

TASK COMMANDS
  tasks                               list all projects with open tasks
  tasks ls                            same as above
  tasks ls <project>                  list tasks for one project
  tasks add "text" [-p project]       add to Current (active project or -p)
  tasks backlog "text" [-p project]   add to Backlog
  tasks bl "text"                     shorthand for backlog
  tasks done "text" [-p project]      mark a Current task as done
  tasks note "text" [-p project]      append a timestamped note to NOTES.md

PROJECT MANAGEMENT
  tasks init [dir]                    create TODO.md here (or in [dir])
                                      auto-registers the parent as a root
  tasks pin [project]                 pin project to top of TUI sidebar
  tasks unpin [project]               unpin project
  tasks root                          list watched root directories
  tasks root add [dir]                add a root (default: current dir)

TUI
  tasks ui                            launch interactive TUI
  tasks ui help                       show TUI key bindings cheatsheet

QUICK CAPTURE (hotkey popup)
  tasks capture                       open capture popup directly
  tasks daemon [--hotkey combo]       run xbindkeys hotkey daemon (foreground)
                                      default hotkey: control+space
  tasks daemon stop                   stop the running daemon
  tasks daemon status                 show daemon pid / running state

SYSTEMD SERVICE
  tasks service install [--hotkey c]  install + start as a systemd user service
  tasks service uninstall             remove the systemd service
  tasks service status                show service status

CAPTURE MODES (in the popup, press Tab to cycle)
  task    →  adds to Current in active project
  backlog →  adds to Backlog in active project
  raw     →  adds a timestamped note to ~/NOTES.md (Global → Notes in TUI)

FILES
  ~/TODO.md                           global task inbox (always in TUI)
  ~/NOTES.md                          global notes (raw captures land here)
  <project>/TODO.md                   per-project tasks
  <project>/NOTES.md                  per-project notes
  ~/.config/tasks/config.json         roots, pinned projects
  ~/.config/tasks/hotkey.xbindkeysrc  generated xbindkeys config
  ~/.local/share/tasks/daemon.pid     daemon pid file
  ~/.local/share/tasks/daemon.log     daemon / xbindkeys log

EXAMPLES
  tasks add "write tests for auth module"
  tasks backlog "refactor payment gateway" -p myapp
  tasks done "write tests for auth module"
  tasks note "decided to use JWT over sessions"
  tasks service install --hotkey "control+space"
  `);
}

function cmdUiHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    tasks ui — key bindings                       ║
╚══════════════════════════════════════════════════════════════════╝

NAVIGATION
  j / ↓           move down in project list
  k / ↑           move up in project list
  g               jump to top of project list
  G               jump to bottom of project list
  scroll          mouse scroll works in the task panel

TASK ACTIONS
  a               add task → Current (opens inline prompt)
  b               add task → Backlog (opens inline prompt)
  d               mark a Current task done (opens picker)
  m               promote Backlog → Current (opens picker)
  D               demote Current → Backlog (opens picker)
  n               add a timestamped note (opens inline prompt)

PROJECT ACTIONS
  p               toggle pin on selected project
                  (pinned projects sort to top of sidebar)
  r               force-refresh all projects and files

GENERAL
  q / Ctrl+C      quit

PICKER NAVIGATION (when a task picker is open)
  j / ↓           move down
  k / ↑           move up
  Enter           confirm selection
  Escape / q      cancel and close picker

LAYOUT
  Left panel      project sidebar (24 cols) — navigate with j/k
  Right panel     task panel for selected project
                    ▸ Current   — active tasks
                    ▸ Backlog   — queued tasks
                    ▸ Done      — last 10 completed
                    ▸ Notes     — last 5 notes (if NOTES.md exists)
  Bottom bar      key binding reminder + last action confirmation

LIVE FILE WATCHING
  The TUI watches all project directories via chokidar.
  Editing TODO.md or NOTES.md in another terminal updates the TUI instantly.
  `);
}

// ── dispatch ─────────────────────────────────────────────────────────────────

async function main() {
  switch (cmd) {
    case 'ui':
      if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h')
        cmdUiHelp();
      else
        launchTui();
      break;
    case 'init':                cmdInit(args);      break;
    case undefined:
    case 'ls':                  cmdList(args);      break;
    case 'add':                 cmdAdd(args);       break;
    case 'bl':
    case 'backlog':             cmdBacklog(args);   break;
    case 'done':                cmdDone(args);      break;
    case 'note':                cmdNote(args);      break;
    case 'pin':                 cmdPin(args);       break;
    case 'unpin':               cmdUnpin(args);     break;
    case 'root':                cmdRoot(args);      break;
    case 'help': case '--help': case '-h': cmdHelp(); break;

    case 'capture': {
      const { launchCapture } = await import('../lib/capture.js');
      launchCapture();
      break;
    }

    case 'daemon': {
      const { daemonMain, stopDaemon, isDaemonRunning, getDaemonPid } =
        await import('../lib/daemon.js');
      if (args[0] === 'stop') {
        stopDaemon();
      } else if (args[0] === 'status') {
        const running = isDaemonRunning();
        console.log(running ? `running (pid ${getDaemonPid()})` : 'not running');
      } else {
        const hotkeyIdx = args.indexOf('--hotkey');
        const hotkey    = hotkeyIdx >= 0 ? args[hotkeyIdx + 1] : 'control+space';
        daemonMain({ hotkey });
      }
      break;
    }

    case 'service': {
      const { installService, uninstallService, serviceStatus } =
        await import('../lib/service.js');
      const hotkeyIdx = args.indexOf('--hotkey');
      const hotkey    = hotkeyIdx >= 0 ? args[hotkeyIdx + 1] : 'control+space';
      if (args[0] === 'install')   installService(hotkey);
      else if (args[0] === 'uninstall') uninstallService();
      else if (args[0] === 'status')    serviceStatus();
      else console.log('Usage: tasks service [install|uninstall|status] [--hotkey combo]');
      break;
    }

    default: die(`Unknown command: ${cmd}. Run \`tasks help\` for usage.`);
  }
}

main();
