#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

// Load environment variables from .env file
#[allow(clippy::unused_unit)]
fn load_dotenv() {
    let _ = dotenv::dotenv();
}

// Database path - 从环境变量读取或使用默认值
fn get_db_path() -> PathBuf {
    PathBuf::from(std::env::var("DATABASE_PATH").unwrap_or_else(|_| "./data.db".to_string()))
}

// Board path - 从环境变量读取或使用默认值
fn get_board_path() -> PathBuf {
    PathBuf::from(std::env::var("BOARD_PATH").unwrap_or_else(|_| "./board".to_string()))
}

// Simple cache with last modified timestamp
struct TaskCache {
    tasks_json: String,
    last_modified: u64,
}

lazy_static::lazy_static! {
    static ref CACHE: Mutex<Option<TaskCache>> = Mutex::new(None);
}

// Initialize SQLite database
fn init_db() -> Result<rusqlite::Connection, rusqlite::Error> {
    let db_path = get_db_path();
    let conn = rusqlite::Connection::open(&db_path)?;

    // Create tables
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT DEFAULT '中',
            status TEXT DEFAULT 'TODO',
            created_date TEXT NOT NULL,
            updated_date TEXT NOT NULL,
            project_id TEXT
        );

        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            color TEXT DEFAULT '#6B705C',
            progress INTEGER DEFAULT 0,
            created_date TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_date);
    "#)?;

    // Migrate: add order_idx column if not exists
    {
        let mut stmt = conn.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")?;
        let table_schema: String = stmt.query_row([], |row| row.get(0))?;

        if !table_schema.contains("order_idx") {
            conn.execute("ALTER TABLE tasks ADD COLUMN order_idx INTEGER DEFAULT 0", [])?;
            conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_order ON tasks(order_idx)", [])?;
            println!("[DB] Migrated: added order_idx column to tasks");
        }
    }

    Ok(conn)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

#[tauri::command]
fn read_board_tasks() -> Result<String, String> {
    // Check cache first
    let db_path = get_db_path();
    let db_mtime = if db_path.exists() {
        std::fs::metadata(&db_path)
            .and_then(|m| m.modified())
            .map(|m| m.duration_since(std::time::UNIX_EPOCH).map(|s| s.as_secs()).unwrap_or(0))
            .unwrap_or(0)
    } else {
        0
    };

    {
        let cache = CACHE.lock().unwrap();
        if let Some(ref cached) = *cache {
            if cached.last_modified >= db_mtime && !cached.tasks_json.is_empty() {
                println!("[read_board_tasks] Using cache");
                return Ok(cached.tasks_json.clone());
            }
        }
    }

    // Read from database
    let conn = init_db().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, title, description, priority, status, created_date, updated_date, project_id
         FROM tasks ORDER BY created_date DESC"
    ).map_err(|e| e.to_string())?;

    let mut tasks: Vec<serde_json::Value> = Vec::new();

    let rows = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0).unwrap_or_default(),
            "title": row.get::<_, String>(1).unwrap_or_default(),
            "description": row.get::<_, Option<String>>(2).unwrap_or_default().unwrap_or_default(),
            "priority": row.get::<_, String>(3).unwrap_or_default(),
            "status": row.get::<_, String>(4).unwrap_or_default(),
            "created_date": row.get::<_, String>(5).unwrap_or_default(),
            "updated_date": row.get::<_, String>(6).unwrap_or_default(),
            "project_id": row.get::<_, Option<String>>(7).unwrap_or_default(),
        }))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        match row {
            Ok(task) => tasks.push(task),
            Err(e) => println!("Error reading task row: {}", e),
        }
    }

    let tasks_json = serde_json::to_string(&tasks).map_err(|e| e.to_string())?;

    // Update cache
    {
        let mut cache = CACHE.lock().unwrap();
        *cache = Some(TaskCache {
            tasks_json: tasks_json.clone(),
            last_modified: db_mtime,
        });
    }

    Ok(tasks_json)
}

#[tauri::command]
fn update_task_status(task_id: String, new_status: String) -> bool {
    println!("[Rust] =========================================");
    println!("[Rust] update_task_status called");
    println!("[Rust]   task_id:    {}", task_id);
    println!("[Rust]   new_status: {}", new_status);

    let conn = match init_db() {
        Ok(c) => c,
        Err(e) => {
            println!("[Rust] ERROR: Failed to open database: {}", e);
            return false;
        }
    };

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    match conn.execute(
        "UPDATE tasks SET status = ?, updated_date = ? WHERE id = ?",
        rusqlite::params![new_status, today, task_id],
    ) {
        Ok(rows) => {
            println!("[Rust]   Rows affected: {}", rows);
            if rows > 0 {
                let mut cache = CACHE.lock().unwrap();
                *cache = None;
                println!("[Rust] SUCCESS: Task {} status updated to {}", task_id, new_status);
                println!("[Rust] =========================================");
                true
            } else {
                println!("[Rust] WARNING: Task not found with id: {}", task_id);
                println!("[Rust] =========================================");
                false
            }
        }
        Err(e) => {
            println!("[Rust] ERROR: Database error: {}", e);
            println!("[Rust] =========================================");
            false
        }
    }
}

