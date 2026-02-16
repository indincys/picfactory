import { useMemo } from 'react';
import type { TaskStatus } from '../../../shared/contracts';
import { useJobStore } from '../store/jobStore';

export function ProgressPage(): JSX.Element {
  const currentJob = useJobStore((state) => state.currentJob);
  const progress = useJobStore((state) => state.progress);
  const rateLimit = useJobStore((state) => state.rateLimit);
  const logs = useJobStore((state) => state.logs);
  const lastError = useJobStore((state) => state.lastError);
  const pauseJob = useJobStore((state) => state.pauseJob);
  const resumeJob = useJobStore((state) => state.resumeJob);
  const cancelJob = useJobStore((state) => state.cancelJob);

  const taskStats = useMemo(() => {
    if (!currentJob) {
      return { done: 0, error: 0, queued: 0, running: 0 };
    }

    return {
      done: currentJob.tasks.filter((task) => task.status === 'done').length,
      error: currentJob.tasks.filter((task) => task.status === 'error').length,
      queued: currentJob.tasks.filter((task) => task.status === 'queued').length,
      running: currentJob.tasks.filter((task) => ['running', 'waiting_rate_limit'].includes(task.status)).length
    };
  }, [currentJob]);

  if (!currentJob || !progress) {
    return (
      <section className="panel p-6">
        <p className="text-sm text-slate-600">当前没有活动任务，请先到“任务配置”页创建任务。</p>
      </section>
    );
  }

  const percent = progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);

  return (
    <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-4">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">执行状态</h2>
            <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{toStatusLabel(progress.status)}</span>
          </div>

          <div className="h-2 overflow-hidden rounded bg-slate-200">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-700">
            已完成 {progress.completed}/{progress.total} 个任务（{percent}%）
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SmallStat label="已完成" value={taskStats.done} />
            <SmallStat label="执行中" value={taskStats.running} />
            <SmallStat label="排队中" value={taskStats.queued} />
            <SmallStat label="失败" value={taskStats.error} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => pauseJob(currentJob.id)}
              className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-300"
            >
              暂停
            </button>
            <button
              type="button"
              onClick={() => resumeJob(currentJob.id)}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-400"
            >
              继续
            </button>
            <button
              type="button"
              onClick={() => cancelJob(currentJob.id)}
              className="rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-400"
            >
              取消
            </button>
          </div>

          {rateLimit ? (
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              触发频率限制，将在 {new Date(rateLimit.resumeAtIso).toLocaleTimeString()} 自动恢复。
            </p>
          ) : null}

          {lastError ? (
            <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{lastError}</p>
          ) : null}
        </div>
      </div>

      <div className="panel p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">执行日志</h2>
        <div className="h-[420px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {logs.length === 0 ? <p>暂无日志。</p> : logs.map((line, idx) => <p key={`${line}-${idx}`}>{line}</p>)}
        </div>
      </div>
    </section>
  );
}

interface SmallStatProps {
  label: string;
  value: number;
}

function SmallStat({ label, value }: SmallStatProps): JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 text-center">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
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
