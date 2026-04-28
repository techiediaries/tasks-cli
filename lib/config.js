import fs from 'fs';
import os from 'os';
import path from 'path';
import { getConfigDir, getDefaultRoots } from './platform/index.js';

const CONFIG_FILE = path.join(getConfigDir(), 'config.json');

function defaults() {
  return {
    roots: getDefaultRoots(),
    pinned: [],
    initialized: false,
    globalFile: path.join(os.homedir(), 'TODO.md'),
  };
}

export function loadConfig() {
  try {
    return { ...defaults(), ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return defaults();
  }
}

export function saveConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}

export function addRoot(dir) {
  const config = loadConfig();
  const abs = path.resolve(dir);
  if (!config.roots.includes(abs)) {
    config.roots.push(abs);
    saveConfig(config);
  }
}

export function pin(name) {
  const config = loadConfig();
  if (!config.pinned.includes(name)) {
    config.pinned.push(name);
    saveConfig(config);
  }
}

export function unpin(name) {
  const config = loadConfig();
  config.pinned = config.pinned.filter(p => p !== name);
  saveConfig(config);
}
