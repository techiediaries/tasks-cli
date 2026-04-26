// Windows platform support — stub for future implementation.
// When ready: map CSIDL/KnownFolderID paths (Documents, Desktop, etc.)
// and use %APPDATA% for config directory.

import os from 'os';
import path from 'path';

export function getDefaultRoots() {
  // TODO: use SHGetKnownFolderPath or USERPROFILE env
  return [];
}

export function getConfigDir() {
  return path.join(process.env.APPDATA ?? os.homedir(), 'tasks');
}

export const FOLDER_ICONS = {};
