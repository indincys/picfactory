import { contextBridge, ipcRenderer } from 'electron';
import {
  BrowserMode,
  BrowserModeState,
  ChatGPTAuthStateEvent,
  CreateJobPayload,
  GenerationTask,
  IPCChannels,
  JobBundle,
  JobDoneEvent,
  JobErrorEvent,
  JobProgressEvent,
  RateLimitEvent,
  UpdateStateEvent
} from '../shared/contracts';

type Unsubscribe = () => void;

const api = {
  createJob: (payload: CreateJobPayload): Promise<JobBundle> => ipcRenderer.invoke(IPCChannels.jobCreate, payload),
  startJob: (jobId: string): Promise<void> => ipcRenderer.invoke(IPCChannels.jobStart, jobId),
  pauseJob: (jobId: string): Promise<void> => ipcRenderer.invoke(IPCChannels.jobPause, jobId),
  resumeJob: (jobId: string): Promise<void> => ipcRenderer.invoke(IPCChannels.jobResume, jobId),
  cancelJob: (jobId: string): Promise<void> => ipcRenderer.invoke(IPCChannels.jobCancel, jobId),
  deleteOutput: (taskId: string): Promise<void> => ipcRenderer.invoke(IPCChannels.jobDeleteOutput, taskId),
  exportJob: (jobId: string): Promise<void> => ipcRenderer.invoke(IPCChannels.jobExport, jobId),
  getAuthState: (): Promise<ChatGPTAuthStateEvent> => ipcRenderer.invoke(IPCChannels.authGetState),
  checkAuthStatus: (): Promise<ChatGPTAuthStateEvent> => ipcRenderer.invoke(IPCChannels.authCheck),
  openChatGPTWeb: (): Promise<ChatGPTAuthStateEvent> => ipcRenderer.invoke(IPCChannels.authOpenWeb),
  getBrowserMode: (): Promise<BrowserModeState> => ipcRenderer.invoke(IPCChannels.authGetBrowserMode),
  setBrowserMode: (mode: BrowserMode): Promise<BrowserModeState> => ipcRenderer.invoke(IPCChannels.authSetBrowserMode, mode),
  getUpdateState: (): Promise<UpdateStateEvent> => ipcRenderer.invoke(IPCChannels.updaterGetState),
  checkForUpdates: (): Promise<UpdateStateEvent> => ipcRenderer.invoke(IPCChannels.updaterCheck),
  downloadUpdate: (): Promise<UpdateStateEvent> => ipcRenderer.invoke(IPCChannels.updaterDownload),
  quitAndInstallUpdate: (): Promise<void> => ipcRenderer.invoke(IPCChannels.updaterQuitAndInstall),

  onProgress: (handler: (event: JobProgressEvent) => void): Unsubscribe =>
    subscribe(IPCChannels.eventProgress, handler),
  onTaskUpdated: (handler: (task: GenerationTask) => void): Unsubscribe =>
    subscribe(IPCChannels.eventTaskUpdated, handler),
  onRateLimit: (handler: (event: RateLimitEvent) => void): Unsubscribe =>
    subscribe(IPCChannels.eventRateLimit, handler),
  onDone: (handler: (event: JobDoneEvent) => void): Unsubscribe => subscribe(IPCChannels.eventDone, handler),
  onError: (handler: (event: JobErrorEvent) => void): Unsubscribe => subscribe(IPCChannels.eventError, handler),
  onAuthState: (handler: (event: ChatGPTAuthStateEvent) => void): Unsubscribe =>
    subscribe(IPCChannels.eventAuthState, handler),
  onUpdateState: (handler: (event: UpdateStateEvent) => void): Unsubscribe =>
    subscribe(IPCChannels.eventUpdaterState, handler)
};

contextBridge.exposeInMainWorld('picFactory', api);

function subscribe<T>(channel: string, handler: (event: T) => void): Unsubscribe {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => {
    handler(payload);
  };

  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
}
