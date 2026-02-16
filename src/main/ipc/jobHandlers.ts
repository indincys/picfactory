import * as path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import {
  ChatGPTAuthStateEvent,
  CreateJobPayload,
  GenerationTask,
  IPCChannels,
  JobDoneEvent,
  JobErrorEvent,
  JobProgressEvent,
  RateLimitEvent,
  UpdateStateEvent
} from '../../shared/contracts';
import { FileService } from '../services/fileService';
import { JobScheduler } from '../services/jobScheduler';
import { PlaywrightRunner } from '../services/playwrightRunner';
import { UpdateService } from '../services/updateService';

const fileService = new FileService();
const runner = new PlaywrightRunner(fileService);
const scheduler = new JobScheduler(runner, fileService);
const updateService = new UpdateService();
let handlersRegistered = false;

export function registerJobHandlers(getMainWindow: () => BrowserWindow | null): void {
  if (handlersRegistered) {
    return;
  }
  handlersRegistered = true;

  ipcMain.handle(IPCChannels.jobCreate, async (_event, payload: CreateJobPayload) => {
    const resolvedPayload: Required<CreateJobPayload> = {
      ...payload,
      outputDir:
        payload.outputDir ??
        path.join(app.getPath('downloads'), 'PicFactory', `job-${new Date().toISOString().slice(0, 10)}`)
    };

    return scheduler.createJob(resolvedPayload);
  });

  ipcMain.handle(IPCChannels.jobStart, (_event, jobId: string) => {
    scheduler.start(jobId);
  });

  ipcMain.handle(IPCChannels.jobPause, (_event, jobId: string) => {
    scheduler.pause(jobId);
  });

  ipcMain.handle(IPCChannels.jobResume, (_event, jobId: string) => {
    scheduler.resume(jobId);
  });

  ipcMain.handle(IPCChannels.jobCancel, (_event, jobId: string) => {
    scheduler.cancel(jobId);
  });

  ipcMain.handle(IPCChannels.jobDeleteOutput, async (_event, taskId: string) => {
    await scheduler.deleteOutput(taskId);
  });

  ipcMain.handle(IPCChannels.jobExport, async () => {
    throw new Error('导出功能暂未实现。');
  });

  ipcMain.handle(IPCChannels.authGetState, async () => {
    return runner.getAuthState();
  });

  ipcMain.handle(IPCChannels.authCheck, async () => {
    return runner.checkAuthStatus();
  });

  ipcMain.handle(IPCChannels.authOpenWeb, async () => {
    return runner.openChatGPTWeb();
  });

  ipcMain.handle(IPCChannels.updaterGetState, async () => {
    return updateService.getState();
  });

  ipcMain.handle(IPCChannels.updaterCheck, async () => {
    return updateService.checkForUpdates();
  });

  ipcMain.handle(IPCChannels.updaterDownload, async () => {
    return updateService.downloadUpdate();
  });

  ipcMain.handle(IPCChannels.updaterQuitAndInstall, async () => {
    updateService.quitAndInstall();
  });

  scheduler.on('progress', (event: JobProgressEvent) => {
    safeSend(getMainWindow(), IPCChannels.eventProgress, event);
  });

  scheduler.on('task-updated', (task: GenerationTask) => {
    safeSend(getMainWindow(), IPCChannels.eventTaskUpdated, task);
  });

  scheduler.on('rate-limit', (event: RateLimitEvent) => {
    safeSend(getMainWindow(), IPCChannels.eventRateLimit, event);
  });

  scheduler.on('done', (event: JobDoneEvent) => {
    safeSend(getMainWindow(), IPCChannels.eventDone, event);
  });

  scheduler.on('error-event', (event: JobErrorEvent) => {
    safeSend(getMainWindow(), IPCChannels.eventError, event);
  });

  runner.on('auth-state', (event: ChatGPTAuthStateEvent) => {
    safeSend(getMainWindow(), IPCChannels.eventAuthState, event);
  });

  updateService.on('state', (event: UpdateStateEvent) => {
    safeSend(getMainWindow(), IPCChannels.eventUpdaterState, event);
  });

  updateService.initialize();
}

function safeSend(window: BrowserWindow | null, channel: string, payload: unknown): void {
  if (!window) {
    return;
  }

  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }

  window.webContents.send(channel, payload);
}
