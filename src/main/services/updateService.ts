import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateStateEvent } from '../../shared/contracts';

const AUTO_CHECK_DELAY_MS = 2_500;
const INSTALL_TRIGGER_TIMEOUT_MS = 10_000;

export class UpdateService extends EventEmitter {
  private state: UpdateStateEvent = {
    stage: 'idle',
    currentVersion: app.getVersion(),
    message: '可手动检查更新'
  };

  private initialized = false;
  private installGuardTimer: ReturnType<typeof setTimeout> | undefined;
  private installTriggeredByUpdater = false;

  initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    if (!app.isPackaged) {
      this.setState({
        stage: 'unsupported',
        message: '开发模式下不可用，请使用安装版测试自动更新。'
      });
      return;
    }

    const customFeedUrl = process.env.PICFACTORY_UPDATE_URL?.trim();
    const bundledConfigPath = path.join(process.resourcesPath, 'app-update.yml');
    const hasBundledConfig = fs.existsSync(bundledConfigPath);

    if (!customFeedUrl && !hasBundledConfig) {
      this.setState({
        stage: 'unsupported',
        message:
          '未配置更新源：请使用 pack:update（GitHub Releases）打包，或设置 PICFACTORY_UPDATE_URL / PICFACTORY_PUBLISH_URL。'
      });
      return;
    }

    if (customFeedUrl) {
      autoUpdater.setFeedURL({
        provider: 'generic',
        channel: 'latest',
        url: normalizeFeedUrl(customFeedUrl)
      });
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      this.setState({
        stage: 'checking',
        message: '正在检查更新...'
      });
    });

    autoUpdater.on('update-available', (info) => {
      this.setState({
        stage: 'available',
        targetVersion: info.version,
        message: `发现新版本 v${info.version}`
      });
    });

    autoUpdater.on('update-not-available', () => {
      this.setState({
        stage: 'not_available',
        targetVersion: undefined,
        progressPercent: undefined,
        message: '当前已是最新版本'
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.max(0, Math.min(100, Math.round(progress.percent ?? 0)));
      this.setState({
        stage: 'downloading',
        progressPercent: percent,
        message: `正在下载更新 ${percent}%`
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.setState({
        stage: 'downloaded',
        targetVersion: info.version,
        progressPercent: 100,
        message: `更新已下载（v${info.version}），点击“重启安装”。`
      });
    });

    autoUpdater.on('error', (error) => {
      this.clearInstallGuardTimer();
      this.setState({
        stage: 'error',
        message: formatUpdaterError(error)
      });
    });

    this.setState({
      stage: 'idle',
      message: '可手动检查更新'
    });

    setTimeout(() => {
      void this.checkForUpdates();
    }, AUTO_CHECK_DELAY_MS);
  }

  getState(): UpdateStateEvent {
    return this.state;
  }

  async checkForUpdates(): Promise<UpdateStateEvent> {
    if (!this.isSupported()) {
      return this.state;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.setState({
        stage: 'error',
        message: formatUpdaterError(error)
      });
    }

    return this.state;
  }

  async downloadUpdate(): Promise<UpdateStateEvent> {
    if (!this.isSupported()) {
      return this.state;
    }

    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.setState({
        stage: 'error',
        message: formatUpdaterError(error)
      });
    }

    return this.state;
  }

  quitAndInstall(): void {
    if (!this.isSupported()) {
      return;
    }

    if (this.state.stage !== 'downloaded') {
      return;
    }

    const installBlockReason = getMacInstallBlockReason();
    if (installBlockReason) {
      this.setState({
        stage: 'error',
        message: installBlockReason
      });
      return;
    }

    this.installTriggeredByUpdater = false;
    this.setState({
      stage: 'installing',
      message: '正在重启并安装更新，请稍候...'
    });

    this.clearInstallGuardTimer();
    this.installGuardTimer = setTimeout(() => {
      if (!this.installTriggeredByUpdater) {
        this.setState({
          stage: 'error',
          message: '未能启动安装流程。请确认应用在“应用程序”目录并重新尝试。'
        });
      }
    }, INSTALL_TRIGGER_TIMEOUT_MS);

    try {
      app.once('before-quit', () => {
        this.installTriggeredByUpdater = true;
        this.clearInstallGuardTimer();
      });
      autoUpdater.quitAndInstall(false, true);
    } catch (error) {
      this.clearInstallGuardTimer();
      this.setState({
        stage: 'error',
        message: formatUpdaterError(error)
      });
    }
  }

  private isSupported(): boolean {
    return this.state.stage !== 'unsupported';
  }

  private setState(patch: Partial<UpdateStateEvent>): void {
    this.state = {
      ...this.state,
      ...patch,
      currentVersion: app.getVersion()
    };

    this.emit('state', this.state);
  }

  private clearInstallGuardTimer(): void {
    if (this.installGuardTimer) {
      clearTimeout(this.installGuardTimer);
      this.installGuardTimer = undefined;
    }
  }
}

function normalizeFeedUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function formatUpdaterError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (/code signature|signature/i.test(message)) {
      return '更新失败：当前安装包未通过签名校验，请安装签名版本后再使用自动更新。';
    }
    if (/apptranslocation|read-only|operation not permitted|permission/i.test(message)) {
      return '更新失败：当前安装位置不支持覆盖安装，请将应用移到“应用程序”目录后重试。';
    }
    return `更新失败：${message}`;
  }

  return '更新失败：未知错误';
}

function getMacInstallBlockReason(): string | undefined {
  if (process.platform !== 'darwin') {
    return undefined;
  }

  const execPath = process.execPath.replace(/\\/g, '/');

  if (execPath.startsWith('/Volumes/')) {
    return '当前应用正在 DMG 镜像中运行，无法自动更新。请先拖到“应用程序”后再打开。';
  }

  if (execPath.includes('/AppTranslocation/')) {
    return '当前应用处于 macOS 安全隔离路径，无法自动更新。请在“应用程序”中打开 PicFactory。';
  }

  const appBundlePath = getAppBundlePath(execPath);
  const homeApplications = process.env.HOME ? `${process.env.HOME}/Applications/` : undefined;
  const installedInApplications =
    appBundlePath.startsWith('/Applications/') || (homeApplications ? appBundlePath.startsWith(homeApplications) : false);

  if (!installedInApplications) {
    return '当前应用不在“应用程序”目录，自动更新可能失败。请移动到“应用程序”后重试。';
  }

  return undefined;
}

function getAppBundlePath(execPath: string): string {
  const marker = '/Contents/MacOS/';
  const markerIndex = execPath.indexOf(marker);
  if (markerIndex >= 0) {
    return execPath.slice(0, markerIndex);
  }

  return path.dirname(path.dirname(path.dirname(execPath)));
}
