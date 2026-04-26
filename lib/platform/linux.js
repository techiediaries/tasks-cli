import os from 'os';
import path from 'path';
import fs from 'fs';

const HOME = os.homedir();

// XDG standard dirs + common developer dirs — only include if they exist
const CANDIDATE_ROOTS = [
  'Documents', 'Desktop', 'Projects', 'dev', 'code',
  'workspace', 'src', 'work', 'antigravityapps',
];

export function getDefaultRoots() {
  return CANDIDATE_ROOTS
    .map(d => path.join(HOME, d))
    .filter(d => fs.existsSync(d));
}

export function getConfigDir() {
  return path.join(HOME, '.config', 'tasks');
}

// XDG display names for UI (Documents → 📄 Documents)
export const FOLDER_ICONS = {
  Documents: '📄', Desktop: '🖥️', Projects: '📁',
  dev: '⚡', code: '⚡', workspace: '📁', src: '📁',
  work: '💼', antigravityapps: '🚀',
};
