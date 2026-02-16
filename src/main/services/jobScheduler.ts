import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type {
  CreateJobPayload,
  GenerationTask,
  JobBundle,
  JobDoneEvent,
  JobErrorEvent,
  JobProgressEvent,
  PromptItem,
  RateLimitEvent,
  ReferenceImage,
  TaskStatus
} from '../../shared/contracts';
import type { RunnerTaskResult } from '../models/types';
import { FileService } from './fileService';
import { PlaywrightRunner } from './playwrightRunner';

interface RuntimeControl {
  running: boolean;
  paused: boolean;
  cancelled: boolean;
}

interface RuntimeJob {
  bundle: JobBundle;
  control: RuntimeControl;
}

const MAX_RETRY = 3;

export class JobScheduler extends EventEmitter {
  private readonly jobs = new Map<string, RuntimeJob>();

  constructor(
    private readonly runner: PlaywrightRunner,
    private readonly fileService: FileService
  ) {
    super();
  }

  async createJob(payload: Required<CreateJobPayload>): Promise<JobBundle> {
    const refs = payload.refs.map((ref) => toReferenceImage(ref.filePath, ref.fileName));
    const prompts = payload.prompts
      .map((value) => value.trim())
      .filter(Boolean)
      .map((text) => toPromptItem(text));

    if (refs.length === 0) {
      throw new Error('未检测到参考图片，请先导入图片。');
    }

    if (prompts.length === 0) {
      throw new Error('未检测到提示词，请先输入提示词。');
    }

    await this.fileService.ensureDir(payload.outputDir);

    const tasks: GenerationTask[] = refs.flatMap((ref) =>
      prompts.map((prompt) => ({
        id: makeId('task'),
        refImageId: ref.id,
        promptId: prompt.id,
        status: 'queued',
        retryCount: 0,
        outputPaths: []
      }))
    );

    const bundle: JobBundle = {
      id: makeId('job'),
      createdAt: new Date().toISOString(),
      outputDir: payload.outputDir,
      refs,
      prompts,
      tasks
    };

    this.jobs.set(bundle.id, {
      bundle,
      control: {
        running: false,
        paused: false,
        cancelled: false
      }
    });

    this.emitProgress(bundle.id, 'queued');
    return bundle;
  }

  start(jobId: string): void {
    const runtime = this.mustGetRuntime(jobId);
    runtime.control.paused = false;
    runtime.control.cancelled = false;

    if (runtime.control.running) {
      return;
    }

    runtime.control.running = true;
    void this.run(jobId);
  }

  pause(jobId: string): void {
    const runtime = this.mustGetRuntime(jobId);
    runtime.control.paused = true;

    for (const task of runtime.bundle.tasks) {
      if (task.status === 'queued') {
        task.status = 'paused';
      }
    }

    this.emitProgress(jobId, 'paused');
  }

  resume(jobId: string): void {
    const runtime = this.mustGetRuntime(jobId);
    runtime.control.paused = false;

    for (const task of runtime.bundle.tasks) {
      if (task.status === 'paused') {
        task.status = 'queued';
        this.emit('task-updated', task);
      }
    }

    this.start(jobId);
  }

  cancel(jobId: string): void {
    const runtime = this.mustGetRuntime(jobId);
    runtime.control.cancelled = true;

    for (const task of runtime.bundle.tasks) {
      if (['queued', 'paused', 'running', 'waiting_rate_limit'].includes(task.status)) {
        task.status = 'cancelled';
        this.emit('task-updated', task);
      }
    }

    this.emitProgress(jobId, 'cancelled');
  }

  async deleteOutput(taskId: string): Promise<void> {
    for (const runtime of this.jobs.values()) {
      const task = runtime.bundle.tasks.find((item) => item.id === taskId);
      if (!task) {
        continue;
      }

      await this.fileService.deleteFiles(task.outputPaths);
      task.outputPaths = [];
      this.emit('task-updated', task);
      return;
    }

    throw new Error(`删除失败：未找到任务 ${taskId}`);
  }

  getJob(jobId: string): JobBundle {
    return this.mustGetRuntime(jobId).bundle;
  }

  private mustGetRuntime(jobId: string): RuntimeJob {
    const runtime = this.jobs.get(jobId);
    if (!runtime) {
      throw new Error(`未找到任务批次：${jobId}`);
    }

    return runtime;
  }

