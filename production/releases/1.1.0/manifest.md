# Echo-String: Genesis 1.1.0 发布清单

发布日期：2026-07-26

版本代号：Chronicle Expedition

## 本次交付

- 默认亮色主题重新校准，保留手动深色模式和独立主题记忆。
- 新增「远征」长期模式：威胁值、完整度、崩塌、周期词缀与结算奖励。
- 新增跨局成长：深墨池、活页词库、定句锚。
- 简体 / 繁体切换继续使用同一布局；英文模式已移除。
- 存档升级到 schema 2，旧存档可兼容读取，档案与主题独立持久化。
- 移动端压缩远征信息密度，并支持展开 / 收起词缀说明。
- 核心规则从界面脚本中拆分到 `prototype/core/`，便于继续扩展和测试。

## 可玩构建

- 入口：`prototype/index.html`
- 运行配置：`prototype/core/runtime-config.js`
- 成长与远征规则：`prototype/core/progression.js`
- 主游戏：`prototype/app.js`
- 样式：`prototype/styles.css`
- 内建回归：`prototype/regression.js`

## 验收材料

- `report.json`：桌面 / 移动端体验报告
- `dom_click_report.json`：真实点击路径回归
- `visual_smoke_report.json`：关键元素可见性检查
- `visibility_report.json`：首次视口可见性摘要
- `summary.md`：自动验收摘要
- `screenshots/desktop-expedition.png`
- `screenshots/desktop-guided.png`
- `screenshots/mobile-low.png`

## 验收标准

- 引导、低提示、远征三条完整通关路径全部通过。
- 远征路径至少触发一次崩塌，仍可完成并获得档案奖励。
- 桌面亮色、桌面引导与移动端低提示首屏关键交互均可见。
- 项目一致性、UI 契约、数据契约、失败路径和成长规则回归全部通过。
- GitHub Pages 工作流校验 1.1.0 核心文件与缓存版本。
