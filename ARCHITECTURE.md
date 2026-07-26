# 1.1.0 客户端架构

## 目标

项目保持“无构建、可直接部署到 GitHub Pages”的约束，同时把稳定配置、长期成长、关卡交互和验证工具分层，避免继续扩展单个全局脚本。

## 依赖方向

```text
index.html
  ├─ core/runtime-config.js
  ├─ core/progression.js
  ├─ app.js
  └─ regression.js
```

- `runtime-config.js` 只声明版本、构建名、存档 schema 与键名。
- `progression.js` 是无 DOM 的纯规则模块，负责档案归一化、轮次规则、成本、奖励和铭文购买。
- `app.js` 持有关卡状态，调用核心模块并渲染页面。
- `regression.js` 只通过公开的游戏操作执行路线，不拥有生产规则。

核心模块通过 `globalThis.EchoRuntimeConfig` 和 `globalThis.EchoProgression` 暴露，既能被浏览器顺序脚本加载，也能被 Node VM 回归加载。

## 状态边界

### 单轮存档

键：`echo_string_save_v1.1`

包含当前区域、模式、原墨、词库、关卡 flags、远征威胁与稳定度。schema 为 `2`。

### 长期档案

键：`echo_string_profile_v1.1`

包含回声残片、完成轮次、远征胜场、最高轮次、崩解总数、铭文等级和成就。清空或失败单轮不会隐式覆盖档案。

### 用户偏好

键：`echo_string_theme_preference_v1`

主题偏好独立于游戏进度。语言仍随单轮存档保存。

## 扩展规则

- 新的永久成长必须先加入 `core/progression.js`，再由 `app.js` 展示。
- 新的远征修正必须是确定性的，并在 `run_progression_regression.mjs` 中有断言。
- 关卡对象和词缀不得直接依赖 DOM。
- 每个新增正式模式必须同时进入 VM 路线和真实 DOM 点击回归。
- 发布版本只改 `core/runtime-config.js`，其他位置通过构建检查保持一致。