#[tauri::command]
fn update_task(task_id: String, title: String, description: String, priority: String) -> bool {
    println!("[Rust] update_task called: id={}", task_id);

    let conn = match init_db() {
        Ok(c) => c,
        Err(e) => {
            println!("[Rust] Failed to open database: {}", e);
            return false;
        }
    };

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    match conn.execute(
        "UPDATE tasks SET title = ?, description = ?, priority = ?, updated_date = ? WHERE id = ?",
        rusqlite::params![title, description, priority, today, task_id],
    ) {
        Ok(rows) => {
            println!("[Rust] Rows affected: {}", rows);
            if rows > 0 {
                let mut cache = CACHE.lock().unwrap();
                *cache = None;
                println!("[Rust] Task {} updated", task_id);
                true
            } else {
                println!("[Rust] Task not found with id: {}", task_id);
                false
            }
        }
        Err(e) => {
            println!("[Rust] Database error: {}", e);
            false
        }
    }
}

#[tauri::command]
fn get_tasks_by_status(status: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, title, description, priority, status, created_date, updated_date, project_id
         FROM tasks
         WHERE status = ?1
         ORDER BY created_date DESC"
    ).map_err(|e| e.to_string())?;

    let mut tasks: Vec<serde_json::Value> = Vec::new();

    let rows = stmt.query_map([&status], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0).unwrap_or_default(),
            "title": row.get::<_, String>(1).unwrap_or_default(),
            "description": row.get::<_, Option<String>>(2).unwrap_or_default().unwrap_or_default(),
            "priority": row.get::<_, String>(3).unwrap_or_default(),
            "status": row.get::<_, String>(4).unwrap_or_default(),
            "created_date": row.get::<_, String>(5).unwrap_or_default(),
            "updated_date": row.get::<_, String>(6).unwrap_or_default(),
            "project_id": row.get::<_, Option<String>>(7).unwrap_or_default(),
        }))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        match row {
            Ok(task) => tasks.push(task),
            Err(e) => println!("Error reading task row: {}", e),
        }
    }

    serde_json::to_string(&tasks).map_err(|e| e.to_string())
}

