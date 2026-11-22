# Echo-String: Genesis 1.1.1

《语弦生态：创世纪》的长期可玩网页版本。玩家通过扫描对象、剥离词缀、注入语义槽位和触发组合反应穿过断句庭院；通关后可进入带递进规则的远征，积累回声残片并升级永久铭文。

[在线试玩](https://lunora-gather.github.io/echo-string-genesis-prototype/) · [GitHub 仓库](https://github.com/Lunora-Gather/echo-string-genesis-prototype)

## 1.1.1 核心变化

- 重构桌面游戏台比例，移除主场景与侧栏的固定空白高度。
- 修复 `?mode=` 被误判为自动回归环境、导致调试指标常驻页面的问题。
- 长期纪行改为紧凑命令栏，铭文升级按需展开。
- 重新分配大屏、平板和手机断点，压缩底部审计信息并增强亮色层级。

## 1.1.0 长期系统

- 新增“远征”模式：每轮按固定序列组合高噪回声、原墨枯潮、重写税和不稳回流。
- 新增语义威胁与三层稳定度。操作会累积威胁，达到上限触发崩解；稳定度耗尽则本轮失败。
- 新增长期档案：完成轮次、远征胜场、最高轮次、最佳评分和总崩解次数均会持久保存。
- 新增回声残片与三条永久铭文：深墨池、活页词库、定句锚。
- 引导、探索、远征、沙盒四种模式并存；远征沿用探索的信息密度。
- 单轮进度和长期档案分开管理。当前 schema 3 一并保存两者，并兼容旧版存档。
- 首次进入仍默认亮色；玩家手动选择的主题与简繁语言会被记住。

## 玩法循环

1. 在引导或探索模式完成七个区域，理解扫描、取词、写入和组合反应。
2. 进入远征，依据本轮规则控制原墨与语义威胁。
3. 在稳定度耗尽前击败残章守卫，获得回声残片。
4. 购买永久铭文，提高原墨上限、词库容量或远征抗压能力。
5. 进入下一轮，面对新的规则组合和更高轮次记录。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `prototype/` | GitHub Pages 直接发布的静态客户端 |
| `prototype/core/` | 版本配置、存档键、长期成长和远征规则 |
| `prototype/app.js` | 关卡状态、交互控制器与界面渲染 |
| `prototype/regression.js` | 浏览器内完整路线与边界审计 |
| `data/` | 语义标签、对象和组合反应的设计数据 |
| `design/` | 关卡、战斗与 1.1.0 长期循环设计 |
| `scripts/` | VM、真实 DOM、视觉与发布前验证 |
| `production/releases/` | 按版本归档的报告与截图 |
| `production/playtest/` | 真人试玩协议和记录模板 |

更详细的依赖方向与存档边界见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 本地运行

```sh
node prototype/server.mjs 4174
```

打开 `http://127.0.0.1:4174/index.html`。

## 验证

在仓库根目录运行逻辑与存档回归，这一步无需浏览器。

```sh
npm test
```

浏览器回归使用 macOS 自带的 Safari。打开 Safari 开发者设置中的「允许远程自动化」，启动本地服务器后，在另一个终端执行以下命令。

```sh
npm ci
npm run test:browser
```

浏览器回归会通过 WebDriver 点击桌面与窄屏控件。报告和截图默认写入 `artifacts/browser/`。`production/releases/` 保存历史发布记录。

也可以在 Windows 上用 PowerShell 运行静态与逻辑验证。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\validate_project.ps1
```

逻辑验证覆盖三模式通关、六种远征修正组合、奖励结算、护文限制、旧档迁移、刷新恢复和多标签页存档冲突。浏览器验证另检查窄屏探索通关、地图结算、常用控件和桌面／窄屏首屏。
