# ChatGPT 图片生成自动化工具 - MVP 开发文档（可执行版）

## 1. 产品目标

### 1.1 问题定义
用户在 ChatGPT 网页端批量出图时，存在大量重复操作：
- 手动创建对话
- 手动上传参考图
- 手动输入提示词
- 手动等待并下载结果

### 1.2 MVP 目标
在不改造 ChatGPT 服务端的前提下，通过桌面端自动化将批量任务效率提升 5-10 倍，并确保失败可恢复、结果可管理。

### 1.3 目标用户
- 电商设计师
- 社媒内容团队
- AI 绘图工作流用户（需要同模板批量生成）

---

## 2. 范围定义

### 2.1 MVP 必做（In Scope）
1. 批量导入参考图与提示词
2. 自动执行网页端出图流程（上传、输入、提交、等待、下载）
3. 限额识别与自动暂停恢复
4. 结果按任务结构化存储与预览
5. 任务进度可视化 + 暂停/继续/取消

### 2.2 MVP 不做（Out of Scope）
1. 多账号并行调度
2. 云端协作/多人共享
3. 自动提示词优化（Prompt Engineering）
4. OCR/视觉反馈闭环打分
5. App Store 分发与自动更新

---

## 3. 技术方案

### 3.1 技术栈
- Electron（主进程/渲染进程）
- React 18 + TypeScript
- Tailwind CSS
- Zustand
- Playwright
- Node.js `fs/promises`
- electron-builder（后续打包）

### 3.2 分层架构
1. 渲染进程（UI）
- 任务配置
- 执行控制
- 进度与结果展示

2. 主进程（业务编排）
- 任务队列与状态机
- 调用 Playwright 执行器
- 文件系统读写
- IPC 对外接口

3. 自动化执行层（Playwright）
- 页面导航
- 元素定位与动作
- 网络/DOM 双重等待
- 下载监听

---

## 4. 功能设计

### F1 任务配置
- 支持拖拽/多选导入图片
- 支持为单图配置多提示词
- 任务预估：`任务总数 = 图片数 x 提示词数`
- 导入校验：格式（png/jpg/webp）、大小（默认 <= 20MB）

### F2 自动化执行
对每个任务按顺序执行：
1. 打开 ChatGPT 页面并校验登录态
2. 创建新会话（或清空上下文）
3. 上传参考图
4. 填入提示词
5. 点击生成按钮
6. 等待结果出现
7. 下载并归档

### F3 智能等待与容错
- 识别限额提示关键词（中英文）
- 解析等待时长（分钟级）
- 进入 `waiting_rate_limit` 状态倒计时
- 到点自动恢复
- 常见失败自动重试（最多 3 次）

### F4 结果管理
- 目录结构：`output/<ref_name>/<prompt_slug>/...`
- 生成缩略图索引（本地）
- 支持勾选删除
- 支持导出（zip）

### F5 进度监控
- 全局进度：完成/总数
- 当前任务状态：`queued/running/waiting/paused/done/error/cancelled`
- 控制操作：暂停/继续/取消

---

## 5. 核心数据模型（TypeScript）

```ts
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_rate_limit'
  | 'paused'
  | 'done'
  | 'error'
  | 'cancelled';

export interface PromptItem {
  id: string;
  text: string;
}

export interface ReferenceImage {
  id: string;
  filePath: string;
  fileName: string;
}

export interface GenerationTask {
  id: string;
  refImageId: string;
  promptId: string;
  status: TaskStatus;
  retryCount: number;
  outputPaths: string[];
  errorMessage?: string;
}

export interface JobBundle {
  id: string;
  createdAt: string;
  outputDir: string;
  refs: ReferenceImage[];
  prompts: PromptItem[];
  tasks: GenerationTask[];
}
```

---

## 6. IPC 接口（渲染进程 <-> 主进程）

### 6.1 命令接口
- `job:create(payload)`：创建任务
- `job:start(jobId)`：开始执行
- `job:pause(jobId)`：暂停
- `job:resume(jobId)`：继续
- `job:cancel(jobId)`：取消
- `job:deleteOutput(taskId)`：删除结果
- `job:export(jobId)`：导出 zip

### 6.2 事件接口
- `job:progress`：进度变更
- `job:task-updated`：单任务状态更新
- `job:rate-limit`：触发限额及剩余时间
- `job:done`：任务完成
- `job:error`：任务级/系统级错误

