import blessed from 'blessed';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { addTask, initTodo } from './md.js';
import { findProjects, todoPath, readFile, writeFile } from './discover.js';

const INBOX_FILE = path.join(os.homedir(), '.local', 'share', 'tasks', 'inbox.md');
const today      = new Date().toISOString().slice(0, 10);

const C = {
  bg:     '#0f172a',
  accent: '#6366f1',
  dim:    '#475569',
  fg:     '#f8fafc',
  modes: {
    task:    '#6366f1',
    backlog: '#94a3b8',
    raw:     '#f59e0b',
  },
};

const MODES = ['task', 'backlog', 'raw'];

// ── save logic ───────────────────────────────────────────────────────────────

function activeProject() {
  const projects = findProjects();
  return projects.find(p => p.pinned) ?? projects[0] ?? null;
}

function saveCapture(text, mode) {
  if (!text) return;

  if (mode === 'raw') {
    if (!fs.existsSync(INBOX_FILE)) {
      fs.mkdirSync(path.dirname(INBOX_FILE), { recursive: true });
      fs.writeFileSync(INBOX_FILE, '# Inbox\n\n');
    }
    fs.appendFileSync(INBOX_FILE, `- ${today} ${text}\n`);
    return;
  }

  const proj = activeProject();
  if (!proj) {
    // No project registered — fall back to inbox
    if (!fs.existsSync(INBOX_FILE)) {
      fs.mkdirSync(path.dirname(INBOX_FILE), { recursive: true });
      fs.writeFileSync(INBOX_FILE, '# Inbox\n\n');
    }
    fs.appendFileSync(INBOX_FILE, `- ${today} [${mode}] ${text}\n`);
    return;
  }

  const p       = todoPath(proj.dir);
  const content = readFile(p) ?? initTodo(proj.name);
  const section = mode === 'task' ? 'current' : 'backlog';
  writeFile(p, addTask(content, text, section));
}

// ── UI ───────────────────────────────────────────────────────────────────────

export function launchCapture() {
  let modeIdx = 0;

  const screen = blessed.screen({
    smartCSR: true, title: 'Quick Capture', fullUnicode: true,
    cursor: { artificial: true, shape: 'line', blink: true, color: C.accent },
  });

  const proj   = activeProject();
  const target = proj ? proj.name : 'inbox';

  // ── outer box ────────────────────────────────────────────────────────────
  const box = blessed.box({
    top: 'center', left: 'center', width: 66, height: 7,
    border: { type: 'line' },
    style: { bg: C.bg, border: { fg: C.accent } },
    tags: true,
  });

  // ── mode bar (top row inside box) ────────────────────────────────────────
  const modeBar = blessed.box({
    parent: box,
    top: 0, left: 1, right: 1, height: 1,
    style: { bg: C.bg },
    tags: true,
  });

  // ── input ────────────────────────────────────────────────────────────────
  const input = blessed.textbox({
    parent: box,
    top: 2, left: 2, right: 2, height: 1,
    style: { bg: C.bg, fg: C.fg },
    inputOnFocus: true,
  });

  // ── hint bar ─────────────────────────────────────────────────────────────
  const hint = blessed.box({
    parent: box,
    top: 4, left: 1, right: 1, height: 1,
    style: { bg: C.bg },
    tags: true,
  });

  screen.append(box);

  // ── render helpers ────────────────────────────────────────────────────────

  function currentMode() { return MODES[modeIdx]; }

  function renderModeBar() {
    const labels = MODES.map((m, i) => {
      const col = C.modes[m];
      return i === modeIdx
        ? `{bold}{${col}-fg}[${m}]{/}`
        : `{${C.dim}-fg}${m}{/}`;
    }).join('  ');
    modeBar.setContent(`  ${labels}`);
    box.style.border.fg = C.modes[currentMode()];
  }

  function renderHint() {
    const dest = currentMode() === 'raw' ? 'inbox' : target;
    hint.setContent(
      `  {${C.dim}-fg}Tab: cycle   Enter: save → {bold}${dest}{/}   Esc: cancel{/}`
    );
  }

  function renderTitle() {
    box.setLabel(` {bold}{#6366f1-fg} Quick Capture {/} `);
  }

  function render() {
    renderModeBar();
    renderHint();
    renderTitle();
    screen.render();
  }

  // ── key handlers ──────────────────────────────────────────────────────────

  input.key('tab', () => {
    modeIdx = (modeIdx + 1) % MODES.length;
    // blessed inserts the tab char before firing the key event — strip it
    input.setValue((input.value || '').replace(/\t/g, ''));
    render();
  });

  input.on('submit', val => {
    const text = val?.trim();
    if (text) saveCapture(text, currentMode());
    screen.destroy();
    process.exit(0);
  });

  input.on('cancel', () => {
    screen.destroy();
    process.exit(0);
  });

  screen.key(['escape', 'C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  // ── init ──────────────────────────────────────────────────────────────────
  render();
  input.focus();
  input.readInput();
  screen.render();
}
