import chokidar from 'chokidar';
import { loadConfig } from './config.js';

// Watches all registered roots for TODO.md creation/deletion/change.
// Calls onChange() whenever the project list or task content may have changed.

export function watchRoots(onChange) {
  const { roots } = loadConfig();
  if (!roots.length) return null;

  const watcher = chokidar.watch(
    roots.map(r => `${r}/**/TODO.md`),
    {
      ignoreInitial: true,
      ignored: /(^|[/\\])\..|(node_modules)/,
      depth: 3,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    }
  );

  watcher.on('add',    () => onChange('add'));
  watcher.on('change', () => onChange('change'));
  watcher.on('unlink', () => onChange('unlink'));

  return watcher;
}
