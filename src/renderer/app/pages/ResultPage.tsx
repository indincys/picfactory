import { ThumbnailGrid } from '../components/ThumbnailGrid';
import { useJobStore } from '../store/jobStore';

export function ResultPage(): JSX.Element {
  const currentJob = useJobStore((state) => state.currentJob);
  const deleteOutput = useJobStore((state) => state.deleteOutput);

  if (!currentJob) {
    return (
      <section className="panel p-6">
        <p className="text-sm text-slate-600">当前没有可查看的完成任务。</p>
      </section>
    );
  }

  const doneTasks = currentJob.tasks.filter((task) => task.status === 'done' || task.outputPaths.length > 0);

  return (
    <section className="space-y-4">
      <div className="panel p-4">
        <h2 className="text-sm font-semibold text-slate-900">生成结果</h2>
        <p className="mt-1 text-xs text-slate-500">点击“删除”可移除不满意的本地结果文件。</p>
      </div>

      {doneTasks.length === 0 ? (
        <div className="panel p-6">
          <p className="text-sm text-slate-600">该任务暂无可用输出文件。</p>
        </div>
      ) : (
        doneTasks.map((task) => {
          const prompt = currentJob.prompts.find((item) => item.id === task.promptId);
          const ref = currentJob.refs.find((item) => item.id === task.refImageId);

          return (
            <article key={task.id} className="panel p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">参考图</p>
                  <p className="text-sm text-slate-900">{ref?.fileName ?? task.refImageId}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteOutput(task.id)}
                  className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-400"
                >
                  删除
                </button>
              </div>

              <p className="mb-3 text-sm text-slate-700">{prompt?.text ?? task.promptId}</p>
              <ThumbnailGrid paths={task.outputPaths} />
            </article>
          );
        })
      )}
    </section>
  );
}