#[tauri::command]
fn search_tasks(query: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| e.to_string())?;

    let search_pattern = format!("%{}%", query.to_lowercase());
    let mut stmt = conn.prepare(
        "SELECT id, title, description, priority, status, created_date, updated_date, project_id
         FROM tasks
         WHERE LOWER(title) LIKE ?1 OR LOWER(description) LIKE ?1
         ORDER BY created_date DESC"
    ).map_err(|e| e.to_string())?;

    let mut tasks: Vec<serde_json::Value> = Vec::new();

    let rows = stmt.query_map([&search_pattern], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0).unwrap_or_default(),
            "title": row.get::<_, String>(1).unwrap_or_default(),
            "description": row.get::<_, Option<String>>(2).unwrap_or_default().unwrap_or_default(),
            "priority": row.get::<_, String>(3).unwrap_or_default(),
            "status": row.get::<_, String>(4).unwrap_or_default(),
            "created_date": row.get::<_, String>(5).unwrap_or_default(),
            "updated_date": row.get::<_, String>(6).unwrap_or_default(),
            "project_id": row.get::<_, Option<String>>(7).unwrap_or_default(),
        }))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        match row {
            Ok(task) => tasks.push(task),
            Err(e) => println!("Error searching task row: {}", e),
        }
    }

    serde_json::to_string(&tasks).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_task(title: String, description: String, priority: String, status: String) -> Result<bool, String> {
    let conn = init_db().map_err(|e| e.to_string())?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let id = uuid::Uuid::new_v4().to_string();

    match conn.execute(
        "INSERT INTO tasks (id, title, description, priority, status, created_date, updated_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![id, title, description, priority, status, today, today],
    ) {
        Ok(_) => {
            // Invalidate cache
            let mut cache = CACHE.lock().unwrap();
            *cache = None;
            println!("Task created successfully");
            Ok(true)
        }
        Err(e) => {
            println!("Failed to create task: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn delete_task(task_id: String) -> bool {
    println!("[Rust] delete_task called, task_id: {}", task_id);

    let conn = match init_db() {
        Ok(c) => c,
        Err(e) => {
            println!("[Rust] Failed to open DB: {}", e);
            return false;
        }
    };

    match conn.execute("DELETE FROM tasks WHERE id = ?", [&task_id]) {
        Ok(rows) => {
            println!("[Rust] Rows affected: {}", rows);
            if rows > 0 {
                let mut cache = CACHE.lock().unwrap();
                *cache = None;
                println!("[Rust] Task {} deleted successfully", task_id);
                true
            } else {
                println!("[Rust] Task not found: {}", task_id);
                false
            }
        }
        Err(e) => {
            println!("[Rust] DB error: {}", e);
            false
        }
    }
}

#[tauri::command]
fn list_projects() -> Result<String, String> {
    let conn = init_db().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, name, description, color, progress, created_date FROM projects ORDER BY id"
    ).map_err(|e| e.to_string())?;

    let mut projects: Vec<serde_json::Value> = Vec::new();

    let rows = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0).unwrap_or(0),
            "name": row.get::<_, String>(1).unwrap_or_default(),
            "description": row.get::<_, Option<String>>(2).unwrap_or_default().unwrap_or_default(),
            "color": row.get::<_, String>(3).unwrap_or_default(),
            "progress": row.get::<_, i64>(4).unwrap_or(0),
            "created_date": row.get::<_, String>(5).unwrap_or_default(),
        }))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        match row {
            Ok(project) => projects.push(project),
            Err(e) => println!("Error reading project row: {}", e),
        }
    }

    serde_json::to_string(&projects).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_new_project(name: String, description: String, color: String) -> Result<bool, String> {
    let conn = init_db().map_err(|e| e.to_string())?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    conn.execute(
        "INSERT INTO projects (name, description, color, progress, created_date) VALUES (?, ?, ?, 0, ?)",
        rusqlite::params![name, description, color, today],
    ).map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
fn modify_project_progress(id: i32, progress: i32) -> bool {
    let conn = match init_db() {
        Ok(c) => c,
        Err(_) => return false,
    };

    conn.execute("UPDATE projects SET progress = ? WHERE id = ?", [progress, id]).is_ok()
}

#[tauri::command]
fn get_heatmap_data() -> Result<String, String> {
    let conn = init_db().map_err(|e| e.to_string())?;

    // Get task counts by date
    let mut stmt = conn.prepare(
        "SELECT created_date, COUNT(*) as count FROM tasks GROUP BY created_date"
    ).map_err(|e| e.to_string())?;

    let mut date_counts: Vec<(String, i64)> = Vec::new();

    let rows = stmt.query_map([], |row| {
        let date: String = row.get(0).unwrap_or_default();
        let count: i64 = row.get(1).unwrap_or(0);
        Ok((date, count))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        match row {
            Ok((date, count)) => date_counts.push((date, count)),
            Err(e) => println!("Error reading date count: {}", e),
        }
    }

    let today = chrono::Local::now();
    let mut data: Vec<serde_json::Value> = Vec::new();

    for i in (0..365).rev() {
        let date = today - chrono::Duration::days(i);
        let date_str = date.format("%Y-%m-%d").to_string();
        let count = date_counts.iter()
            .find(|(d, _)| d == &date_str)
            .map(|(_, c)| *c)
            .unwrap_or(0);

        let level = match count {
            0 => 0,
            1 => 1,
            2..=3 => 2,
            4..=6 => 3,
            _ => 4,
        };

        data.push(serde_json::json!({
            "date": date_str,
            "count": count,
            "level": level
        }));
    }

    serde_json::to_string(&data).map_err(|e| e.to_string())
}

#[tauri::command]
fn export_tasks() -> Result<String, String> {
    let tasks_json = read_board_tasks()?;
    let projects_json = list_projects()?;

    let tasks: Vec<serde_json::Value> = serde_json::from_str(&tasks_json).map_err(|e| e.to_string())?;
    let projects: Vec<serde_json::Value> = serde_json::from_str(&projects_json).map_err(|e| e.to_string())?;

    let export_data = serde_json::json!({
        "version": "1.0",
        "export_date": chrono::Local::now().to_rfc3339(),
        "tasks": tasks,
        "projects": projects,
    });

    serde_json::to_string_pretty(&export_data).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_tasks(json_data: String, replace: bool) -> Result<i32, String> {
    let conn = init_db().map_err(|e| e.to_string())?;
    let data: serde_json::Value = serde_json::from_str(&json_data).map_err(|e| e.to_string())?;

    if replace {
        conn.execute_batch("DELETE FROM tasks").map_err(|e| e.to_string())?;
    }

    let tasks = data.get("tasks").ok_or("No tasks in import data")?;
    let mut imported = 0;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    for task in tasks.as_array().ok_or("Invalid tasks format")? {
        let id = uuid::Uuid::new_v4().to_string();
        let title = task.get("title").and_then(|t| t.as_str()).ok_or("Missing title")?;
        let description = task.get("description").and_then(|d| d.as_str()).unwrap_or("");
        let priority = task.get("priority").and_then(|p| p.as_str()).unwrap_or("中");
        let status = task.get("status").and_then(|s| s.as_str()).unwrap_or("TODO");
        let created_date = task.get("created_date").and_then(|d| d.as_str()).unwrap_or(&today);
        let updated_date = today.as_str();

        if let Ok(_) = conn.execute(
            "INSERT OR IGNORE INTO tasks (id, title, description, priority, status, created_date, updated_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![id, title, description, priority, status, created_date, updated_date],
        ) {
            imported += 1;
        }
    }

    // Invalidate cache
    let mut cache = CACHE.lock().unwrap();
    *cache = None;

    Ok(imported)
}

// Settings commands
#[tauri::command]
fn get_setting(key: String) -> Result<Option<String>, String> {
    let conn = init_db().map_err(|e| e.to_string())?;

    let result: Result<String, rusqlite::Error> = conn.query_row(
        "SELECT value FROM settings WHERE key = ?",
        [&key],
        |row| row.get(0),
    );

    match result {
        Ok(value) => Ok(Some(value)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_setting(key: String, value: String) -> Result<(), String> {
    let conn = init_db().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        [&key, &value],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_all_settings() -> Result<String, String> {
    let conn = init_db().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT key, value FROM settings").map_err(|e| e.to_string())?;

    let mut rows: Vec<serde_json::Value> = Vec::new();

    let result_rows = stmt.query_map([], |row| {
        let key: String = row.get(0).unwrap_or_default();
        let value: String = row.get(1).unwrap_or_default();
        Ok(serde_json::json!({
            "key": key,
            "value": value,
        }))
    }).map_err(|e| e.to_string())?;

    for row in result_rows {
        match row {
            Ok(json_val) => rows.push(json_val),
            Err(e) => println!("Error reading setting: {}", e),
        }
    }

    serde_json::to_string(&rows).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_db_path_cmd() -> String {
    get_db_path().to_string_lossy().to_string()
}

#[tauri::command]
fn get_board_path_cmd() -> String {
    get_board_path().to_string_lossy().to_string()
}

#[tauri::command]
fn open_devtools(_window: tauri::WebviewWindow) {
    // Note: Uses private API on macOS - cannot submit to App Store
    let _ = _window.open_devtools();
}

fn setup_file_watcher(window: tauri::WebviewWindow) {
    let board_path = get_board_path();

    std::thread::spawn(move || {
        use notify::{RecursiveMode, Watcher};
        use std::sync::mpsc::channel;

        let (tx, rx) = channel();

        let mut watcher = notify::recommended_watcher(tx).unwrap();
        watcher.watch(&board_path, RecursiveMode::Recursive).ok();

        loop {
            if let Ok(Ok(event)) = rx.recv().map_err(|_| ()) {
                match event.kind {
                    notify::EventKind::Create(_)
                    | notify::EventKind::Modify(_)
                    | notify::EventKind::Remove(_) => {
                        // Invalidate cache
                        let mut cache = CACHE.lock().unwrap();
                        *cache = None;
                        // Notify frontend to refresh
                        window.emit("task-file-changed", ()).ok();
                    }
                    _ => {}
                }
            }
        }
    });
}

fn main() {
    load_dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_devtools::init())
        .setup(|app| {
            let window = app.get_webview_window("main")
                .expect("Failed to get main window - check tauri.conf.json windows config");

            // Initialize database
            if let Err(e) = init_db() {
                println!("Failed to initialize database: {}", e);
            }

            setup_file_watcher(window);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            list_projects,
            add_new_project,
            modify_project_progress,
            get_heatmap_data,
            read_board_tasks,
            get_tasks_by_status,
            update_task_status,
            update_task,
            search_tasks,
            create_task,
            export_tasks,
            import_tasks,
            delete_task,
            get_setting,
            set_setting,
            get_all_settings,
            get_db_path_cmd,
            get_board_path_cmd,
            open_devtools,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
