#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { parseTasks, addTask, markDone, addToDone, addNote, initTodo, initNotes } from '../lib/md.js';
import { findProjects, todoPath, notesPath, readFile, writeFile } from '../lib/discover.js';
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

function cmdList(args) {
  const { flags, rest } = parseFlags(args);
  if (rest[0]) {
    const proj = resolveProject(rest[0]);
    const content = readFile(todoPath(proj.dir));
    if (!content) return console.log(`${proj.name}: no TODO.md yet.`);
    const { current, backlog, done } = parseTasks(content);
    console.log(`\n📁 ${proj.name}${proj.pinned ? ' 📌' : ''}\n`);
    if (current.length) { console.log('  Current:'); current.forEach(t => console.log(`    [ ] ${t.text}`)); }
    if (backlog.length) { console.log('  Backlog:'); backlog.forEach(t => console.log(`    [ ] ${t.text}`)); }
    if (done.length)    { console.log('  Done:');    done.forEach(t => console.log(`    [x] ${t.text}`)); }
    if (!current.length && !backlog.length && !done.length) console.log('  (empty)');
    console.log('');
  } else {
    const projects = findProjects();
    if (!projects.length) return console.log('No projects found. Run `tasks init` inside a project directory.');
    console.log('');
    let any = false;
    for (const proj of projects) {
      const content = readFile(todoPath(proj.dir));
      if (!content) continue;
      const { current, backlog } = parseTasks(content);
      if (!current.length && !backlog.length) continue;
      any = true;
      const pin   = proj.pinned ? '📌 ' : '   ';
      const cur   = current.length ? `${current.length} current` : '';
      const bkl   = backlog.length ? `${backlog.length} backlog` : '';
      console.log(`  ${pin}${proj.name.padEnd(22)} ${[cur, bkl].filter(Boolean).join(', ')}`);
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
  tasks                          rollup of all projects with open tasks
  tasks ui                       launch interactive TUI (live file watching)
  tasks init [dir]               create TODO.md here (or in [dir])
  tasks ls [project]             list tasks for one project or all
  tasks add "text" [-p project]  add to current tasks
  tasks backlog "text"           add to backlog
  tasks done "text"              mark a task done
  tasks note "text"              add a note to NOTES.md
  tasks pin [project]            pin project to top of TUI sidebar
  tasks unpin [project]          unpin project
  tasks root [add] [dir]         manage watched root directories
  `);
}

// ── dispatch ─────────────────────────────────────────────────────────────────

switch (cmd) {
  case 'ui':                  launchTui();        break;
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
  default: die(`Unknown command: ${cmd}. Run \`tasks help\` for usage.`);
}
