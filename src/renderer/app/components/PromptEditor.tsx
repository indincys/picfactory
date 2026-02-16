interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function PromptEditor({ value, onChange }: PromptEditorProps): JSX.Element {
  return (
    <div className="panel p-4">
      <label htmlFor="prompt-editor" className="mb-2 block text-sm font-medium text-slate-700">
        提示词（每行一条）
      </label>
      <textarea
        id="prompt-editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="例如：白底产品图，影棚光，超清细节\n例如：生活化场景，暖光，自然阴影"
        className="h-40 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-amber-400"
      />
      <p className="mt-2 text-xs text-slate-500">建议：每条提示词独立完整，不要依赖上一条对话上下文。</p>
    </div>
  );
}