  private async run(jobId: string): Promise<void> {
    const runtime = this.mustGetRuntime(jobId);

    try {
      while (true) {
        if (runtime.control.cancelled) {
          this.emitDone(jobId, 'cancelled');
          break;
        }

        if (runtime.control.paused) {
          await sleep(250);
          continue;
        }

        const task = runtime.bundle.tasks.find((item) => item.status === 'queued');
        if (!task) {
          const hasRunning = runtime.bundle.tasks.some((item) =>
            ['running', 'waiting_rate_limit'].includes(item.status)
          );

          if (hasRunning) {
            await sleep(200);
            continue;
          }

          const hasError = runtime.bundle.tasks.some((item) => item.status === 'error');
          const finalStatus: TaskStatus = hasError ? 'error' : 'done';
          this.emitDone(jobId, finalStatus);
          break;
        }

        task.status = 'running';
        this.emit('task-updated', task);
        this.emitProgress(jobId, 'running', task.id);

        const refImage = runtime.bundle.refs.find((item) => item.id === task.refImageId);
        const prompt = runtime.bundle.prompts.find((item) => item.id === task.promptId);

        if (!refImage || !prompt) {
          task.status = 'error';
          task.errorMessage = '任务依赖缺失：未找到参考图或提示词。';
          this.emit('task-updated', task);
          this.emitProgress(jobId, 'error', task.id, task.errorMessage);
          continue;
        }

        const result = await this.runner.runTask({
          jobId,
          task,
          refImage,
          prompt,
          outputDir: runtime.bundle.outputDir
        });

        await this.applyResult(runtime, task, result);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '调度器发生未知错误';
      const payload: JobErrorEvent = { jobId, message };
      this.emit('error-event', payload);
      this.emitProgress(jobId, 'error', undefined, message);
    } finally {
      runtime.control.running = false;
    }
  }

  private async applyResult(runtime: RuntimeJob, task: GenerationTask, result: RunnerTaskResult): Promise<void> {
    const jobId = runtime.bundle.id;

    if (result.ok) {
      task.status = 'done';
      task.outputPaths = result.outputPaths;
      task.errorMessage = undefined;
      this.emit('task-updated', task);
      this.emitProgress(jobId, 'running', task.id);
      return;
    }

    if (result.rateLimitSeconds) {
      task.status = 'waiting_rate_limit';
      task.errorMessage = result.reason;
      this.emit('task-updated', task);

      const event: RateLimitEvent = {
        jobId,
        waitSeconds: result.rateLimitSeconds,
        resumeAtIso: new Date(Date.now() + result.rateLimitSeconds * 1000).toISOString()
      };
      this.emit('rate-limit', event);

      await this.waitForRateLimit(runtime, result.rateLimitSeconds);
      if (runtime.control.cancelled) {
        return;
      }

      task.status = runtime.control.paused ? 'paused' : 'queued';
      this.emit('task-updated', task);
      return;
    }

    task.retryCount += 1;
    task.errorMessage = result.reason ?? '任务执行失败';

    if (result.retryable && task.retryCount <= MAX_RETRY) {
      task.status = runtime.control.paused ? 'paused' : 'queued';
      this.emit('task-updated', task);
      await sleep(backoffMs(task.retryCount));
      return;
    }

    task.status = 'error';
    this.emit('task-updated', task);
    this.emitProgress(jobId, 'error', task.id, task.errorMessage);
  }

  private async waitForRateLimit(runtime: RuntimeJob, waitSeconds: number): Promise<void> {
    let remaining = waitSeconds;

    while (remaining > 0) {
      if (runtime.control.cancelled) {
        return;
      }

      if (runtime.control.paused) {
        await sleep(250);
        continue;
      }

      await sleep(1000);
      remaining -= 1;

      if (remaining % 5 === 0) {
        this.emitProgress(
          runtime.bundle.id,
          'waiting_rate_limit',
          undefined,
          `限额冷却中：剩余 ${remaining} 秒`
        );
      }
    }
  }

  private emitProgress(jobId: string, status: TaskStatus, currentTaskId?: string, message?: string): void {
    const runtime = this.mustGetRuntime(jobId);

    const completed = runtime.bundle.tasks.filter((task) => task.status === 'done').length;
    const payload: JobProgressEvent = {
      jobId,
      completed,
      total: runtime.bundle.tasks.length,
      status,
      currentTaskId,
      message
    };

    this.emit('progress', payload);
  }

  private emitDone(jobId: string, finalStatus: TaskStatus): void {
    this.emitProgress(jobId, finalStatus);
    const payload: JobDoneEvent = { jobId, finalStatus };
    this.emit('done', payload);
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function toReferenceImage(filePath: string, fileName?: string): ReferenceImage {
  const resolvedName = fileName ?? filePath.split(/[\\/]/).pop() ?? 'image';
  return {
    id: makeId('ref'),
    filePath,
    fileName: resolvedName
  };
}

function toPromptItem(text: string): PromptItem {
  return {
    id: makeId('prompt'),
    text
  };
}

function backoffMs(retryCount: number): number {
  return 2 ** (retryCount - 1) * 1000;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
