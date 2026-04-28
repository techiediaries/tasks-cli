import blessed from 'blessed';
import { parseTasks, parseNotes, addTask, markDone, addToDone, addNote, moveTask, initTodo, initNotes } from './md.js';
import { findProjects, findGlobalProject, todoPath, notesPath, readFile, writeFile } from './discover.js';
import { pin, unpin } from './config.js';
import { watchRoots } from './watcher.js';

const today = new Date().toISOString().slice(0, 10);

const C = {
  bg:        '#0f172a',
  sidebar:   '#1e293b',
  panel:     '#1e293b',
  border:    '#334155',
  accent:    '#6366f1',
  accentDim: '#312e81',
  current:   '#f8fafc',
  backlog:   '#94a3b8',
  done:      '#22c55e',
  note:      '#f59e0b',
  statusBg:  '#1e293b',
  statusFg:  '#94a3b8',
  inputBg:   '#0f172a',
  inputFg:   '#f8fafc',
};

export function launchTui() {
  const globalProject = findGlobalProject();
  let projects = [globalProject, ...findProjects()];
  let selectedIdx = 0;

  // ── screen ───────────────────────────────────────────────────────────────────
  const screen = blessed.screen({
    smartCSR: true, title: 'Tasks', fullUnicode: true,
    cursor: { artificial: true, shape: 'line', blink: true, color: C.accent },
  });

  // ── header ───────────────────────────────────────────────────────────────────
  const header = blessed.box({
    top: 0, left: 0, width: '100%', height: 1,
    style: { bg: C.accentDim, fg: C.current, bold: true },
  });

  function updateHeader() {
    const proj = projects[selectedIdx];
    const pinLabel = proj?.pinned ? ' 📌' : '';
    header.setContent(`  ✦ Tasks${pinLabel}   [a]add [b]backlog [d]done [m]promote [D]demote [n]note [p]pin [q]quit`);
    screen.render();
  }

  // ── sidebar ──────────────────────────────────────────────────────────────────
  const sidebar = blessed.list({
    top: 1, left: 0, width: 24, bottom: 2,
    border: { type: 'line' },
    style: {
      bg: C.sidebar, fg: C.backlog,
      border: { fg: C.border },
      selected: { bg: C.accentDim, fg: C.current, bold: true },
    },
    keys: true, vi: true,
    scrollbar: { ch: '┃', style: { fg: C.border } },
    label: ' {bold}{#6366f1-fg} Projects {/} ',
    tags: true,
  });

  // ── task panel ───────────────────────────────────────────────────────────────
  const taskPanel = blessed.box({
    top: 1, left: 24, right: 0, bottom: 2,
    border: { type: 'line' },
    style: { bg: C.panel, border: { fg: C.border } },
    scrollable: true, alwaysScroll: true, mouse: true,
    scrollbar: { ch: '┃', style: { fg: C.border } },
    tags: true,
  });

  // ── status bar ───────────────────────────────────────────────────────────────
  const statusBar = blessed.box({
    bottom: 0, left: 0, width: '100%', height: 2,
    border: { type: 'line' },
    style: { bg: C.statusBg, fg: C.statusFg, border: { fg: C.border } },
    tags: true,
  });

  function updateStatus(msg) {
    const base = `  {bold}{#6366f1-fg}[a]{/} add  {bold}{#6366f1-fg}[b]{/} backlog  {bold}{#6366f1-fg}[d]{/} done  {bold}{#6366f1-fg}[m]{/} promote  {bold}{#6366f1-fg}[D]{/} demote  {bold}{#6366f1-fg}[n]{/} note  {bold}{#6366f1-fg}[p]{/} pin  {bold}{#6366f1-fg}[q]{/} quit`;
    statusBar.setContent(msg
      ? `  {bold}{#22c55e-fg}✓ ${msg}{/}\n${base}`
      : `\n${base}`
    );
    screen.render();
  }

  screen.append(header);
  screen.append(sidebar);
  screen.append(taskPanel);
  screen.append(statusBar);

  // ── render sidebar ───────────────────────────────────────────────────────────
  function refreshSidebar() {
    const items = projects.map(p => {
      const todo = readFile(todoPath(p.dir));
      const count = todo ? parseTasks(todo).current.length : 0;
      const badge = count > 0 ? ` {#6366f1-fg}(${count}){/}` : '';
      if (p.isGlobal) {
        return `🌐 {bold}{#f59e0b-fg}${p.name}{/}${badge}`;
      }
      const pin = p.pinned ? '📌 ' : '   ';
      return `${pin}{bold}${p.name}{/}${badge}`;
    });
    sidebar.setItems(items);
    sidebar.select(Math.min(selectedIdx, projects.length - 1));
    screen.render();
  }

  // ── render tasks ─────────────────────────────────────────────────────────────
  function renderTasks(proj) {
    if (!proj) { taskPanel.setContent(''); screen.render(); return; }
    const content = readFile(todoPath(proj.dir));
    const notes   = readFile(notesPath(proj.dir));
    const { current, backlog, done } = content
      ? parseTasks(content)
      : { current: [], backlog: [], done: [] };

    const div = `  {#334155-fg}${'─'.repeat(46)}{/}`;
    const lines = [];

    const nameTag = proj.isGlobal
      ? `\n  🌐 {bold}{#f59e0b-fg}${proj.name}{/}  {#475569-fg}(~/TODO.md){/}\n`
      : `\n  {bold}{white-fg}${proj.pinned ? '📌 ' : ''}${proj.name}{/}\n`;
    lines.push(nameTag);

    lines.push(`  {bold}{#6366f1-fg}▸ Current{/}  {#475569-fg}${current.length} task${current.length !== 1 ? 's' : ''}{/}`);
    lines.push(div);
    if (current.length)
      current.forEach(t => lines.push(`  {white-fg}◻  ${t.text}{/}`));
    else
      lines.push(`  {#475569-fg}nothing here — press {bold}a{/} to add{/}`);
    lines.push('');

    lines.push(`  {bold}{#94a3b8-fg}▸ Backlog{/}  {#475569-fg}${backlog.length} task${backlog.length !== 1 ? 's' : ''}{/}`);
    lines.push(div);
    if (backlog.length)
      backlog.forEach(t => lines.push(`  {#94a3b8-fg}◻  ${t.text}{/}`));
    else
      lines.push(`  {#475569-fg}nothing here — press {bold}b{/} to add{/}`);
    lines.push('');

    lines.push(`  {bold}{#22c55e-fg}▸ Done{/}`);
    lines.push(div);
    if (done.length)
      done.slice(-10).forEach(t => lines.push(`  {#22c55e-fg}✓  ${t.text}{/}`));
    else
      lines.push(`  {#475569-fg}(none yet){/}`);

    if (notes) {
      const parsed = parseNotes(notes);
      if (parsed.length) {
        lines.push('');
        lines.push(`  {bold}{#f59e0b-fg}▸ Notes{/}`);
        lines.push(div);
        parsed.slice(-5).forEach(n =>
          lines.push(`  {#475569-fg}${n.date}{/}  {#f59e0b-fg}${n.text}{/}`)
        );
      }
    }

    taskPanel.setContent(lines.join('\n'));
    taskPanel.scrollTo(0);
    screen.render();
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  function currentProj() { return projects[selectedIdx]; }

  function refresh() {
    projects = [globalProject, ...findProjects()];
    selectedIdx = Math.min(selectedIdx, projects.length - 1);
    refreshSidebar();
    renderTasks(currentProj());
    updateHeader();
  }

  // ── prompt ───────────────────────────────────────────────────────────────────
  function prompt(labelText, cb) {
    const box = blessed.box({
      top: 'center', left: 'center', width: 62, height: 5,
      border: { type: 'line' },
      style: { bg: C.inputBg, border: { fg: C.accent } },
      label: ` {bold}{#6366f1-fg} ${labelText} {/} `, tags: true,
    });
    const input = blessed.textbox({
      parent: box, top: 1, left: 2, right: 2, height: 1,
      style: { bg: C.inputBg, fg: C.inputFg },
      inputOnFocus: true,
    });
    screen.append(box);
    input.focus();
    screen.render();
    input.once('submit', val => {
      screen.remove(box); screen.render();
      cb(val?.trim() ?? '');
    });
    input.once('cancel', () => {
      screen.remove(box); screen.render();
      sidebar.focus();
    });
    input.readInput();
  }

  // ── pick from list ───────────────────────────────────────────────────────────
  function pickTask(proj, section, cb) {
    const content = readFile(todoPath(proj.dir));
    if (!content) return;
    const tasks = parseTasks(content)[section];
    if (!tasks.length) { updateStatus('No tasks to mark done'); return; }

    const box = blessed.list({
      top: 'center', left: 'center', width: 62,
      height: Math.min(tasks.length + 4, 16),
      border: { type: 'line' },
      label: ` {bold}{#6366f1-fg} Mark done — ${proj.name} {/} `,
      tags: true, keys: true, vi: true,
      style: {
        bg: C.inputBg, border: { fg: C.accent },
        selected: { bg: C.accentDim, fg: C.current, bold: true },
        item: { fg: C.backlog },
      },
      items: tasks.map(t => `  ${t.text}`),
    });
    screen.append(box);
    box.focus();
    screen.render();
    box.once('select', (_, idx) => {
      screen.remove(box); screen.render();
      cb(tasks[idx].text);
    });
    box.key(['escape', 'q'], () => {
      screen.remove(box); screen.render(); sidebar.focus();
    });
  }

  // ── sidebar events ───────────────────────────────────────────────────────────
  sidebar.on('select item', (_, idx) => {
    selectedIdx = idx;
    renderTasks(currentProj());
    updateHeader();
  });

  // ── key bindings ─────────────────────────────────────────────────────────────
  screen.key(['q', 'C-c'], () => process.exit(0));

  screen.key('a', () => {
    prompt(`Add task — ${currentProj()?.name}`, text => {
      if (!text) return sidebar.focus();
      const proj = currentProj();
      const p = todoPath(proj.dir);
      writeFile(p, addTask(readFile(p) ?? initTodo(proj.name), text, 'current'));
      refresh(); updateStatus(`Added: ${text}`); sidebar.focus();
    });
  });

  screen.key('b', () => {
    prompt(`Add to backlog — ${currentProj()?.name}`, text => {
      if (!text) return sidebar.focus();
      const proj = currentProj();
      const p = todoPath(proj.dir);
      writeFile(p, addTask(readFile(p) ?? initTodo(proj.name), text, 'backlog'));
      refresh(); updateStatus(`Backlog: ${text}`); sidebar.focus();
    });
  });

  screen.key('d', () => {
    pickTask(currentProj(), 'current', text => {
      const proj = currentProj();
      const p = todoPath(proj.dir);
      const { content: updated, found } = markDone(readFile(p), text);
      if (found) writeFile(p, addToDone(updated, text, today));
      refresh(); updateStatus(`Done: ${text}`); sidebar.focus();
    });
  });

  screen.key('m', () => {
    pickTask(currentProj(), 'backlog', text => {
      const proj = currentProj();
      const p = todoPath(proj.dir);
      const { content: updated, found } = moveTask(readFile(p), text, 'backlog', 'current');
      if (found) writeFile(p, updated);
      refresh(); updateStatus(`Promoted: ${text}`); sidebar.focus();
    });
  });

  screen.key('S-d', () => {
    pickTask(currentProj(), 'current', text => {
      const proj = currentProj();
      const p = todoPath(proj.dir);
      const { content: updated, found } = moveTask(readFile(p), text, 'current', 'backlog');
      if (found) writeFile(p, updated);
      refresh(); updateStatus(`Demoted: ${text}`); sidebar.focus();
    });
  });

  screen.key('n', () => {
    prompt(`Add note — ${currentProj()?.name}`, text => {
      if (!text) return sidebar.focus();
      const proj = currentProj();
      const p = notesPath(proj.dir);
      writeFile(p, addNote(readFile(p) ?? initNotes(proj.name), text, today));
      refresh(); updateStatus('Note saved'); sidebar.focus();
    });
  });

  screen.key('p', () => {
    const proj = currentProj();
    if (!proj) return;
    if (proj.pinned) {
      unpin(proj.name);
      updateStatus(`Unpinned: ${proj.name}`);
    } else {
      pin(proj.name);
      updateStatus(`Pinned: ${proj.name}`);
    }
    refresh(); sidebar.focus();
  });

  screen.key('r', refresh);

  // ── live file watching ───────────────────────────────────────────────────────
  watchRoots(() => refresh());

  // ── init ─────────────────────────────────────────────────────────────────────
  sidebar.focus();
  refresh();
  screen.render();
}
