interface ThumbnailGridProps {
  paths: string[];
}

export function ThumbnailGrid({ paths }: ThumbnailGridProps): JSX.Element {
  if (paths.length === 0) {
    return <p className="text-sm text-slate-500">暂无已生成图片。</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {paths.map((absolutePath) => (
        <figure key={absolutePath} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <img src={`file://${absolutePath}`} alt={absolutePath} className="aspect-square w-full object-cover" loading="lazy" />
          <figcaption className="truncate px-2 py-1 text-[11px] text-slate-500">{absolutePath.split(/[\\/]/).pop()}</figcaption>
        </figure>
      ))}
    </div>
  );
}
