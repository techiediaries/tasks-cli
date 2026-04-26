// Compatibility shim — all logic moved to config.js + discover.js
export { loadConfig, saveConfig, addRoot, pin, unpin } from './config.js';
export { findProjects as allProjects, todoPath, notesPath, readFile, writeFile } from './discover.js';
