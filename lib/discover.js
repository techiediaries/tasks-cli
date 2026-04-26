import fs from 'fs';
import path from 'path';
import { loadConfig } from './config.js';

// A project is any directory (max 2 levels deep) that contains a TODO.md.
// Pinned projects always appear first.

export function findProjects() {
  const { roots, pinned } = loadConfig();
  const seen = new Set();
  const projects = [];

  function scan(dir, depth) {
    if (!fs.existsSync(dir)) return;
    const todoFile = path.join(dir, 'TODO.md');
    if (fs.existsSync(todoFile)) {
      const name = path.basename(dir);
      if (!seen.has(dir)) {
        seen.add(dir);
        projects.push({ name, dir, pinned: pinned.includes(name) });
      }
      return; // don't descend into a project
    }
    if (depth <= 0) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        if (entry.name === 'node_modules') continue;
        scan(path.join(dir, entry.name), depth - 1);
      }
    } catch { /* skip unreadable dirs */ }
  }

  for (const root of roots) scan(root, 2);

  // pinned first, then alphabetical
  return [
    ...projects.filter(p => p.pinned),
    ...projects.filter(p => !p.pinned).sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

export function todoPath(dir)  { return path.join(dir, 'TODO.md'); }
export function notesPath(dir) { return path.join(dir, 'NOTES.md'); }

export function readFile(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

export function writeFile(p, content) {
  fs.writeFileSync(p, content, 'utf8');
}
