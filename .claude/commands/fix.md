# /fix - 深度代码修复与规范审查

1. **扫描当前代码**:
   - 硬编码路径 (如 `/Users/hankli/...`)
   - 未处理的 `Result` 类型
   - 缺少类型的 `any` 或 `unknown`

2. **检查 CSS 规范**:
   - 是否使用 `bg-[#xxxxxx]` 等任意值
   - 是否复用 `src/index.css` 的 `:root` 变量

3. **检查 Tauri 命令注册**:
   - Rust 函数是否已在 `main.rs` 的 `generate_handler!` 中注册
   - 前端 `invoke` 名称是否与 Rust 函数名一致
   - capabilities 权限是否包含该命令

4. **参考标准**: 遵循 `awesome-claude-code` 的最高工程实践

5. **执行流程**:
   - 列出所有发现的问题
   - 提供修复方案
   - 修复后自动运行 `cargo check` 验证
