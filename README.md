# PicFactory MVP

ChatGPT 图片生成自动化桌面工具（MVP）。

## 技术栈
- Electron（主进程 + 预加载）
- React 18 + TypeScript + Vite
- Tailwind CSS
- Zustand
- Playwright

## 环境要求
- Node.js 20+
- npm 10+
- 安装版内置独立 Playwright 浏览器内核，不依赖本机 Chrome

## 本地开发与测试
1. 安装依赖

```bash
npm install
```

2. 仅测试流程（不真正控制 ChatGPT）

```bash
PICFACTORY_MOCK_RUNNER=1 npm run dev
```

3. 真实执行浏览器自动化（会操作 ChatGPT 网页）

```bash
PICFACTORY_ENABLE_REAL_RUNNER=1 npm run dev
```

如果本地开发首次运行提示缺少浏览器内核，先执行：

```bash
npm run prepare:browsers
```

## 打包安装（macOS）
```bash
npm run pack:mac
```

产物目录：`/Users/qianwanfuhao/Documents/PicFactory/release`

## 应用内自动更新（已接入）
应用顶部已提供：`检查更新` / `下载更新` / `重启安装`。

## 登录预检（已接入）
主页右上角已提供：
- `打开网页版`：打开自动化使用的 ChatGPT 会话窗口，便于提前登录/检查 Cookie。
- `刷新登录`：立即检测登录状态。
- 登录状态标签：已登录/未登录/检查中/任务执行中/检查失败。

创建任务前会先做一次登录预检，未登录时会直接提示，不会进入批量执行流程。

### 方案A（推荐）：GitHub Releases（不需要自建服务器）
不需要安装 GitHub CLI，也不需要自建更新服务器。

当前项目已固定使用仓库：`indincys/picfactory`。

1. 首次发布（手动）打包“带更新源”的安装包：

```bash
npm run pack:update
```

2. 在 GitHub 仓库创建 Release，把 `release` 目录中的文件上传为 Release 资产（至少包含）：
- `PicFactory-版本号-arm64.zip`
- `latest-mac.yml`
- 对应 `.blockmap` 文件

3. 首次用户安装这版后，后续版本可在应用内点击更新，不需要手动覆盖安装 DMG。

### 方案A-Plus（已配置）：推送 Tag 自动发布
仓库已添加 GitHub Actions 自动发布流程：`/Users/qianwanfuhao/Documents/PicFactory/.github/workflows/release.yml`

后续每次升级只需：
1. 修改 `package.json` 的版本号（例如 `0.1.1`）。
2. 提交并推送代码。
3. 创建并推送标签（示例：`git tag v0.1.1 && git push origin v0.1.1`）。
4. GitHub 会自动生成 Release 并上传更新文件。

### 方案B（备用）：自建更新服务器（generic）
```bash
PICFACTORY_PUBLISH_URL=https://你的更新服务器地址/updates npm run pack:update:generic
```

注意：
- macOS 自动更新要求应用已签名（Developer ID）。未签名包可用于本地功能验证，但生产分发时建议补齐签名与公证流程。
- 请从“应用程序”目录运行 PicFactory（不要直接在 DMG 里双击运行），否则“重启安装”可能无法生效。

## 后续升级流程（每次发新版本）
1. 修改 `package.json` 里的 `version`。
2. 执行 `npm run pack:update`。
3. 把新版本产物上传到同一个 GitHub 仓库的新 Release。
4. 已安装旧版本的用户在应用内点击“检查更新”即可升级。

## 核心代码位置
- `/Users/qianwanfuhao/Documents/PicFactory/src/main/services/playwrightRunner.ts`
- `/Users/qianwanfuhao/Documents/PicFactory/src/main/services/jobScheduler.ts`
- `/Users/qianwanfuhao/Documents/PicFactory/src/main/services/updateService.ts`
- `/Users/qianwanfuhao/Documents/PicFactory/src/main/ipc/jobHandlers.ts`
- `/Users/qianwanfuhao/Documents/PicFactory/src/renderer/app/store/jobStore.ts`
