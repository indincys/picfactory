import type {
  ChatGPTAuthStateEvent,
  CreateJobPayload,
  GenerationTask,
  JobBundle,
  JobDoneEvent,
  JobErrorEvent,
  JobProgressEvent,
  RateLimitEvent,
  UpdateStateEvent
} from '../../shared/contracts';

declare global {
  interface Window {
    picFactory: {
      createJob: (payload: CreateJobPayload) => Promise<JobBundle>;
      startJob: (jobId: string) => Promise<void>;
      pauseJob: (jobId: string) => Promise<void>;
      resumeJob: (jobId: string) => Promise<void>;
      cancelJob: (jobId: string) => Promise<void>;
      deleteOutput: (taskId: string) => Promise<void>;
      exportJob: (jobId: string) => Promise<void>;
      getAuthState: () => Promise<ChatGPTAuthStateEvent>;
      checkAuthStatus: () => Promise<ChatGPTAuthStateEvent>;
      openChatGPTWeb: () => Promise<ChatGPTAuthStateEvent>;
      getUpdateState: () => Promise<UpdateStateEvent>;
      checkForUpdates: () => Promise<UpdateStateEvent>;
      downloadUpdate: () => Promise<UpdateStateEvent>;
      quitAndInstallUpdate: () => Promise<void>;
      onProgress: (handler: (event: JobProgressEvent) => void) => () => void;
      onTaskUpdated: (handler: (task: GenerationTask) => void) => () => void;
      onRateLimit: (handler: (event: RateLimitEvent) => void) => () => void;
      onDone: (handler: (event: JobDoneEvent) => void) => () => void;
      onError: (handler: (event: JobErrorEvent) => void) => () => void;
      onAuthState: (handler: (event: ChatGPTAuthStateEvent) => void) => () => void;
      onUpdateState: (handler: (event: UpdateStateEvent) => void) => () => void;
    };
  }
}

export {};
