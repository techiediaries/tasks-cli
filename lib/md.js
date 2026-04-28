// Pure functions for reading and writing task markdown files.
// No filesystem I/O — callers handle that.

export function parseTasks(content) {
  const sections = { current: [], backlog: [], done: [] };
  let section = null;
  for (const line of content.split('\n')) {
    const h = line.match(/^## (Current|Backlog|Done)/i);
    if (h) { section = h[1].toLowerCase(); continue; }
    if (!section) continue;
    const task = line.match(/^- \[( |x)\] (.+)/);
    if (task) sections[section].push({ done: task[1] === 'x', text: task[2].replace(/ — \d{4}-\d{2}-\d{2}$/, '') });
  }
  return sections;
}

export function parseNotes(content) {
  const notes = [];
  let date = null;
  for (const line of content.split('\n')) {
    const h = line.match(/^## (\d{4}-\d{2}-\d{2})/);
    if (h) { date = h[1]; continue; }
    const note = line.match(/^- (.+)/);
    if (note && date) notes.push({ date, text: note[1] });
  }
  return notes;
}

export function addTask(content, text, section = 'current') {
  const header = section === 'backlog' ? '## Backlog' : '## Current';
  const entry = `- [ ] ${text}`;
  if (!content.includes(header)) {
    return content.trimEnd() + `\n\n${header}\n${entry}\n`;
  }
  return content.replace(header, `${header}\n${entry}`);
}

export function markDone(content, text) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^- \\[ \\] (${escaped}.*)$`, 'm');
  if (!re.test(content)) return { content, found: false };
  return { content: content.replace(re, '- [x] $1'), found: true };
}

export function addToDone(content, text, date) {
  const entry = `- [x] ${text} — ${date}`;
  const header = '## Done';
  if (!content.includes(header)) {
    return content.trimEnd() + `\n\n${header}\n${entry}\n`;
  }
  return content.replace(header, `${header}\n${entry}`);
}

export function addNote(content, text, date) {
  const header = `## ${date}`;
  const entry = `- ${text}`;
  if (content.includes(header)) {
    return content.replace(header, `${header}\n${entry}`);
  }
  return content.trimEnd() + `\n\n${header}\n${entry}\n`;
}

export function initTodo(projectName) {
  return `# TODO — ${projectName}\n\n## Current\n\n## Backlog\n\n## Done\n`;
}

export function initNotes(projectName) {
  return `# Notes — ${projectName}\n`;
}

export function moveTask(content, text, fromSection, toSection) {
  const lines = content.split('\n');
  let inSection = false;
  let removed = false;
  const newLines = [];

  for (const line of lines) {
    const h = line.match(/^## (Current|Backlog|Done)/i);
    if (h) inSection = h[1].toLowerCase() === fromSection;
    if (inSection && !removed) {
      const task = line.match(/^- \[[ x]\] (.+)/);
      if (task && task[1].replace(/ — \d{4}-\d{2}-\d{2}$/, '') === text) {
        removed = true;
        continue;
      }
    }
    newLines.push(line);
  }

  if (!removed) return { content, found: false };
  return { content: addTask(newLines.join('\n'), text, toSection), found: true };
}
