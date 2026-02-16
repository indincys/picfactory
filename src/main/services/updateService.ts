import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateStateEvent } from '../../shared/contracts';

const AUTO_CHECK_DELAY_MS = 2_500;

export class UpdateService extends EventEmitter {
  private state: UpdateStateEvent = {
    stage: 'idle',
    currentVersion: app.getVersion(),
    message: '可手动检查更新'
  };

  private initialized = false;

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

    autoUpdater.quitAndInstall();
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
}

function normalizeFeedUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function formatUpdaterError(error: unknown): string {
  if (error instanceof Error) {
    return `更新失败：${error.message}`;
  }

  return '更新失败：未知错误';
}
