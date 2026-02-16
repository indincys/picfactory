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

export interface CreateJobImageInput {
  filePath: string;
  fileName?: string;
}

export interface CreateJobPayload {
  refs: CreateJobImageInput[];
  prompts: string[];
  outputDir?: string;
}

export interface JobProgressEvent {
  jobId: string;
  completed: number;
  total: number;
  status: TaskStatus;
  currentTaskId?: string;
  message?: string;
}

export interface RateLimitEvent {
  jobId: string;
  waitSeconds: number;
  resumeAtIso: string;
}

export interface JobDoneEvent {
  jobId: string;
  finalStatus: TaskStatus;
}

export interface JobErrorEvent {
  jobId: string;
  message: string;
}

export type UpdateStage =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not_available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported';

export interface UpdateStateEvent {
  stage: UpdateStage;
  currentVersion: string;
  targetVersion?: string;
  progressPercent?: number;
  message?: string;
}

export type ChatGPTAuthStage = 'unknown' | 'checking' | 'logged_in' | 'logged_out' | 'busy' | 'error';

export interface ChatGPTAuthStateEvent {
  stage: ChatGPTAuthStage;
  checkedAtIso: string;
  message?: string;
}

export const IPCChannels = {
  jobCreate: 'job:create',
  jobStart: 'job:start',
  jobPause: 'job:pause',
  jobResume: 'job:resume',
  jobCancel: 'job:cancel',
  jobDeleteOutput: 'job:delete-output',
  jobExport: 'job:export',
  authGetState: 'auth:get-state',
  authCheck: 'auth:check',
  authOpenWeb: 'auth:open-web',
  updaterGetState: 'updater:get-state',
  updaterCheck: 'updater:check',
  updaterDownload: 'updater:download',
  updaterQuitAndInstall: 'updater:quit-and-install',
  eventProgress: 'job:progress',
  eventTaskUpdated: 'job:task-updated',
  eventRateLimit: 'job:rate-limit',
  eventDone: 'job:done',
  eventError: 'job:error',
  eventAuthState: 'auth:state',
  eventUpdaterState: 'updater:state'
} as const;

export type IPCCreateJob = typeof IPCChannels.jobCreate;