### 6.3 设计约束
- IPC payload 统一 schema 校验（建议 zod）
- 所有路径在主进程进行白名单校验
- 渲染进程不直接访问 Node 敏感能力（contextIsolation=true）

---

## 7. 自动化执行设计（Playwright）

### 7.1 稳定性策略
1. 优先语义定位（`getByRole/getByLabel`）
2. 兜底 CSS/XPath（集中在 selectors.ts）
3. 所有动作前显式 `waitFor` + 可见性校验
4. 点击后同时监听 DOM 与网络结果

### 7.2 状态机
- `idle -> running -> done`
- `running -> waiting_rate_limit -> running`
- `running -> paused -> running`
- `running -> error`（可重试）
- `any -> cancelled`

### 7.3 重试策略
- 可重试错误：元素超时、上传失败、下载失败、短时网络失败
- 不可重试错误：未登录、账号封禁、页面结构重大变更
- 指数退避：`1s -> 2s -> 4s`

### 7.4 Rate Limit 处理
- 文案匹配：`try again`, `rate limit`, `请稍后`, `请等待xx分钟`
- 正则解析分钟数，解析失败则使用默认 15 分钟
- UI 展示倒计时，倒计时结束自动恢复

---

## 8. 文件结构建议

```text
PicFactory/
  src/
    main/
      index.ts
      ipc/
        jobHandlers.ts
      services/
        jobScheduler.ts
        playwrightRunner.ts
        fileService.ts
      models/
        types.ts
    renderer/
      app/
        store/
          jobStore.ts
        pages/
          TaskConfigPage.tsx
          ProgressPage.tsx
          ResultPage.tsx
        components/
          Dropzone.tsx
          PromptEditor.tsx
          TaskTable.tsx
          ThumbnailGrid.tsx
  docs/
    mvp-dev-spec.md
```

---

## 9. UI 页面最小集合

1. 任务配置页
- 图片导入
- 提示词维护
- 任务预览与开始按钮

2. 执行监控页
- 当前执行项
- 进度条/统计
- 日志流
- 暂停/继续/取消

3. 结果管理页
- 分类缩略图
- 选中删除
- 导出

---

## 10. 非功能要求

### 10.1 性能
- 单任务调度延迟 < 300ms（不含网页生成时间）
- 100 个任务下 UI 保持可交互（60fps 非强制，不卡死）

### 10.2 稳定性
- 自动化流程成功率目标：> 90%（页面结构稳定情况下）
- 崩溃后可基于本地 job 快照恢复

### 10.3 安全
- 不存储账号密码
- 不绕过平台登录与权限流程
- 日志脱敏（路径、账户信息）

---

## 11. 迭代计划（两周 MVP）

### Milestone 1（D1-D3）
- Electron + React 工程初始化
- IPC 通道打通
- 任务数据结构与本地持久化

### Milestone 2（D4-D7）
- Playwright 基础流程跑通（单任务）
- 上传/提交/等待/下载闭环
- 基础错误处理

### Milestone 3（D8-D10）
- 批量队列 + 暂停继续取消
- Rate limit 自动暂停恢复

### Milestone 4（D11-D14）
- 结果管理页
- 删除与导出
- 回归测试与打包

---

## 12. 验收标准（MVP）

1. 用户可导入 >= 20 张图片，且每张配置 >= 3 条提示词
2. 系统可连续执行并完成批量任务，失败项可重试
3. 遇到限额可自动暂停并在倒计时结束后恢复
4. 结果按参考图维度归档，UI 可预览与删除
5. 全流程有明确进度与错误提示

---

## 13. 风险与应对

1. ChatGPT 页面结构变动
- 应对：选择器集中管理 + 版本化 + 健康检查

2. 频繁限额影响吞吐
- 应对：节流提交、夜间执行模式、分批运行

3. 下载行为受浏览器策略影响
- 应对：统一浏览器配置与下载目录，失败回退到截图保存

4. 法务/合规风险
- 应对：仅自动化用户已授权会话；避免绕过平台限制

---

## 14. 下一步实施建议

1. 先完成 `main/services/playwrightRunner.ts` 的单任务闭环。
2. 再接入 `jobScheduler.ts` 实现队列与状态机。
3. 最后补 UI 控制与结果管理，形成可用 MVP。

