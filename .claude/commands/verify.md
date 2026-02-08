# /verify 命令规范

## 职责
验证指定的任务 ID 在数据库中的状态是否与预期一致。

## 执行逻辑
1. **获取参数**: 接收 $1 (Task ID) 和 $2 (预期 Status)。
2. **读取配置**: 从根目录 `.env` 获取 `DATABASE_PATH`。
3. **执行查询**:
   使用命令: `sqlite3 $DATABASE_PATH "SELECT status FROM tasks WHERE id='$1';"`
4. **比对结果**:
   - 如果查询结果 == $2，输出: "✅ [VERIFIED]: Task $1 is now $2."
   - 如果不一致，输出: "❌ [FAILED]: Expected $2 but DB shows [实际结果]. ERROR: Data not persisted!"
   - 如果查不到 ID，输出: "⚠️ [NOT FOUND]: Task ID $1 does not exist in DB."

## 强制要求
如果校验失败，必须自动重新检查 `main.rs` 中的 Rust 逻辑和 `invoke` 参数传递。
