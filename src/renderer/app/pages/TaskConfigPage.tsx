import { useMemo, useState } from 'react';
import type { CreateJobImageInput } from '../../../shared/contracts';
import { Dropzone } from '../components/Dropzone';
import { PromptEditor } from '../components/PromptEditor';
import { TaskTable } from '../components/TaskTable';
import { useJobStore } from '../store/jobStore';

const DEFAULT_PROMPTS = `白底产品主图，干净背景，影棚光，超清细节\n生活化场景图，暖色光线，自然阴影，写实风格`;

export function TaskConfigPage(): JSX.Element {
  const [refs, setRefs] = useState<CreateJobImageInput[]>([]);
  const [promptText, setPromptText] = useState(DEFAULT_PROMPTS);
  const [submitting, setSubmitting] = useState(false);

  const createJob = useJobStore((state) => state.createJob);
  const startJob = useJobStore((state) => state.startJob);
  const checkAuthStatus = useJobStore((state) => state.checkAuthStatus);
  const setPage = useJobStore((state) => state.setPage);

  const prompts = useMemo(
    () =>
      promptText
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    [promptText]
  );

  const taskCount = refs.length * prompts.length;

  const onSubmit = async () => {
    if (refs.length === 0 || prompts.length === 0) {
      return;
    }

    setSubmitting(true);
    try {
      const authState = await checkAuthStatus();
      if (authState.stage !== 'logged_in') {
        window.alert('当前 ChatGPT 未登录或状态异常，请先在右上角点击“打开网页版”确认登录后再开始任务。');
        return;
      }

      const bundle = await createJob({ refs, prompts });
      await startJob(bundle.id);
      setPage('progress');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Dropzone files={refs} onChange={setRefs} />
        <PromptEditor value={promptText} onChange={setPromptText} />
      </div>

      <div className="space-y-4">
        <div className="panel p-4">
          <h3 className="text-sm font-semibold text-slate-900">配置概览</h3>
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <MetricCard label="参考图" value={String(refs.length)} />
            <MetricCard label="提示词" value={String(prompts.length)} />
            <MetricCard label="任务数" value={String(taskCount)} />
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || taskCount === 0}
            className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {submitting ? '正在创建任务...' : '创建并开始执行'}
          </button>

          <p className="mt-2 text-xs text-slate-500">本地联调建议使用 `PICFACTORY_MOCK_RUNNER=1`，无需真实操作 ChatGPT 页面。</p>
        </div>

        <TaskTable refs={refs} prompts={prompts} />
      </div>
    </section>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
}

function MetricCard({ label, value }: MetricCardProps): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
