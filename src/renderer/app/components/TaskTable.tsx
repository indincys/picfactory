import type { CreateJobImageInput } from '../../../shared/contracts';

interface TaskTableProps {
  refs: CreateJobImageInput[];
  prompts: string[];
}

export function TaskTable({ refs, prompts }: TaskTableProps): JSX.Element {
  const previewRows = refs.slice(0, 8).flatMap((ref) => prompts.slice(0, 3).map((prompt) => ({ ref, prompt })));
  const total = refs.length * prompts.length;

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">任务预览</h3>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">总数：{total}</span>
      </div>

      {total === 0 ? (
        <p className="text-sm text-slate-500">请先导入参考图和提示词，以生成任务列表。</p>
      ) : (
        <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2">参考图</th>
                <th className="px-3 py-2">提示词</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, idx) => (
                <tr key={`${row.ref.filePath}-${idx}`} className="border-t border-slate-100 text-slate-700">
                  <td className="px-3 py-2">{row.ref.fileName ?? row.ref.filePath.split(/[\\/]/).pop()}</td>
                  <td className="px-3 py-2">{row.prompt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
