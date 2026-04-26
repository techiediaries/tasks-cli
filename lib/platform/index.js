import { platform } from 'os';

const mod = platform() === 'win32'
  ? await import('./windows.js')
  : await import('./linux.js');

export const getDefaultRoots = mod.getDefaultRoots;
export const getConfigDir    = mod.getConfigDir;
export const FOLDER_ICONS    = mod.FOLDER_ICONS ?? {};
