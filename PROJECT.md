# ClawTask Project Architecture

## Overview

macOS Desktop Project Dashboard - A Tauri-based desktop app for managing Markdown task boards with GitHub-style heatmap visualization.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | TypeScript + Vite + TailwindCSS |
| Backend | Rust + Tauri 2.x |
| IPC | Tauri Commands |
| File Watcher | notify crate (macOS kqueue) |

## Directory Structure

```
clawtask/
├── src/
│   ├── index.html       # Main UI with Tailwind + Material Icons
│   └── index.ts         # Frontend logic (views, drag-drop, search)
├── src-tauri/
│   ├── src/main.rs      # Rust backend (commands, cache, file watcher)
│   ├── Cargo.toml       # Rust dependencies
│   └── tauri.toml       # Tauri config (window, permissions)
├── package.json         # Node dependencies
└── tsconfig.json
```

## Key Components

### Frontend (`src/index.ts`)

- **Views**: board, heatmap, projects, insights, settings
- **Drag & Drop**: Native HTML5 drag-drop for task movement
- **Search**: Debounced real-time search
- **State**: tasks[], currentView, searchQuery

### Settings Page

Integrated into the app as a dedicated view (not a modal):

| Section | Options |
|---------|---------|
| General | Auto Refresh, Compact Mode |
| Appearance | Theme (Light/Dark/Auto), Accent Color |
| Data | Refresh Tasks, Export/Import JSON |
| Debug | Task counts, Tauri status |

### Backend (`src-tauri/src/main.rs`)

| Command | Purpose |
|---------|---------|
| `read_board_tasks()` | Read all tasks from Markdown files + cache |
| `update_task_status()` | Move task between TODO/IN PROGRESS/DONE |
| `create_task()` | Create new task .md file |
| `search_tasks()` | Full-text search across all tasks |
| `list_projects()` | Read projects.md |
| `get_heatmap_data()` | Generate activity heatmap data |

### Caching Strategy

- **Cache**: `lazy_static::Mutex<Option<TaskCache>>`
- **Key**: Board directory mtime (modification time)
- **Invalidation**: On write operations (create/update task)

**Cache Flow:**
```
read_board_tasks() → Check mtime → Cache hit? → Return cached
                                      ↓ No
                            Read from disk → Update cache → Return
```

### File Watcher

- Uses `notify` crate with macOS kqueue
- Listens for create/modify/remove events
- Emits `task-file-changed` event to frontend

## Data Flow

```
User Action → Frontend → Tauri Command → Rust → File System
               ↓                              ↓
          Update UI ← Cache Check ← Return JSON
```

## Board Data Source

Reads from: `/Users/hankli/clawd/project-board/board/`
- `TODO/*.md` - Pending tasks
- `IN PROGRESS/*.md` - Active tasks
- `DONE/*.md` - Completed tasks

## Dependencies

### Rust (`src-tauri/Cargo.toml`)
- `tauri = "2.0"` with devtools
- `notify = "6"` with macos_kqueue
- `chrono` for timestamps
- `lazy_static = "1.4"` for global cache

### Node (`package.json`)
- `@tauri-apps/api` & `cli` v2.0
- `vite` v5
- `typescript` v5

## Commands Reference

```bash
cd clawtask
npm run dev      # Start Vite dev server (http://localhost:5174)
npm run build    # Build for production
npm run tauri build  # Build .app bundle
```

## Task File Format

```markdown
# Task Title

**优先级**: 高 | 中 | 低
**创建日期**: 2026-02-04
**状态**: TODO | IN PROGRESS | DONE

## 描述

Task description...

## 子任务

- [ ] Subtask 1
- [x] Subtask 2
```

## Related Projects

- **Project Board**: `/Users/hankli/clawd/project-board/` - Source of task data
- **Clawdbot**: AI assistant workspace
- **Second Brain**: Content management system
