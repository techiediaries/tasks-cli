## Problem
Without a persistent hotkey, capturing a task requires opening a terminal, navigating to a project,
and running `tasks add`. That friction means tasks get lost. The goal: press one key from anywhere
on the desktop and type the thought before it disappears.

## Approaches considered

**evdev (read /dev/input directly):**
Lets you detect any key including lone modifier keys (Left Ctrl alone). Requires the user to be in
the `input` group (`sudo usermod -aG input $USER`). Rejected for the initial implementation because
it adds a permission setup step and we get the same result with xbindkeys + Ctrl+Space.

**xdotool / xdg-open / D-Bus:**
These send events, not receive them. Not applicable.

**Desktop environment shortcut (GNOME/KDE settings):**
Works but ties the tool to a specific DE. Users who switch DEs lose the hotkey. Rejected.

**xbindkeys:**
Standard Linux tool for mapping key combos to shell commands. Works across DEs. No root needed.
Cannot bind lone modifier keys (e.g. Left Ctrl alone) because X11 key grabs don't fire for modifier
releases without a non-modifier key. Ctrl+Space chosen: unused by terminals, IDEs, and browsers by
default, and identical to many note-taking apps (Notion, Obsidian).

Chosen: xbindkeys + Ctrl+Space.

## What was built

- `lib/daemon.js` — PID management, terminal emulator detection, writes xbindkeys config, spawns
  and supervises the xbindkeys process (restarts on crash)
- `lib/capture.js` — minimal blessed TUI: single input, three modes (task/backlog/raw) cycled with
  Tab, saves on Enter, exits on Esc. Targets the pinned project or falls back to inbox.md
- `lib/service.js` — writes `~/.config/systemd/user/tasks-daemon.service`, enables and starts it,
  imports DISPLAY/XAUTHORITY so X11 key grabs work from systemd context
- `bin/tasks.js` — dispatch refactored from sync switch to async main(); three new commands:
  `capture`, `daemon [stop|status|--hotkey]`, `service [install|uninstall|status]`

## Mistakes and corrections

The original dispatch was a synchronous switch statement at module top level. Dynamic imports
(`await import(...)`) cannot be used there. Fixed by wrapping dispatch in `async function main()`.

systemd user services don't inherit the user's `$DISPLAY` automatically. Without it, xbindkeys
can't connect to the X server and exits immediately. Fixed with `PassEnvironment=DISPLAY XAUTHORITY`
in the unit file and `systemctl --user import-environment` called at install time.

## Reader prerequisites
- What a systemd user service is and how it differs from a system service
- How X11 key grabs work (briefly: a process asks the X server to forward a specific key combo)
- Node.js ES module dynamic import and why top-level await in a switch doesn't work
