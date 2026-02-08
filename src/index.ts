// ClawTask - Task Board Viewer
import './index.css';

import { invoke } from '@tauri-apps/api/core';

interface Task {
  id: string;
  title: string;
  description: string;
  priority: '高' | '中' | '低';
  created_date: string;
  updated_date: string;
  status: 'TODO' | 'IN PROGRESS' | 'DONE';
  project_id?: string;
  order?: number;
}

// State
let tasks: Task[] = [];
let filteredTasks: Task[] = [];
let currentView: 'board' | 'heatmap' | 'projects' | 'insights' | 'settings' = 'board';
let searchQuery: string = '';

// Settings
let settings = {
  autoRefresh: true,
  compactMode: false,
  theme: 'light' as 'light' | 'dark' | 'auto',
  accentColor: '#6B705C'
};

// Load settings from localStorage
function loadSettings() {
  try {
    const saved = localStorage.getItem('clawtask-settings');
    if (saved) {
      settings = { ...settings, ...JSON.parse(saved) };
    }
    applyTheme();
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

// Save settings to localStorage
function saveSettings() {
  try {
    localStorage.setItem('clawtask-settings', JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

// Apply theme
function applyTheme() {
  const root = document.documentElement;
  if (settings.theme === 'dark') {
    root.classList.add('dark');
  } else if (settings.theme === 'auto') {
    // Check system preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  } else {
    root.classList.remove('dark');
  }

  // Apply accent color
  root.style.setProperty('--color-accent', settings.accentColor);
}

// Toggle functions
function toggleAutoRefresh() {
  settings.autoRefresh = !settings.autoRefresh;
  saveSettings();
  renderSettingsView();
}

function toggleCompactMode() {
  settings.compactMode = !settings.compactMode;
  saveSettings();
  renderSettingsView();
}

function setTheme(theme: 'light' | 'dark' | 'auto') {
  settings.theme = theme;
  saveSettings();
  applyTheme();
  renderSettingsView();
  updateNavigation();
}

function setAccentColor(color: string) {
  settings.accentColor = color;
  saveSettings();
  applyTheme();
  renderSettingsView();
}

// View switcher function (declared early for reference)
let switchView: (view: 'board' | 'heatmap' | 'projects' | 'insights' | 'settings') => Promise<void>;

// DOM Elements
const mainContent = document.querySelector('main') as HTMLElement;

// Check if running in Tauri - use __TAURI_IPC__ or getProcess().env
const isTauri = typeof window !== 'undefined' && (
  !!(window as any).__TAURI_IPC__ ||
  !!(window as any).__TAURI__
);

// Initialize
async function init() {
  loadSettings();
  await loadTasks();
  renderBoard();
  updateNavigation();
  setupFileListener();
  setupGlobalDragDrop();
}

// Global drag-drop handler for stable drop detection
function setupGlobalDragDrop() {
  console.log('[Drag] setupGlobalDragDrop called');
  const columns = document.querySelectorAll('[data-column-status]');
  console.log('[Drag] Found columns:', columns.length);
  
  columns.forEach((column) => {
    const status = column.getAttribute('data-column-status')! as 'TODO' | 'IN PROGRESS' | 'DONE';
    console.log('[Drag] Registering events for column:', status);
    
    column.addEventListener('dragover', ((e: DragEvent) => {
      console.log('[Drag] Global capture dragover on:', status, 'at', e.clientX, e.clientY);
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      console.log('[Drag] Global capture dragover, status:', status);
    }) as EventListener, true);
    
    column.addEventListener('drop', ((e: DragEvent) => {
      console.log('[Drag] Global capture DROP triggered on:', status, 'at', e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
      
      console.log('[Drag] draggedTaskId:', draggedTaskId);
      
      if (!draggedTaskId) return;
      
      const task = tasks.find(t => t.id === draggedTaskId);
      if (!task) {
        console.log('[Drag] Task not found in global drop');
        return;
      }
      
      if (task.status !== status) {
        task.status = status;
        
        if (isTauri) {
          invoke<boolean>('update_task_status', { taskId: task.id, newStatus: status })
            .then((result) => {
              console.log('[Drag] Rust result:', result);
              if (result) {
                reloadTasks();
              }
            })
            .catch(err => {
              console.error('[Drag] Update failed:', err);
              renderBoard();
            });
        }
      } else {
        renderBoard();
      }
      
      draggedTaskId = null;
    }) as EventListener, true);
  });
}

// Setup file change listener
function setupFileListener() {
  if (isTauri && (window as any).__TAURI__?.event) {
    try {
      (window as any).__TAURI__.event.listen('task-file-changed', async () => {
        console.log('[FileWatcher] File changed, reloading tasks...');
        await loadTasks();
        if (currentView === 'board') {
          renderBoard();
        }
      }).then(() => {
        console.log('[FileWatcher] Event listener active');
      }).catch((e: unknown) => {
        console.warn('[FileWatcher] Permission denied:', e);
      });
    } catch (e) {
      console.warn('[FileWatcher] Listener setup failed:', e);
    }
  }
}

// Load tasks from project-board
async function loadTasks() {
  try {
    console.log('[init] isTauri:', isTauri);
    if (isTauri) {
      console.log('[init] Running in Tauri, loading tasks...');
      const tasksJson = await invoke<string>('read_board_tasks');
      tasks = JSON.parse(tasksJson);
      console.log('[init] Loaded tasks from Rust:', tasks.length, 'tasks');
    } else {
      // Browser mode fallback - use sample data
      console.log('[init] Browser mode - using sample data');
      tasks = [
        { id: '1', title: '测试任务 1', description: '测试描述', priority: '中', created_date: '2026-02-04', updated_date: '2026-02-04', status: 'TODO' },
        { id: '2', title: '测试任务 2', description: '另一个测试', priority: '高', created_date: '2026-02-03', updated_date: '2026-02-03', status: 'IN PROGRESS' },
        { id: '3', title: '测试任务 3', description: '已完成', priority: '低', created_date: '2026-02-02', updated_date: '2026-02-02', status: 'DONE' },
      ];
    }

    filteredTasks = [...tasks];
    if (tasks.length === 0) {
      console.log('[init] No tasks found');
    }
  } catch (error) {
    console.error('[init] Failed to load tasks:', error);
  }
}

// Render Kanban Board
function renderBoard() {
  const displayTasks = searchQuery ? filteredTasks : tasks;
  const todoTasks = displayTasks.filter(t => t.status === 'TODO');
  const progressTasks = displayTasks.filter(t => t.status === 'IN PROGRESS');
  const doneTasks = displayTasks.filter(t => t.status === 'DONE');

  mainContent.innerHTML = `
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-hygge-earth">Tasks</h1>
        <p class="text-hygge-moss-60 mt-1">${displayTasks.length} tasks - ${doneTasks.length} completed</p>
      </div>

      <!-- Search Box -->
      <div class="relative flex items-center gap-3">
        <div class="relative">
          <input
            type="text"
            id="searchInput"
            placeholder="搜索任务..."
            value="${searchQuery}"
            oninput="handleSearch(this.value)"
            class="search-input w-64 px-4 py-2 pl-10 bg-white-50 border border-hygge-brown-20 rounded-xl text-hygge-earth placeholder-hygge-moss/40 focus:outline-none focus:border-hygge-moss/50 transition-all"
          />
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-hygge-moss-50">search</span>
          ${searchQuery ? `<button onclick="clearSearch()" class="absolute right-3 top-1/2 -translate-y-1/2 text-hygge-moss-50 hover:text-hygge-moss">
            <span class="material-symbols-outlined text-sm">close</span>
          </button>` : ''}
        </div>
        <button onclick="showNewTaskModal()" class="px-4 py-2 bg-accent text-white rounded-xl hover:opacity-90 flex items-center gap-2 transition-colors">
          <span class="material-symbols-outlined">add</span>
          New Task
        </button>
      </div>

      <div class="flex gap-3">
        <button onclick="switchView('board')" class="px-4 py-2 rounded-xl ${currentView === 'board' ? 'bg-accent text-white' : 'bg-white-50 text-accent'} flex items-center gap-2">
          <span class="material-symbols-outlined">view_kanban</span>
          Tasks
        </button>
        <button onclick="switchView('heatmap')" class="px-4 py-2 rounded-xl ${currentView === 'heatmap' ? 'bg-accent text-white' : 'bg-white-50 text-accent'} flex items-center gap-2">
          <span class="material-symbols-outlined">calendar_view_month</span>
          Heatmap
        </button>
      </div>
    </div>

    <!-- Kanban Columns -->
    <div class="grid grid-cols-3 gap-6">
      <!-- TODO -->
      <div class="bg-white-40 rounded-3xl p-6 transition-colors"
           data-column-status="TODO"
           ondrop="handleCardDrop(event, 'TODO')"
           ondragover="handleDragOver(event)"
           ondragenter="handleDragEnter(event)"
           ondragleave="handleDragLeave(event)">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-3 h-3 rounded-full bg-status-todo"></div>
          <h2 class="font-semibold text-hygge-earth">TODO</h2>
          <span class="ml-auto bg-status-done-20 text-hygge-moss px-3 py-1 rounded-full text-sm">${todoTasks.length}</span>
        </div>
        <div class="space-y-4 min-h-[200px]"
             ondrop="handleCardDrop(event, 'TODO')"
             ondragover="handleDragOver(event)"
             ondragenter="handleDragEnter(event)"
             ondragleave="handleDragLeave(event)">
          ${todoTasks.map((task, i) => renderTaskCard({...task, order: i + 1})).join('')}
        </div>
      </div>

      <!-- IN PROGRESS -->
      <div class="bg-white-40 rounded-3xl p-6 transition-colors"
           data-column-status="IN PROGRESS"
           ondrop="handleCardDrop(event, 'IN PROGRESS')"
           ondragover="handleDragOver(event)"
           ondragenter="handleDragEnter(event)"
           ondragleave="handleDragLeave(event)">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-3 h-3 rounded-full bg-status-inprogress"></div>
          <h2 class="font-semibold text-hygge-earth">IN PROGRESS</h2>
          <span class="ml-auto bg-status-done-20 text-hygge-moss px-3 py-1 rounded-full text-sm">${progressTasks.length}</span>
        </div>
        <div class="space-y-4 min-h-[200px]"
             ondrop="handleCardDrop(event, 'IN PROGRESS')"
             ondragover="handleDragOver(event)"
             ondragenter="handleDragEnter(event)"
             ondragleave="handleDragLeave(event)">
          ${progressTasks.map((task, i) => renderTaskCard({...task, order: i + 1})).join('')}
        </div>
      </div>

      <!-- DONE -->
      <div class="bg-white-40 rounded-3xl p-6 transition-colors"
           data-column-status="DONE"
           ondrop="handleCardDrop(event, 'DONE')"
           ondragover="handleDragOver(event)"
           ondragenter="handleDragEnter(event)"
           ondragleave="handleDragLeave(event)">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-3 h-3 rounded-full bg-status-done"></div>
          <h2 class="font-semibold text-hygge-earth">DONE</h2>
          <span class="ml-auto bg-status-done-20 text-hygge-moss px-3 py-1 rounded-full text-sm">${doneTasks.length}</span>
        </div>
        <div class="space-y-4 min-h-[200px]"
             ondrop="handleCardDrop(event, 'DONE')"
             ondragover="handleDragOver(event)"
             ondragenter="handleDragEnter(event)"
             ondragleave="handleDragLeave(event)">
          ${doneTasks.map((task, i) => renderTaskCard({...task, order: i + 1})).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderTaskCard(task: Task): string {
  const priorityColors: Record<string, string> = {
    '高': 'text-red-500 bg-red-100',
    '中': 'text-yellow-600 bg-yellow-100',
    '低': 'text-green-500 bg-green-100'
  };

  return `
    <div class="bg-white rounded-2xl p-5 soft-shadow hover:shadow-lg transition-all task-card relative"
         data-task-id="${task.id}"
         data-status="${task.status}"
         ondragover="handleCardDragOver(event)"
         ondrop="handleCardDrop(event, '${task.status}')">
      <div class="drag-handle cursor-grab active:cursor-grabbing w-full h-full"
           draggable="true"
           ondragstart="handleDragStart(event, '${task.id}', '${task.status}')"
           ondragend="handleDragEnd(event)">
        <div class="flex items-start justify-between gap-2 mb-3">
          <div class="flex items-center gap-2">
            <span class="px-2 py-1 rounded-lg text-xs font-medium ${priorityColors[task.priority]}">${task.priority}</span>
            <span class="text-xs text-hygge-moss-60">${task.created_date}</span>
          </div>
          <div class="flex items-center gap-1">
            <button onclick="handleCardClick('${task.id}')" class="p-1 text-hygge-moss-40 hover:text-hygge-moss hover:bg-hygge-moss/10 rounded-lg transition-colors" title="Edit">
              <span class="material-symbols-outlined text-sm">edit</span>
            </button>
          </div>
        </div>
        <h3 class="font-semibold text-hygge-earth mb-2">${task.title}</h3>
        <p class="text-sm text-hygge-moss-70 line-clamp-2">${task.description}</p>
      </div>
    </div>
  `;
}

// Card click handler
function handleCardClick(taskId: string) {
  console.log('[Card] Clicked task:', taskId);
  showTaskDetail(taskId);
}

// Drag and Drop handlers
let draggedTaskId: string | null = null;

function handleDragStart(event: DragEvent, taskId: string, status: string) {
  console.log('[Drag] handleDragStart called, taskId:', taskId, 'x:', Math.round(event.clientX), 'y:', Math.round(event.clientY));
  draggedTaskId = taskId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', taskId);
  }
  // Visual feedback
  setTimeout(() => {
    const card = document.querySelector(`[data-task-id="${taskId}"]`);
    if (card) card.classList.add('opacity-50');
  }, 0);
}

function handleDragOver(event: DragEvent) {
  event.preventDefault();
  console.log('[Drag] handleDragOver, x:', Math.round(event.clientX), 'y:', Math.round(event.clientY));
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function handleDragEnter(event: DragEvent) {
  event.preventDefault();
  console.log('[Drag] handleDragEnter called');
  const column = (event.target as HTMLElement).closest('[ondrop]');
  if (column) column.classList.add('bg-status-done-10');
}

function handleDragLeave(event: DragEvent) {
  console.log('[Drag] handleDragLeave called');
  const column = (event.target as HTMLElement).closest('[ondrop]');
  if (column && !column.contains(event.relatedTarget as Node)) {
    column.classList.remove('bg-status-done-10');
  }
}

function handleDragEnd(event: DragEvent) {
  console.log('[Drag] handleDragEnd, x:', Math.round(event.clientX), 'y:', Math.round(event.clientY), 'dropEffect:', event.dataTransfer?.dropEffect);

  // 当 drop 没触发时，用坐标检测释放位置
  if (event.dataTransfer?.dropEffect === 'none' || event.dataTransfer?.dropEffect === 'copy') {
    console.log('[Drag] Drop NOT triggered - checking element under cursor');
    const elemBelow = document.elementFromPoint(event.clientX, event.clientY);
    console.log('[Drag] Element under cursor:', elemBelow?.tagName, elemBelow?.className);

    const column = elemBelow?.closest('[data-column-status]');
    const columnStatus = column?.getAttribute('data-column-status') as 'TODO' | 'IN PROGRESS' | 'DONE';

    if (columnStatus && draggedTaskId) {
      console.log('[Drag] Element IS inside column:', columnStatus);

      const task = tasks.find(t => t.id === draggedTaskId);
      if (task && task.status !== columnStatus) {
        console.log('[Drag] 更新任务:', task.title, '从', task.status, '→', columnStatus);
        task.status = columnStatus;

        if (isTauri) {
          invoke<boolean>('update_task_status', { taskId: task.id, newStatus: columnStatus })
            .then((result) => {
              console.log('[Drag] Rust 结果:', result);
              if (result) {
                reloadTasks();
              }
            })
            .catch(err => {
              console.error('[Drag] 错误:', err);
            });
        }
      }
    } else {
      console.log('[Drag] Element is NOT inside any valid column');
    }
  }

  event.preventDefault();
  draggedTaskId = null;
  document.querySelectorAll('[ondrop]')?.forEach((col: Element) => col.classList.remove('bg-status-done-10'));
  document.querySelectorAll('.task-card')?.forEach((card: Element) => card.classList.remove('opacity-50'));
}

// Handle dragover on a card (needed because ondragover doesn't bubble)
function handleCardDragOver(event: DragEvent) {
  event.preventDefault();
  console.log('[Drag] handleCardDragOver, x:', Math.round(event.clientX), 'y:', Math.round(event.clientY));
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

// Handle drop on a card (get its status)
function handleCardDrop(event: DragEvent, cardStatus: string) {
  console.log('[Drag] handleCardDrop, x:', Math.round(event.clientX), 'y:', Math.round(event.clientY), 'cardStatus:', cardStatus);
  event.preventDefault();
  event.stopPropagation();

  if (!draggedTaskId) {
    console.log('[Drag] No dragged task');
    return;
  }

  // Get the column status from the parent
  const column = (event.target as HTMLElement).closest('[data-column-status]');
  if (!column) {
    console.log('[Drag] No column found');
    return;
  }

  const targetStatus = column.getAttribute('data-column-status') as 'TODO' | 'IN PROGRESS' | 'DONE';
  console.log('[Drag] Target status from column:', targetStatus);

  if (!targetStatus) return;

  const task = tasks.find(t => t.id === draggedTaskId);
  if (!task) {
    console.log('[Drag] Task not found');
    return;
  }

  console.log('[Drag] Task:', task.title, 'from', task.status, 'to', targetStatus);

  if (task.status !== targetStatus) {
    task.status = targetStatus;

    if (isTauri) {
      invoke<boolean>('update_task_status', { taskId: task.id, newStatus: targetStatus })
        .then((result) => {
          console.log('[Drag] Rust result:', result);
          if (result) {
            reloadTasks();
          }
        })
        .catch(err => {
          console.error('[Drag] Update failed:', err);
          renderBoard();
        });
    }
  } else {
    renderBoard();
  }

  draggedTaskId = null;
}

function handleDrop(event: DragEvent, targetStatus: 'TODO' | 'IN PROGRESS' | 'DONE') {
  event.preventDefault();
  event.stopPropagation();
  console.log('[Drag] handleDrop, x:', Math.round(event.clientX), 'y:', Math.round(event.clientY), 'targetStatus:', targetStatus);

  if (!draggedTaskId) {
    console.log('[Drag] No dragged task, returning');
    return;
  }

  const task = tasks.find(t => t.id === draggedTaskId);
  if (!task) {
    console.log('[Drag] Task not found');
    return;
  }

  console.log('[Drag] Task found:', task.title, 'current status:', task.status);

  // Only update if status changed
  if (task.status !== targetStatus) {
    console.log('[Drag] Status changed, updating...');
    task.status = targetStatus;

    if (isTauri) {
      console.log('[Drag] Calling Rust update_task_status...');
      invoke<boolean>('update_task_status', { taskId: task.id, newStatus: targetStatus })
        .then((result) => {
          console.log('[Drag] Rust result:', result);
          if (result) {
            console.log('[Drag] Status updated, reloading...');
            reloadTasks();
          }
        })
        .catch(err => {
          console.error('[Drag] Update failed:', err);
          renderBoard();
        });
    }
  } else {
    console.log('[Drag] Status same, no update needed');
    renderBoard();
  }

  draggedTaskId = null;
}

interface HeatmapDay {
  date: string;
  count: number;
  level: number;
}

async function renderHeatmap(): Promise<string> {
  const heatmapColors = ['#E5E5E5', 'rgba(107, 112, 92, 0.3)', 'rgba(107, 112, 92, 0.5)', 'rgba(107, 112, 92, 0.7)', 'rgba(107, 112, 92, 0.9)'];

  let heatmapData: HeatmapDay[] = [];

  if (isTauri) {
    try {
      const heatmapJson = await invoke<string>('get_heatmap_data');
      heatmapData = JSON.parse(heatmapJson);
    } catch (e) {
      console.error('Failed to load heatmap data:', e);
      // Fallback to client-side data
      heatmapData = generateLocalHeatmapData();
    }
  } else {
    heatmapData = generateLocalHeatmapData();
  }

  return heatmapData.map(day => `
    <div class="w-3 h-3 rounded-sm cursor-pointer hover:ring-2 ring-hygge-moss transition-all"
         style="background-color: ${heatmapColors[day.level]}"
         title="${day.date}: ${day.count} task${day.count !== 1 ? 's' : ''}"></div>
  `).join('');
}

function generateLocalHeatmapData(): HeatmapDay[] {
  const today = new Date();
  const taskDates = new Set(tasks.map(t => t.created_date));
  const data: HeatmapDay[] = [];

  for (let i = 364; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = date.toISOString().split('T')[0].slice(0, 10);

    const hasTask = taskDates.has(dateStr);
    const count = hasTask ? 1 : 0;

    data.push({
      date: dateStr,
      count: count,
      level: count > 0 ? 1 : 0
    });
  }

  return data;
}

async function renderHeatmapView() {
  const todoTasks = tasks.filter(t => t.status === 'TODO');
  const progressTasks = tasks.filter(t => t.status === 'IN PROGRESS');
  const doneTasks = tasks.filter(t => t.status === 'DONE');

  const heatmapHtml = await renderHeatmap();

  mainContent.innerHTML = `
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-hygge-earth">Activity Heatmap</h1>
        <p class="text-hygge-moss-60 mt-1">Task activity over the past year</p>
      </div>
      <div class="flex gap-3">
        <button onclick="switchView('board')" class="px-4 py-2 rounded-xl ${currentView === 'board' ? 'bg-accent text-white' : 'bg-white-50 text-accent'} flex items-center gap-2">
          <span class="material-symbols-outlined">view_kanban</span>
          Tasks
        </button>
        <button onclick="switchView('heatmap')" class="px-4 py-2 rounded-xl ${currentView === 'heatmap' ? 'bg-accent text-white' : 'bg-white-50 text-accent'} flex items-center gap-2">
          <span class="material-symbols-outlined">calendar_view_month</span>
          Heatmap
        </button>
      </div>
    </div>

    <div class="bg-white-40 rounded-3xl p-8">
      <h2 class="font-semibold text-hygge-earth mb-6">Task Activity (Last Year)</h2>
      <div class="flex flex-wrap gap-1 mb-4">
        ${heatmapHtml}
      </div>
      <div class="flex items-center gap-4 text-sm text-hygge-moss-60">
        <span>Less</span>
        <div class="flex gap-1">
          <div class="w-3 h-3 rounded-sm bg-[#E5E5E5]"></div>
          <div class="w-3 h-3 rounded-sm" style="background-color: rgba(107,112,92,0.3)"></div>
          <div class="w-3 h-3 rounded-sm" style="background-color: rgba(107,112,92,0.5)"></div>
          <div class="w-3 h-3 rounded-sm" style="background-color: rgba(107,112,92,0.7)"></div>
          <div class="w-3 h-3 rounded-sm" style="background-color: rgba(107,112,92,0.9)"></div>
        </div>
        <span>More</span>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-6 mt-6">
      <div class="bg-white-40 rounded-3xl p-6 text-center">
        <div class="text-4xl font-bold text-hygge-earth">${todoTasks.length}</div>
        <div class="text-hygge-moss-60 mt-1">Pending</div>
      </div>
      <div class="bg-white-40 rounded-3xl p-6 text-center">
        <div class="text-4xl font-bold text-hygge-earth">${progressTasks.length}</div>
        <div class="text-hygge-moss-60 mt-1">In Progress</div>
      </div>
      <div class="bg-white-40 rounded-3xl p-6 text-center">
        <div class="text-4xl font-bold text-hygge-earth">${doneTasks.length}</div>
        <div class="text-hygge-moss-60 mt-1">Completed</div>
      </div>
    </div>
  `;
}

// Projects View
async function renderProjectsView() {
  const todoTasks = tasks.filter(t => t.status === 'TODO');
  const progressTasks = tasks.filter(t => t.status === 'IN PROGRESS');
  const doneTasks = tasks.filter(t => t.status === 'DONE');

  let projects: Array<{id: number; name: string; description?: string; color: string; progress: number; created_date: string}> = [];
  if (isTauri) {
    try {
      const projectsJson = await invoke<string>('list_projects');
      projects = JSON.parse(projectsJson);
      console.log('Loaded projects from DB:', projects.length);
    } catch (e) {
      console.error('Failed to load projects:', e);
    }
  }

  mainContent.innerHTML = `
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-hygge-earth">Projects</h1>
        <p class="text-hygge-moss-60 mt-1">${projects.length} projects in progress</p>
      </div>
      <button onclick="showNewTaskModal()" class="px-4 py-2 bg-accent text-white rounded-xl hover:opacity-90 flex items-center gap-2 transition-colors">
        <span class="material-symbols-outlined">add</span>
        New Project
      </button>
    </div>

    <div class="grid grid-cols-3 gap-6">
      ${projects.map(project => `
        <div class="bg-white rounded-3xl p-6 soft-shadow border border-hygge-brown-20 flex flex-col hover:shadow-lg transition-all cursor-pointer">
          <div class="flex justify-between items-start mb-6">
            <div class="size-12 rounded-xl" style="background-color: ${project.color}20; display: flex; align-items: center; justify-content: center;">
              <span class="material-symbols-outlined" style="color: ${project.color}">folder</span>
            </div>
            <span class="text-xs font-bold" style="color: ${project.color}; background-color: ${project.color}15; px-3 py-1 rounded-full">${project.progress}%</span>
          </div>
          <h4 class="text-lg font-bold text-hygge-earth mb-1">${project.name}</h4>
          <p class="text-sm text-hygge-moss-70 mb-6">${project.description}</p>
          <div class="mt-auto">
            <div class="w-full bg-hygge-beige h-2 rounded-full overflow-hidden">
              <div class="h-full rounded-full" style="width: ${project.progress}%; background-color: ${project.color}"></div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="grid grid-cols-3 gap-6 mt-8">
      <div class="bg-white-40 rounded-3xl p-6 text-center">
        <div class="text-4xl font-bold text-hygge-earth">${todoTasks.length}</div>
        <div class="text-hygge-moss-60 mt-1">Pending</div>
      </div>
      <div class="bg-white-40 rounded-3xl p-6 text-center">
        <div class="text-4xl font-bold text-hygge-earth">${progressTasks.length}</div>
        <div class="text-hygge-moss-60 mt-1">In Progress</div>
      </div>
      <div class="bg-white-40 rounded-3xl p-6 text-center">
        <div class="text-4xl font-bold text-hygge-earth">${doneTasks.length}</div>
        <div class="text-hygge-moss-60 mt-1">Completed</div>
      </div>
    </div>
  `;
}

// Insights View
function renderInsightsView() {
  const todoTasks = tasks.filter(t => t.status === 'TODO');
  const progressTasks = tasks.filter(t => t.status === 'IN PROGRESS');
  const doneTasks = tasks.filter(t => t.status === 'DONE');
  const total = tasks.length;
  const completionRate = total > 0 ? Math.round((doneTasks.length / total) * 100) : 0;

  // Priority stats
  const highPriority = tasks.filter(t => t.priority === '高').length;
  const mediumPriority = tasks.filter(t => t.priority === '中').length;
  const lowPriority = tasks.filter(t => t.priority === '低').length;

  // Calculate overdue (older than 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const overdueTasks = tasks.filter(t => {
    const created = new Date(t.created_date);
    return t.status !== 'DONE' && created < weekAgo;
  }).length;

  mainContent.innerHTML = `
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-hygge-earth">Insights</h1>
        <p class="text-hygge-moss-60 mt-1">Productivity analytics</p>
      </div>
      <button onclick="refreshView()" class="px-4 py-2 bg-white-50 rounded-xl hover:bg-white/80 flex items-center gap-2 transition-colors">
        <span class="material-symbols-outlined">refresh</span>
        Refresh
      </button>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-4 gap-6 mb-8">
      <div class="bg-white-40 rounded-3xl p-6">
        <div class="flex items-center gap-3 mb-3">
          <div class="size-12 rounded-xl bg-hygge-stone/20 flex items-center justify-center text-hygge-stone">
            <span class="material-symbols-outlined text-xl">task_alt</span>
          </div>
          <div>
            <p class="text-3xl font-bold text-hygge-earth leading-none">${total}</p>
            <p class="text-xs font-bold text-hygge-stone uppercase tracking-widest mt-1">Total Tasks</p>
          </div>
        </div>
      </div>

      <div class="bg-white-40 rounded-3xl p-6">
        <div class="flex items-center gap-3 mb-3">
          <div class="size-12 rounded-xl bg-[#6B705C]-20 flex items-center justify-center text-hygge-moss">
            <span class="material-symbols-outlined text-xl">check_circle</span>
          </div>
          <div>
            <p class="text-3xl font-bold text-hygge-earth leading-none">${completionRate}%</p>
            <p class="text-xs font-bold text-hygge-moss uppercase tracking-widest mt-1">Completed</p>
          </div>
        </div>
      </div>

      <div class="bg-white-40 rounded-3xl p-6">
        <div class="flex items-center gap-3 mb-3">
          <div class="size-12 rounded-xl bg-hygge-sage/20 flex items-center justify-center text-hygge-sage">
            <span class="material-symbols-outlined text-xl">speed</span>
          </div>
          <div>
            <p class="text-3xl font-bold text-hygge-earth leading-none">${progressTasks.length}</p>
            <p class="text-xs font-bold text-hygge-sage uppercase tracking-widest mt-1">In Progress</p>
          </div>
        </div>
      </div>

      <div class="bg-white-40 rounded-3xl p-6">
        <div class="flex items-center gap-3 mb-3">
          <div class="size-12 rounded-xl bg-red-100 flex items-center justify-center text-red-500">
            <span class="material-symbols-outlined text-xl">warning</span>
          </div>
          <div>
            <p class="text-3xl font-bold text-hygge-earth leading-none">${overdueTasks}</p>
            <p class="text-xs font-bold text-red-500 uppercase tracking-widest mt-1">Overdue</p>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-6 mb-8">
      <!-- Status Distribution -->
      <div class="bg-white-40 rounded-3xl p-8">
        <h3 class="font-bold text-hygge-earth mb-6 flex items-center gap-2">
          <span class="material-symbols-outlined">pie_chart</span>
          Status Distribution
        </h3>
        <div class="flex items-center justify-center mb-6">
          <div class="relative">
            <svg width="200" height="200" viewBox="0 0 200 200">
              ${total > 0 ? `
              <circle cx="100" cy="100" r="80" fill="none" stroke="#E5E5E5" stroke-width="20"/>
              <circle cx="100" cy="100" r="80" fill="none" stroke="#CB997E" stroke-width="20"
                stroke-dasharray="${251 * todoTasks.length / total} 251" stroke-dashoffset="0" transform="rotate(-90 100 100)"/>
              <circle cx="100" cy="100" r="80" fill="none" stroke="#DDBEA9" stroke-width="20"
                stroke-dasharray="${251 * progressTasks.length / total} 251" stroke-dashoffset="${-251 * todoTasks.length / total}" transform="rotate(-90 100 100)"/>
              <circle cx="100" cy="100" r="80" fill="none" stroke="#6B705C" stroke-width="20"
                stroke-dasharray="${251 * doneTasks.length / total} 251" stroke-dashoffset="${-251 * (todoTasks.length + progressTasks.length) / total}" transform="rotate(-90 100 100)"/>
              ` : `
              <circle cx="100" cy="100" r="80" fill="none" stroke="#E5E5E5" stroke-width="20"/>
              `}
            </svg>
            <div class="absolute inset-0 flex flex-col items-center justify-center">
              <p class="text-3xl font-bold text-hygge-earth">${total}</p>
              <p class="text-xs text-hygge-moss-60">Tasks</p>
            </div>
          </div>
        </div>
        <div class="flex justify-center gap-6">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-status-todo"></div>
            <span class="text-sm text-hygge-moss">TODO (${todoTasks.length})</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-status-inprogress"></div>
            <span class="text-sm text-hygge-moss">In Progress (${progressTasks.length})</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-status-done"></div>
            <span class="text-sm text-hygge-moss">Done (${doneTasks.length})</span>
          </div>
        </div>
      </div>

      <!-- Priority Distribution -->
      <div class="bg-white-40 rounded-3xl p-8">
        <h3 class="font-bold text-hygge-earth mb-6 flex items-center gap-2">
          <span class="material-symbols-outlined">priority_high</span>
          Priority Distribution
        </h3>
        <div class="space-y-4">
          <div class="flex items-center gap-4">
            <div class="w-12 text-sm font-medium text-hygge-earth">High</div>
            <div class="flex-1 h-6 bg-white-50 rounded-full overflow-hidden">
              <div class="h-full bg-red-400 rounded-full transition-all" style="width: ${total > 0 ? (highPriority / total * 100) : 0}%"></div>
            </div>
            <div class="w-12 text-right text-sm text-hygge-moss">${highPriority}</div>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-12 text-sm font-medium text-hygge-earth">Medium</div>
            <div class="flex-1 h-6 bg-white-50 rounded-full overflow-hidden">
              <div class="h-full bg-yellow-400 rounded-full transition-all" style="width: ${total > 0 ? (mediumPriority / total * 100) : 0}%"></div>
            </div>
            <div class="w-12 text-right text-sm text-hygge-moss">${mediumPriority}</div>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-12 text-sm font-medium text-hygge-earth">Low</div>
            <div class="flex-1 h-6 bg-white-50 rounded-full overflow-hidden">
              <div class="h-full bg-green-400 rounded-full transition-all" style="width: ${total > 0 ? (lowPriority / total * 100) : 0}%"></div>
            </div>
            <div class="w-12 text-right text-sm text-hygge-moss">${lowPriority}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Activity Summary -->
    <div class="bg-white-40 rounded-3xl p-8">
      <h3 class="font-bold text-hygge-earth mb-6 flex items-center gap-2">
        <span class="material-symbols-outlined">trending_up</span>
        Activity Summary
      </h3>
      <div class="grid grid-cols-3 gap-6">
        <div class="text-center p-4 bg-white/30 rounded-2xl">
          <p class="text-4xl font-bold text-hygge-earth">${tasks.filter(t => {
            const today = new Date().toISOString().split('T')[0];
            return t.created_date === today;
          }).length}</p>
          <p class="text-sm text-hygge-moss-60 mt-1">Created Today</p>
        </div>
        <div class="text-center p-4 bg-white/30 rounded-2xl">
          <p class="text-4xl font-bold text-hygge-earth">${tasks.filter(t => {
            const lastWeek = new Date();
            lastWeek.setDate(lastWeek.getDate() - 7);
            return new Date(t.created_date) >= lastWeek;
          }).length}</p>
          <p class="text-sm text-hygge-moss-60 mt-1">This Week</p>
        </div>
        <div class="text-center p-4 bg-white/30 rounded-2xl">
          <p class="text-4xl font-bold text-hygge-earth">${progressTasks.length > 0 ? Math.round(progressTasks.length / total * 100) || 0 : 0}%</p>
          <p class="text-sm text-hygge-moss-60 mt-1">Progress Rate</p>
        </div>
      </div>
    </div>
  `;
}

// Settings View
function renderSettingsView() {
  const todoTasks = tasks.filter(t => t.status === 'TODO');
  const progressTasks = tasks.filter(t => t.status === 'IN PROGRESS');
  const doneTasks = tasks.filter(t => t.status === 'DONE');

  mainContent.innerHTML = `
    <div class="max-w-4xl">
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-hygge-earth">Settings</h1>
        <p class="text-hygge-moss-60 mt-1">Configure your workspace</p>
      </div>

      <!-- General -->
      <div class="mb-8">
        <h2 class="text-lg font-bold text-hygge-earth mb-4 flex items-center gap-2">
          <span class="material-symbols-outlined">tune</span>
          General
        </h2>
        <div class="bg-white/30 rounded-2xl divide-y divide-hygge-brown/10">
          <div class="flex items-center justify-between p-4">
            <div>
              <p class="font-medium text-hygge-earth">Auto Refresh</p>
              <p class="text-sm text-hygge-moss-60">Auto refresh when files change</p>
            </div>
            <button onclick="toggleAutoRefresh()" class="w-12 h-6 rounded-full ${settings.autoRefresh ? 'bg-accent' : 'bg-hygge-brown-30'} relative transition-colors">
              <span class="absolute ${settings.autoRefresh ? 'right-1' : 'left-1'} top-1 w-4 h-4 bg-white rounded-full transition-all"></span>
            </button>
          </div>
          <div class="flex items-center justify-between p-4">
            <div>
              <p class="font-medium text-hygge-earth">Compact Mode</p>
              <p class="text-sm text-hygge-moss-60">Show more tasks in less space</p>
            </div>
            <button onclick="toggleCompactMode()" class="w-12 h-6 rounded-full ${settings.compactMode ? 'bg-accent' : 'bg-hygge-brown-30'} relative transition-colors">
              <span class="absolute ${settings.compactMode ? 'right-1' : 'left-1'} top-1 w-4 h-4 bg-white rounded-full transition-all"></span>
            </button>
          </div>
        </div>
      </div>

      <!-- Data -->
      <div class="mb-8">
        <h2 class="text-lg font-bold text-hygge-earth mb-4 flex items-center gap-2">
          <span class="material-symbols-outlined">storage</span>
          Data
        </h2>
        <div class="bg-white/30 rounded-2xl divide-y divide-hygge-brown/10">
          <button onclick="reloadTasks()" class="w-full flex items-center gap-3 p-4 hover:bg-white-40 transition-colors text-left">
            <span class="material-symbols-outlined text-hygge-moss">refresh</span>
            <span class="font-medium text-hygge-earth">Refresh Tasks</span>
          </button>
          <button onclick="exportData()" class="w-full flex items-center gap-3 p-4 hover:bg-white-40 transition-colors text-left">
            <span class="material-symbols-outlined text-hygge-moss">download</span>
            <span class="font-medium text-hygge-earth">Export Data</span>
          </button>
          <button onclick="importData()" class="w-full flex items-center gap-3 p-4 hover:bg-white-40 transition-colors text-left">
            <span class="material-symbols-outlined text-hygge-moss">upload</span>
            <span class="font-medium text-hygge-earth">Import Data</span>
          </button>
          <button onclick="clearAllData()" class="w-full flex items-center gap-3 p-4 hover:bg-red-50 transition-colors text-left">
            <span class="material-symbols-outlined text-red-500">delete_sweep</span>
            <span class="font-medium text-red-500">Clear All Data</span>
          </button>
        </div>
      </div>

      <!-- Database -->
      <div class="mb-8">
        <h2 class="text-lg font-bold text-hygge-earth mb-4 flex items-center gap-2">
          <span class="material-symbols-outlined">database</span>
          Database
        </h2>
        <div class="bg-white/30 rounded-2xl divide-y divide-hygge-brown/10">
          <div class="p-4 flex items-center justify-between">
            <span class="font-medium text-hygge-earth">Path</span>
            <div class="flex items-center gap-2">
              <span class="text-sm text-hygge-moss-70 font-mono">./data.db</span>
              <button onclick="copyDbPath()" class="p-1.5 text-hygge-moss hover:bg-white-50 rounded-lg transition-colors">
                <span class="material-symbols-outlined text-sm">content_copy</span>
              </button>
            </div>
          </div>
          <div class="p-4 grid grid-cols-3 gap-4">
            <div class="text-center">
              <p class="text-2xl font-bold text-hygge-earth">${tasks.length}</p>
              <p class="text-xs text-hygge-moss-60">Tasks</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-bold text-hygge-earth">${doneTasks.length}</p>
              <p class="text-xs text-hygge-moss-60">Done</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-bold text-hygge-earth">${progressTasks.length}</p>
              <p class="text-xs text-hygge-moss-60">In Progress</p>
            </div>
          </div>
          <button onclick="backupDatabase()" class="w-full flex items-center gap-3 p-4 hover:bg-white-40 transition-colors text-left">
            <span class="material-symbols-outlined text-hygge-moss">backup</span>
            <span class="font-medium text-hygge-earth">Backup Database</span>
          </button>
        </div>
      </div>

      <!-- About -->
      <div class="mb-8">
        <h2 class="text-lg font-bold text-hygge-earth mb-4 flex items-center gap-2">
          <span class="material-symbols-outlined">info</span>
          About
        </h2>
        <div class="bg-white/30 rounded-2xl p-6 flex items-center gap-4">
          <div class="size-14 rounded-2xl bg-[#6B705C] flex items-center justify-center text-white">
            <span class="material-symbols-outlined text-3xl">dashboard</span>
          </div>
          <div class="flex-1">
            <h3 class="text-xl font-bold text-hygge-earth">ClawTask</h3>
            <p class="text-sm text-hygge-moss-60">Version 0.1.0</p>
          </div>
          <button onclick="openDevTools()" class="px-4 py-2 bg-hygge-moss-20 text-hygge-earth rounded-xl hover-bg-hygge-moss-80 flex items-center gap-2 transition-colors">
            <span class="material-symbols-outlined">bug_report</span>
            Debug
          </button>
        </div>
      </div>
    </div>
  `;
}

// Update navigation active state
function updateNavigation() {
  document.querySelectorAll('.nav-item').forEach((el) => {
    const view = el.getAttribute('data-view');
    if (view === currentView) {
      el.classList.add('nav-active');
      el.classList.remove('nav-inactive');
    } else {
      el.classList.remove('nav-active');
      el.classList.add('nav-inactive');
    }
  });
}

// View switching
switchView = (async (view: 'board' | 'heatmap' | 'projects' | 'insights' | 'settings') => {
  // Clear search when leaving board view
  if (currentView === 'board') {
    searchQuery = '';
    filteredTasks = [...tasks];
  }

  currentView = view;
  updateNavigation();

  switch (view) {
    case 'board':
      renderBoard();
      break;
    case 'heatmap':
      await renderHeatmapView();
      break;
    case 'projects':
      await renderProjectsView();
      break;
    case 'insights':
      renderInsightsView();
      break;
    case 'settings':
      renderSettingsView();
      break;
  }
}) as any;

// Clear search
function clearSearch() {
  searchQuery = '';
  filteredTasks = [...tasks];
  if (currentView === 'board') {
    renderBoard();
    setTimeout(() => {
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
      }
    }, 0);
  }
}

// Task detail modal - Edit mode
function showTaskDetail(taskId: string) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  modal.innerHTML = `
    <div class="bg-white rounded-3xl p-8 max-w-lg w-full soft-shadow">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-hygge-earth">Edit Task</h2>
        <button onclick="this.closest('.fixed').remove()" class="text-hygge-moss-60 hover:text-hygge-moss">
          <span class="material-symbols-outlined text-2xl">close</span>
        </button>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-hygge-earth mb-2">Title</label>
          <input type="text" id="editTaskTitle" value="${task.title}"
            class="w-full px-4 py-3 bg-white-50 border border-hygge-brown-20 rounded-xl text-hygge-earth focus:outline-none focus:ring-2 focus:ring-hygge-moss/30 transition-all" />
        </div>

        <div>
          <label class="block text-sm font-medium text-hygge-earth mb-2">Description</label>
          <textarea id="editTaskDesc" rows="4"
            class="w-full px-4 py-3 bg-white-50 border border-hygge-brown-20 rounded-xl text-hygge-earth focus:outline-none focus:ring-2 focus:ring-hygge-moss/30 transition-all resize-none">${task.description}</textarea>
        </div>

        <div>
          <label class="block text-sm font-medium text-hygge-earth mb-2">Priority</label>
          <select id="editTaskPriority"
            class="w-full px-4 py-3 bg-white-50 border border-hygge-brown-20 rounded-xl text-hygge-earth focus:outline-none focus:ring-2 focus:ring-hygge-moss/30 transition-all">
            <option value="高" ${task.priority === '高' ? 'selected' : ''}>High (高)</option>
            <option value="中" ${task.priority === '中' ? 'selected' : ''}>Medium (中)</option>
            <option value="低" ${task.priority === '低' ? 'selected' : ''}>Low (低)</option>
          </select>
        </div>

        <div class="flex items-center gap-3 pt-4">
          <button onclick="saveTaskEdit('${task.id}')" class="flex-1 py-3 bg-accent text-white rounded-xl hover:opacity-90 font-medium transition-colors flex items-center justify-center gap-2">
            <span class="material-symbols-outlined">save</span>
            Save
          </button>
          <button onclick="deleteTask('${task.id}')" class="px-4 py-3 bg-red-100 text-red-500 rounded-xl hover:bg-red-200 font-medium transition-colors flex items-center justify-center gap-2">
            <span class="material-symbols-outlined">delete</span>
            Delete
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Focus title input
  setTimeout(() => {
    document.getElementById('editTaskTitle')?.focus();
  }, 100);
}

// Save task edit
function saveTaskEdit(taskId: string) {
  const titleInput = document.getElementById('editTaskTitle') as HTMLInputElement;
  const descInput = document.getElementById('editTaskDesc') as HTMLTextAreaElement;
  const prioritySelect = document.getElementById('editTaskPriority') as HTMLSelectElement;

  const title = titleInput?.value.trim();
  const description = descInput?.value.trim() || '';
  const priority = (prioritySelect?.value as '高' | '中' | '低') || '中';

  if (!title) {
    titleInput?.focus();
    return;
  }

  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  // Update local state
  task.title = title;
  task.description = description;
  task.priority = priority;
  task.updated_date = new Date().toISOString().split('T')[0];

  // Update in SQLite
  if (isTauri) {
    console.log('[saveTaskEdit] Calling Rust update_task...');
    invoke<boolean>('update_task', { taskId, title, description, priority })
      .then((result) => {
        console.log('[saveTaskEdit] Rust result:', result);
        if (result) {
          console.log('[saveTaskEdit] Task updated successfully');
          document.querySelector('.fixed')?.remove();
          reloadTasks();
        } else {
          console.error('[saveTaskEdit] Update returned false');
        }
      })
      .catch((err) => {
        console.error('[saveTaskEdit] Failed to update task:', err);
      });
  } else {
    document.querySelector('.fixed')?.remove();
    renderBoard();
  }
}

// Delete task modal
function showDeleteConfirm(taskId: string, taskTitle: string) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  modal.innerHTML = `
    <div class="bg-white rounded-3xl p-8 max-w-sm w-full soft-shadow">
      <div class="flex items-center justify-center mb-6">
        <div class="size-14 rounded-full bg-red-100 flex items-center justify-center">
          <span class="material-symbols-outlined text-3xl text-red-500">delete</span>
        </div>
      </div>
      <h2 class="text-xl font-bold text-hygge-earth text-center mb-2">Delete Task</h2>
      <p class="text-hygge-moss-60 text-center mb-6">Are you sure you want to delete "${taskTitle}"?</p>
      <div class="flex gap-3">
        <button onclick="this.closest('.fixed').remove()" class="flex-1 py-3 rounded-xl bg-white-50 text-hygge-moss hover:bg-white/80 font-medium transition-colors">Cancel</button>
        <button onclick="window.confirmDelete('${taskId}')" class="flex-1 py-3 rounded-xl bg-red-500 text-white hover:bg-red-600 font-medium transition-colors">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// Delete task (from button - show confirm modal)
function deleteTask(taskId: string) {
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    showDeleteConfirm(taskId, task.title);
  }
}

// Delete task confirmation
function confirmDelete(taskId: string) {
  console.log('[Delete] 开始删除任务:', taskId);

  // 关闭所有弹窗（确认弹窗 + 编辑弹窗）
  document.querySelectorAll('.fixed').forEach(modal => modal.remove());

  if (isTauri) {
    invoke<boolean>('delete_task', { taskId })
      .then((result) => {
        console.log('[Delete] Rust 返回:', result);
        if (result) {
          console.log('Task deleted');
          reloadTasks();
        } else {
          console.log('[Delete] 删除失败: result 为 false');
        }
      })
      .catch((err) => {
        console.error('[Delete] Failed to delete task:', err);
      });
  } else {
    tasks = tasks.filter(t => t.id !== taskId);
    renderBoard();
  }
}

// New Task Modal
function showNewTaskModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  
  modal.innerHTML = `
    <div class="bg-white rounded-3xl p-8 max-w-lg w-full soft-shadow">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-hygge-earth">New Task</h2>
        <button onclick="this.closest('.fixed').remove()" class="text-hygge-moss-60 hover:text-hygge-moss">
          <span class="material-symbols-outlined text-2xl">close</span>
        </button>
      </div>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-hygge-earth mb-2">Title</label>
          <input type="text" id="newTaskTitle" placeholder="Enter task title"
            class="w-full px-4 py-3 bg-white-50 border border-hygge-brown-20 rounded-xl text-hygge-earth placeholder-hygge-moss/40 focus:outline-none focus:ring-2 focus:ring-hygge-moss/30 transition-all"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-hygge-earth mb-2">Description</label>
          <textarea id="newTaskDesc" placeholder="Enter task description" rows="4"
            class="w-full px-4 py-3 bg-white-50 border border-hygge-brown-20 rounded-xl text-hygge-earth placeholder-hygge-moss/40 focus:outline-none focus:ring-2 focus:ring-hygge-moss/30 transition-all resize-none"
          ></textarea>
        </div>
        
        <div>
          <label class="block text-sm font-medium text-hygge-earth mb-2">Priority</label>
          <div class="flex bg-white-50 border border-hygge-brown-20 rounded-xl p-1">
            <button type="button" onclick="selectPriority(this, '中')" class="priority-btn flex-1 py-2 px-4 rounded-lg font-medium transition-all bg-accent text-white" data-value="中">Medium</button>
            <button type="button" onclick="selectPriority(this, '高')" class="priority-btn flex-1 py-2 px-4 rounded-lg font-medium transition-all bg-white-50 text-accent" data-value="高">High</button>
            <button type="button" onclick="selectPriority(this, '低')" class="priority-btn flex-1 py-2 px-4 rounded-lg font-medium transition-all bg-white-50 text-accent" data-value="低">Low</button>
          </div>
          <input type="hidden" id="newTaskPriority" value="中">
        </div>

        <div>
          <label class="block text-sm font-medium text-hygge-earth mb-2">Status</label>
          <div class="flex bg-white-50 border border-hygge-brown-20 rounded-xl p-1">
            <button type="button" onclick="selectStatus(this, 'TODO')" class="status-btn flex-1 py-2 px-4 rounded-lg font-medium transition-all bg-accent text-white" data-value="TODO">TODO</button>
            <button type="button" onclick="selectStatus(this, 'IN PROGRESS')" class="status-btn flex-1 py-2 px-4 rounded-lg font-medium transition-all bg-white-50 text-accent" data-value="IN PROGRESS">In Progress</button>
            <button type="button" onclick="selectStatus(this, 'DONE')" class="status-btn flex-1 py-2 px-4 rounded-lg font-medium transition-all bg-white-50 text-accent" data-value="DONE">Done</button>
          </div>
          <input type="hidden" id="newTaskStatus" value="TODO">
        </div>
      </div>
      
      <div class="flex gap-3 mt-6">
        <button onclick="this.closest('.fixed').remove()" class="flex-1 py-3 rounded-xl bg-white-50 text-hygge-moss hover:bg-white/80 font-medium transition-colors">Cancel</button>
        <button onclick="createTask()" class="flex-1 py-3 rounded-xl bg-accent text-white hover:opacity-90 font-medium transition-colors">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Focus title input
  setTimeout(() => {
    document.getElementById('newTaskTitle')?.focus();
  }, 100);
}

// Priority button selector
function selectPriority(btn: HTMLElement, value: string) {
  // Update hidden input
  const input = document.getElementById('newTaskPriority') as HTMLInputElement;
  if (input) input.value = value;

  // Update button styles
  document.querySelectorAll('.priority-btn').forEach((b: Element) => {
    if (b instanceof HTMLElement && b.dataset.value === value) {
      b.classList.add('bg-accent', 'text-white');
      b.classList.remove('bg-white-50', 'text-accent');
    } else {
      b.classList.remove('bg-accent', 'text-white');
      b.classList.add('bg-white-50', 'text-accent');
    }
  });
}

// Status button selector
function selectStatus(btn: HTMLElement, value: string) {
  // Update hidden input
  const input = document.getElementById('newTaskStatus') as HTMLInputElement;
  if (input) input.value = value;

  // Update button styles
  document.querySelectorAll('.status-btn').forEach((b: Element) => {
    if (b instanceof HTMLElement && b.dataset.value === value) {
      b.classList.add('bg-accent', 'text-white');
      b.classList.remove('bg-white-50', 'text-accent');
    } else {
      b.classList.remove('bg-accent', 'text-white');
      b.classList.add('bg-white-50', 'text-accent');
    }
  });
}

async function createTask() {
  const titleInput = document.getElementById('newTaskTitle') as HTMLInputElement;
  const descInput = document.getElementById('newTaskDesc') as HTMLInputElement;
  const statusSelect = document.getElementById('newTaskStatus') as HTMLSelectElement;
  const priorityInput = document.getElementById('newTaskPriority') as HTMLInputElement;

  const title = titleInput?.value.trim();
  const description = descInput?.value.trim();
  const priority = (priorityInput?.value as '高' | '中' | '低') || '中';
  const status = (statusSelect?.value as 'TODO' | 'IN PROGRESS' | 'DONE') || 'TODO';

  if (!title) {
    titleInput?.focus();
    return;
  }

  const newTask: Task = {
    id: `task-${Date.now()}`,
    title,
    description: description || '',
    priority,
    created_date: new Date().toISOString().split('T')[0],
    updated_date: new Date().toISOString().split('T')[0],
    status: status
  };

  try {
    if (isTauri) {
      await invoke<void>('create_task', {
        title: newTask.title,
        description: newTask.description,
        priority: newTask.priority,
        status: newTask.status
      });
      document.querySelector('.fixed')?.remove();
      await reloadTasks();
    } else {
      tasks.unshift(newTask);
      document.querySelector('.fixed')?.remove();
      if (currentView === 'board') {
        renderBoard();
      }
    }
  } catch (error) {
    console.error('Failed to create task:', error);
    if (!isTauri) {
      tasks.unshift(newTask);
      document.querySelector('.fixed')?.remove();
      if (currentView === 'board') {
        renderBoard();
      }
    } else {
      alert('创建任务失败');
    }
  }
}

// Real-time search handler
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
let isSearching: boolean = false;

async function handleSearch(query: string) {
  searchQuery = query;

  // Clear previous timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  // Only search when on board view
  if (currentView !== 'board') {
    return;
  }

  // Debounce search - 500ms to reduce render frequency
  searchTimeout = setTimeout(async () => {
    if (isSearching) return; // Prevent concurrent searches
    isSearching = true;

    try {
      if (query.trim() === '') {
        filteredTasks = [...tasks];
      } else if (isTauri) {
        // Use Rust command for searching
        try {
          const resultsJson = await invoke<string>('search_tasks', { query });
          filteredTasks = JSON.parse(resultsJson);
        } catch (e) {
          // Fallback to client-side search
          filteredTasks = clientSideSearch(tasks, query);
        }
      } else {
        // Client-side search
        filteredTasks = clientSideSearch(tasks, query);
      }

      // Only render if still on board view
      if (currentView === 'board') {
        renderBoard();
      }
    } finally {
      isSearching = false;
    }
  }, 500);
}

function clientSideSearch(taskList: Task[], query: string): Task[] {
  const lowerQuery = query.toLowerCase();
  return taskList.filter(t =>
    t.title.toLowerCase().includes(lowerQuery) ||
    t.description.toLowerCase().includes(lowerQuery)
  );
}

// Start app with error handling
init().then(() => {
  console.log('~');
  console.log('ClawTask initialized');
  updateNavigation();
  // Verify TailwindCSS loaded
  if (!document.body.classList.contains('flex')) {
    console.warn('TailwindCSS may not have loaded, forcing styles');
    document.body.style.cssText = 'display: flex; overflow: hidden; height: 100vh;';
  }
}).catch(err => {
  console.error('Failed to initialize:', err);
});

async function reloadTasks() {
  console.log('[reloadTasks] Starting reload...');
  if (isTauri) {
    try {
      const tasksJson = await invoke<string>('read_board_tasks');
      tasks = JSON.parse(tasksJson);
      filteredTasks = [...tasks];
      console.log('[reloadTasks] Loaded tasks:', tasks.length);

      // 打印三个队列
      const todoTasks = tasks.filter(t => t.status === 'TODO');
      const progressTasks = tasks.filter(t => t.status === 'IN PROGRESS');
      const doneTasks = tasks.filter(t => t.status === 'DONE');

      console.log('[reloadTasks] ===== TODO =====');
      todoTasks.forEach((t, i) => console.log(`  [${i}] ${t.title} (${t.id.substring(0, 8)})`));

      console.log('[reloadTasks] ===== IN PROGRESS =====');
      progressTasks.forEach((t, i) => console.log(`  [${i}] ${t.title} (${t.id.substring(0, 8)})`));

      console.log('[reloadTasks] ===== DONE =====');
      doneTasks.forEach((t, i) => console.log(`  [${i}] ${t.title} (${t.id.substring(0, 8)})`));

      refreshView();
    } catch (e) {
      console.error('[reloadTasks] Failed:', e);
      alert('Failed to reload: ' + e);
    }
  } else {
    alert('Not in Tauri mode');
  }
}

function refreshView() {
  console.log('[refreshView] currentView:', currentView);
  switch (currentView) {
    case 'board':
      renderBoard();
      break;
    case 'heatmap':
      renderHeatmapView();
      break;
    case 'projects':
      renderProjectsView();
      break;
    case 'insights':
      renderInsightsView();
      break;
    case 'settings':
      renderSettingsView();
      break;
  }
}

// Export/Import Functions
async function exportData() {
  if (!isTauri) {
    // Browser mode: download as JSON file
    const data = {
      tasks: tasks,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clawtask-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  try {
    const jsonData = await invoke<string>('export_tasks');
    const data = {
      tasks: JSON.parse(jsonData),
      exportDate: new Date().toISOString(),
      version: '1.0'
    };

    // Use Tauri API to save file
    await invoke<void>('export_tasks');

    // Trigger download
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clawtask-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('Data exported successfully');
  } catch (error) {
    console.error('Failed to export data:', error);
    alert('Failed to export data');
  }
}

async function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.tasks && Array.isArray(data.tasks)) {
        const confirmImport = confirm(`Import ${data.tasks.length} tasks?`);
        if (confirmImport) {
          // Import each task
          for (const task of data.tasks) {
            try {
              await invoke<void>('create_task', {
                title: task.title,
                description: task.description || '',
                priority: task.priority || '中'
              });
            } catch (err) {
              console.warn('Failed to import task:', task.title, err);
            }
          }
          await reloadTasks();
          alert('Import completed!');
        }
      } else {
        alert('Invalid file format');
      }
    } catch (error) {
      console.error('Failed to import:', error);
      alert('Failed to import file');
    }
  };
  input.click();
}

// Export functions to window for onclick handlers
(window as any).showNewTaskModal = showNewTaskModal;
(window as any).showTaskDetail = showTaskDetail;
(window as any).switchView = switchView;
(window as any).clearSearch = clearSearch;
(window as any).saveTaskEdit = saveTaskEdit;
(window as any).deleteTask = deleteTask;
(window as any).createTask = createTask;
(window as any).handleSearch = handleSearch;
(window as any).selectPriority = selectPriority;
(window as any).selectStatus = selectStatus;
(window as any).handleDragStart = handleDragStart;
(window as any).handleDragEnd = handleDragEnd;
(window as any).handleDragOver = handleDragOver;
(window as any).handleDragEnter = handleDragEnter;
(window as any).handleDragLeave = handleDragLeave;
(window as any).handleCardDragOver = handleCardDragOver;
(window as any).handleDrop = handleDrop;
(window as any).handleCardDrop = handleCardDrop;
(window as any).handleCardClick = handleCardClick;
(window as any).renderProjectsView = renderProjectsView;
(window as any).renderInsightsView = renderInsightsView;
(window as any).updateNavigation = updateNavigation;
(window as any).renderSettingsView = renderSettingsView;
(window as any).reloadTasks = reloadTasks;
(window as any).refreshView = refreshView;
(window as any).exportData = exportData;
(window as any).importData = importData;
(window as any).toggleAutoRefresh = toggleAutoRefresh;
(window as any).toggleCompactMode = toggleCompactMode;
(window as any).setTheme = setTheme;
(window as any).setAccentColor = setAccentColor;
(window as any).copyDbPath = copyDbPath;
(window as any).compactDatabase = compactDatabase;
(window as any).backupDatabase = backupDatabase;
(window as any).openDevTools = openDevTools;
(window as any).confirmDelete = confirmDelete;
(window as any).getDbPath = getDbPath;
(window as any).clearAllData = clearAllData;

// Database path - dynamic retrieval
function getDbPath(): string {
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    return './data.db';
  }
  return './data.db';
}

// Database functions
async function copyDbPath() {
  const path = getDbPath();
  navigator.clipboard.writeText(path)
    .then(() => alert('Path copied to clipboard!'))
    .catch(() => alert('Failed to copy path'));
}

async function compactDatabase() {
  try {
    await reloadTasks();
    alert('Database compacted successfully!');
  } catch (e) {
    console.error('Failed to compact database:', e);
    alert('Failed to compact database');
  }
}

async function backupDatabase() {
  try {
    const exportJson = await invoke<string>('export_tasks');
    const data = JSON.parse(exportJson);

    const backupBlob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(backupBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clawtask-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('Backup created successfully');
  } catch (e) {
    console.error('Failed to create backup:', e);
    alert('Failed to create backup');
  }
}

function openDevTools() {
  if (isTauri) {
    invoke<void>('open_devtools').catch(console.error);
  } else {
    alert('Press F12 to open browser developer tools');
  }
}

async function clearAllData() {
  if (!confirm('Are you sure you want to delete ALL tasks? This cannot be undone.')) return;
  if (!confirm('This will permanently delete all data. Continue?')) return;

  try {
    for (const task of [...tasks]) {
      await invoke<void>('delete_task', { taskId: task.id });
    }
    tasks = [];
    refreshView();
    alert('All data has been cleared.');
  } catch (e) {
    console.error('Failed to clear data:', e);
    alert('Failed to clear data.');
  }
}
