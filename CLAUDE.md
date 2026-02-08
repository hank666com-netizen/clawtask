# ClawTask - 核心规范 (Guardrails Integrated)

## 🚨 质量守卫 (Quality Guardrails)
- **拒绝虚假成功**: 严禁在未观察到系统状态变化（DB 记录、日志输出）的情况下回复"任务已完成"。
- **原子化修改**: 每次修改必须遵循"修改-编译-验证"循环。若编译失败，禁止继续修改其他文件。
- **环境隔离**: 严禁硬编码路径。必须通过 `src-tauri/src/main.rs` 读取 `.env` 中的 `DATABASE_PATH`。

## 💾 SQLite 数据库结构
- **真理来源**: `/Users/hankli/clawd/project-board/clawtask/data.db`

### tasks 表
| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| id | TEXT PRIMARY KEY | - | 任务 ID |
| title | TEXT NOT NULL | - | 任务标题 |
| description | TEXT | - | 任务描述 |
| priority | TEXT | '中' | 优先级 (高/中/低) |
| status | TEXT | 'TODO' | 状态 (TODO/IN PROGRESS/DONE) |
| created_date | TEXT NOT NULL | - | 创建日期 |
| updated_date | TEXT NOT NULL | - | 更新日期 |
| project_id | TEXT | - | 项目 ID |
| order_idx | INTEGER | 0 | 排序索引 |

### projects 表
| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | - | 项目 ID |
| name | TEXT NOT NULL | - | 项目名称 |
| description | TEXT | - | 项目描述 |
| color | TEXT | '#6B705C' | 项目颜色 |
| progress | INTEGER | 0 | 进度 (%) |
| created_date | TEXT NOT NULL | - | 创建日期 |

### settings 表
| 字段 | 类型 | 说明 |
|------|------|------|
| key | TEXT PRIMARY KEY | 设置键 |
| value | TEXT | 设置值 |

### 索引
- `idx_tasks_status` - tasks.status
- `idx_tasks_created` - tasks.created_date
- `idx_tasks_order` - tasks.order_idx

## 🎨 样式守卫 (CSS Guardrails)
- **禁止任意值**: 严禁使用 `bg-[#xxxxxx]`。必须在 `src/index.css` 的 `:root` 中定义变量。
- **变量核查**: 修改样式前，优先搜索现有的 CSS 变量，确保 UI 一致性。

## 🛠 自定义指令 (Custom Commands)

### /fix - 深度代码修复与规范审查
1. 扫描硬编码路径、未处理 Result、any 类型
2. 检查 CSS 任意值和变量复用
3. 检查 Tauri 命令注册（三位一体：Rust 函数 / invoke / capabilities）
4. **执行后**: 立即运行 `cargo check` 验证编译

### /verify - DB 状态验证
```bash
# 用法
./scripts/verify_db.sh [TASK_ID] [EXPECTED_STATUS]

# 示例
./scripts/verify_db.sh abc-123 IN PROGRESS
```

**强制规则**: `/fix` 修复涉及 DB 变更的操作后，必须立即执行 `/verify` 验证 DB 状态。
