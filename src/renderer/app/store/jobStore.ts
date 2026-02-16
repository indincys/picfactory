import { create } from 'zustand';
import type {
  ChatGPTAuthStateEvent,
  CreateJobPayload,
  GenerationTask,
  JobBundle,
  JobDoneEvent,
  JobErrorEvent,
  JobProgressEvent,
  RateLimitEvent,
  TaskStatus,
  UpdateStateEvent
} from '../../../shared/contracts';

type Page = 'config' | 'progress' | 'results';

interface JobStore {
  page: Page;
  currentJob: JobBundle | null;
  progress: JobProgressEvent | null;
  rateLimit: RateLimitEvent | null;
  authState: ChatGPTAuthStateEvent | null;
  updateState: UpdateStateEvent | null;
  lastError: string | null;
  logs: string[];
  listenersReady: boolean;

  setPage: (page: Page) => void;
  initializeIpc: () => void;
  createJob: (payload: CreateJobPayload) => Promise<JobBundle>;
  startJob: (jobId: string) => Promise<void>;
  pauseJob: (jobId: string) => Promise<void>;
  resumeJob: (jobId: string) => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
  deleteOutput: (taskId: string) => Promise<void>;
  checkAuthStatus: () => Promise<ChatGPTAuthStateEvent>;
  openChatGPTWeb: () => Promise<ChatGPTAuthStateEvent>;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  quitAndInstallUpdate: () => Promise<void>;
}

export const useJobStore = create<JobStore>((set, get) => ({
  page: 'config',
  currentJob: null,
  progress: null,
  rateLimit: null,
  authState: null,
  updateState: null,
  lastError: null,
  logs: [],
  listenersReady: false,

  setPage: (page) => set({ page }),

  initializeIpc: () => {
    if (get().listenersReady) {
      return;
    }

    window.picFactory.onProgress((event) => {
      set((state) => ({
        progress: event,
        logs: appendLog(state.logs, progressLogText(event))
      }));
    });

    window.picFactory.onTaskUpdated((task) => {
      set((state) => {
        if (!state.currentJob) {
          return state;
        }

        const tasks = state.currentJob.tasks.map((item) => (item.id === task.id ? task : item));
        return {
          currentJob: {
            ...state.currentJob,
            tasks
          }
        };
      });
    });

    window.picFactory.onRateLimit((event) => {
      set((state) => ({
        rateLimit: event,
        logs: appendLog(state.logs, `触发频率限制：等待 ${event.waitSeconds} 秒（恢复时间 ${event.resumeAtIso}）`)
      }));
    });

    window.picFactory.onDone((event: JobDoneEvent) => {
      set((state) => ({
        page: 'results',
        logs: appendLog(state.logs, `任务结束，状态：${toStatusLabel(event.finalStatus)}`)
      }));
    });

    window.picFactory.onError((event: JobErrorEvent) => {
      set((state) => ({
        lastError: event.message,
        logs: appendLog(state.logs, `错误：${event.message}`)
      }));
    });

    window.picFactory.onAuthState((event) => {
      set((state) => {
        const nextLogs =
          event.message && shouldAppendAuthLog(state.authState, event)
            ? appendLog(state.logs, `登录状态：${event.message}`)
            : state.logs;

        return {
          authState: event,
          logs: nextLogs
        };
      });
    });

    window.picFactory.onUpdateState((event) => {
      set((state) => {
        const nextLogs =
          event.message && shouldAppendUpdateLog(state.updateState, event)
            ? appendLog(state.logs, `更新：${event.message}`)
            : state.logs;

        return {
          updateState: event,
          logs: nextLogs
        };
      });
    });

    void window.picFactory
      .getAuthState()
      .then((state) => {
        set({ authState: state });
        return window.picFactory.checkAuthStatus();
      })
      .then((state) => {
        set({ authState: state });
      })
      .catch(() => undefined);

    void window.picFactory
      .getUpdateState()
      .then((state) => {
        set({ updateState: state });
      })
      .catch(() => undefined);

    set({ listenersReady: true });
  },

  createJob: async (payload) => {
    const bundle = await window.picFactory.createJob(payload);
    set((state) => ({
      currentJob: bundle,
      progress: {
        jobId: bundle.id,
        completed: 0,
        total: bundle.tasks.length,
        status: 'queued'
      },
      page: 'progress',
      lastError: null,
      logs: appendLog(state.logs, `已创建任务批次 ${bundle.id}，共 ${bundle.tasks.length} 个子任务。`)
    }));
    return bundle;
  },

  startJob: async (jobId) => {
    await window.picFactory.startJob(jobId);
  },

  pauseJob: async (jobId) => {
    await window.picFactory.pauseJob(jobId);
  },

  resumeJob: async (jobId) => {
    await window.picFactory.resumeJob(jobId);
  },

  cancelJob: async (jobId) => {
    await window.picFactory.cancelJob(jobId);
  },

  deleteOutput: async (taskId) => {
    await window.picFactory.deleteOutput(taskId);
    set((state) => {
      if (!state.currentJob) {
        return state;
      }

      const tasks: GenerationTask[] = state.currentJob.tasks.map((task) =>
        task.id === taskId ? { ...task, outputPaths: [] } : task
      );

      return {
        currentJob: {
          ...state.currentJob,
          tasks
        }
      };
    });
  },

  checkAuthStatus: async () => {
    const state = await window.picFactory.checkAuthStatus();
    set({ authState: state });
    return state;
  },

  openChatGPTWeb: async () => {
    const state = await window.picFactory.openChatGPTWeb();
    set({ authState: state });
    return state;
  },

  checkForUpdates: async () => {
    const state = await window.picFactory.checkForUpdates();
    set({ updateState: state });
  },

  downloadUpdate: async () => {
    const state = await window.picFactory.downloadUpdate();
    set({ updateState: state });
  },

  quitAndInstallUpdate: async () => {
    await window.picFactory.quitAndInstallUpdate();
  }
}));

function appendLog(currentLogs: string[], entry: string): string[] {
  const timestamped = `[${new Date().toLocaleTimeString()}] ${entry}`;
  return [...currentLogs.slice(-199), timestamped];
}

function progressLogText(progress: JobProgressEvent): string {
  const statusText = `${progress.completed}/${progress.total}（${toStatusLabel(progress.status)}）`;
  if (progress.message) {
    return `${statusText} - ${progress.message}`;
  }

  return statusText;
}

function toStatusLabel(status: TaskStatus): string {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'running':
      return '执行中';
    case 'waiting_rate_limit':
      return '限额等待';
    case 'paused':
      return '已暂停';
    case 'done':
      return '已完成';
    case 'error':
      return '异常';
    case 'cancelled':
      return '已取消';
    default:
      return status;
  }
}

function shouldAppendAuthLog(previous: ChatGPTAuthStateEvent | null, current: ChatGPTAuthStateEvent): boolean {
  if (!current.message) {
    return false;
  }

  if (!previous) {
    return true;
  }

  if (previous.stage !== current.stage) {
    return true;
  }

  return previous.message !== current.message;
}

function shouldAppendUpdateLog(previous: UpdateStateEvent | null, current: UpdateStateEvent): boolean {
  if (!current.message) {
    return false;
  }

  if (!previous) {
    return true;
  }

  if (previous.stage !== current.stage) {
    return true;
  }

  if (current.stage === 'downloaded' && previous.targetVersion !== current.targetVersion) {
    return true;
  }

  return false;
}
