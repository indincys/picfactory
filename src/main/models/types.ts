import type { GenerationTask, PromptItem, ReferenceImage } from '../../shared/contracts';

export interface RunnerTaskInput {
  jobId: string;
  task: GenerationTask;
  refImage: ReferenceImage;
  prompt: PromptItem;
  outputDir: string;
}

export interface RunnerTaskResult {
  ok: boolean;
  outputPaths: string[];
  reason?: string;
  retryable?: boolean;
  rateLimitSeconds?: number;
}
