# Tasks — Plain Text Task Management for Developers

A per-project task manager with a root-level rollup, a beautiful TUI, and live file watching. Zero database. Zero sync service. Just Markdown files that live next to your code.

---

## Philosophy

Most task managers are apps that own your data. This one isn't.

Every project gets a `TODO.md` in its root directory. Plain Markdown. Readable by any editor, any AI, any human. Tracked by git alongside the code it describes. When a project is done, its task history is in the repo — not locked in an external service.

The CLI and TUI are conveniences on top of that convention. If the tool disappears tomorrow, your `TODO.md` files are still there.

**Why this matters for AI-assisted development:** AI tools can read and reason about plain Markdown files in any session. A `TODO.md` next to your code means any AI entering the project sees the current task state without being told. The task list is part of the project, not a separate system.

---

## Install

```bash
git clone https://github.com/techiediaries/tasks-cli
cd tasks-cli
npm install
ln -sf "$(pwd)/bin/tasks.js" ~/.local/bin/tasks
# make sure ~/.local/bin is in your PATH
```

---

## Quick Start

```bash
# Inside any project directory
tasks init                    # creates TODO.md, registers the parent as a watched root

tasks add "Fix login bug"     # add a task
tasks backlog "Refactor auth" # add to backlog
tasks done "Fix login bug"    # mark done
tasks note "Auth uses JWT"    # add to NOTES.md

tasks                         # rollup — all projects with open tasks
tasks ui                      # launch the TUI
```

---

## How It Works

### Auto-discovery

The tool watches **root directories** — parent directories that contain your projects. When you run `tasks init` inside a project, it:

1. Creates `TODO.md` in that directory
2. Registers the parent directory as a root (if not already)

From then on, the rollup and TUI automatically include any directory under those roots that has a `TODO.md`. No manual registration per project.

### Default roots (Linux)

On first run, the tool checks for common developer directories and registers any that exist:

- `~/Documents`
- `~/Desktop`
- `~/Projects`
- `~/dev`, `~/code`, `~/workspace`, `~/src`
- `~/work`, `~/antigravityapps`

### Live watching

`tasks ui` launches a full-screen TUI that watches all registered roots via `chokidar`. When a `TODO.md` is created, modified, or deleted anywhere in a watched root — by you, another terminal, or an AI tool — the TUI updates immediately.

### File format

```markdown
# TODO — ProjectName

## Current
- [ ] active task

## Backlog
- [ ] future task

## Done
- [x] completed task — 2026-04-26
```

```markdown
# Notes — ProjectName

## 2026-04-26
- note text
```

---

## Commands

```
tasks                          rollup of all projects with open tasks
tasks ui                       launch interactive TUI
tasks init [dir]               create TODO.md here (or in [dir])
tasks ls [project]             list tasks for one project or all
tasks add "text" [-p project]  add to current tasks
tasks backlog "text"           add to backlog
tasks done "text"              mark a task done
tasks note "text"              add a note
tasks pin [project]            pin to top of TUI sidebar
tasks unpin [project]          unpin
tasks root [add] [dir]         manage watched root directories
```

---

## TUI Key Bindings

| Key | Action |
|-----|--------|
| `↑` / `↓` or `j` / `k` | Navigate projects |
| `a` | Add task to current project |
| `b` | Add to backlog |
| `d` | Mark a task done (pick from list) |
| `n` | Add a note |
| `p` | Pin / unpin current project |
| `r` | Refresh |
| `q` | Quit |

---

## Platform Support

| Platform | Status |
|----------|--------|
| Linux | ✅ Full support |
| macOS | ✅ Should work (untested) |
| Windows | 🔜 Planned — platform abstraction is in place, standard folder detection not yet implemented |

The codebase uses a platform abstraction layer (`lib/platform/`) that makes adding Windows support straightforward — implement `getDefaultRoots()` and `getConfigDir()` in `lib/platform/windows.js`.

---

## Config

Stored at `~/.config/tasks/config.json`:

```json
{
  "roots": ["/home/user/Projects", "/home/user/dev"],
  "pinned": ["myproject"]
}
```

---

## License

MIT
