# ClawTask

macOS 桌面任务看板应用

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | TypeScript + Vite |
| 桌面框架 | Tauri 2.x (Rust) |
| UI 样式 | Tailwind CSS 3.x |
| 数据库 | SQLite (rusqlite) |
| 字体 | Outfit + Material Symbols Outlined |

## 项目结构

```
clawtask/
├── src/                    # 前端代码
│   ├── index.html         # HTML 入口
│   ├── index.ts           # 主逻辑 (TypeScript)
│   └── index.css          # 自定义样式
├── src-tauri/             # Tauri 后端
│   ├── src/main.rs        # Rust 入口
│   ├── Cargo.toml         # Rust 依赖
│   └── tauri.conf.json   # Tauri 配置
├── dist/                  # 构建输出
├── data.db               # SQLite 数据库
└── package.json          # NPM 配置
```

## 数据库结构

```
位置: data.db (无密码，直接可读写)

表结构:
┌─────────────┬─────────────────────┐
│ tasks        │ 任务表              │
├─────────────┼─────────────────────┤
│ id          │ UUID 主键           │
│ title       │ 标题                │
│ description │ 描述                │
│ priority    │ 高/中/低            │
│ status      │ TODO/IN PROGRESS   │
│ created_date│ 创建日期             │
│ updated_date│ 更新日期             │
└─────────────┴─────────────────────┘

┌─────────────┬─────────────────────┐
│ projects    │ 项目表               │
├─────────────┼─────────────────────┤
│ id         │ UUID 主键            │
│ name       │ 项目名称             │
│ ...        │ ...                 │
└─────────────┴─────────────────────┘

┌─────────────┬─────────────────────┐
│ settings     │ 设置表              │
├─────────────┼─────────────────────┤
│ key         │ 设置键              │
│ value       │ 设置值              │
└─────────────┴─────────────────────┘
```

## 颜色主题

| 名称 | 颜色值 | 用途 |
|------|--------|------|
| hygge-beige | #F7F3F0 | 主背景 |
| hygge-moss | #6B705C | 主色 (默认 accent) |
| hygge-sage | #A5A58D | 次要色 |
| hygge-brown | #B7B7A4 | 边框/侧边栏 |
| hygge-earth | #6D5959 | 文字深色 |
| hygge-warm-grey | #DDBEA9 | 深色模式文字 |
| hygge-stone | #CB997E | 强调色 |
| hygge-nav | #A39E93 | 导航栏 |

## 启动命令

```bash
# 浏览器开发模式
npm run dev

# Tauri 桌面开发模式
npm run tauri dev

# 构建生产版本
npm run build

# 构建 Tauri 应用
npm run tauri build
```

## 开发配置

### 端口
- Vite Dev Server: `http://localhost:5173`
- Tauri 窗口大小: 1200 x 800

### 快捷键
- `Cmd/Ctrl + Shift + I`: 打开开发者工具
- `Cmd/Ctrl + R`: 刷新页面

## 依赖说明

### NPM 依赖
```json
{
  "@tauri-apps/api": "^2.0.0",      // Tauri API
  "@tauri-apps/plugin-shell": "^2.0.0"  // Shell 插件
}
```

### Rust 依赖
```toml
tauri = "2.0"              // Tauri 核心
rusqlite = "0.31"         // SQLite 绑定
notify = "6"               // 文件监控
chrono = "0.4"             // 日期时间
uuid = "1"                 // UUID 生成
```

## 构建生产应用

```bash
# 1. 构建前端
npm run build

# 2. 构建 Tauri 应用 (生成 .dmg)
npm run tauri build

# 输出位置: src-tauri/target/release/bundle/dmg/
```

## 注意事项

1. 数据库 `data.db` 无密码保护，如需安全请加密
2. 深色模式目前仅支持基础颜色，Tailwind CDN 样式需手动配置
3. 主题色 (Accent Color) 存储在 localStorage，切换后刷新生效
