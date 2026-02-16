import { useRef, type ChangeEvent } from 'react';
import type { CreateJobImageInput } from '../../../shared/contracts';

interface DropzoneProps {
  files: CreateJobImageInput[];
  onChange: (files: CreateJobImageInput[]) => void;
}

export function Dropzone({ files, onChange }: DropzoneProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pickFiles = () => {
    fileInputRef.current?.click();
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = extractSelectedFiles(event.target.files);
    if (selected.length > 0) {
      onChange(uniqueByPath([...files, ...selected]));
    }

    event.target.value = '';
  };

  return (
    <div
      className="panel flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 border-dashed px-4 py-8 text-center text-slate-600 transition hover:border-emerald-400 hover:bg-emerald-50"
      onClick={pickFiles}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const selected = extractSelectedFiles(event.dataTransfer.files);
        if (selected.length > 0) {
          onChange(uniqueByPath([...files, ...selected]));
        }
      }}
    >
      <p className="text-base font-medium text-slate-900">将参考图拖拽到这里</p>
      <p className="max-w-lg text-sm text-slate-500">支持批量导入。可点击此区域选择文件，或从文件管理器直接拖入。</p>
      <button
        type="button"
        className="rounded-lg bg-emerald-400 px-3 py-1.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-300"
      >
        选择图片
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onInputChange}
      />
    </div>
  );
}

function extractSelectedFiles(fileList: FileList | null): CreateJobImageInput[] {
  if (!fileList) {
    return [];
  }

  const output: CreateJobImageInput[] = [];

  for (const file of Array.from(fileList)) {
    const localPath = (file as File & { path?: string }).path;
    if (!localPath) {
      continue;
    }

    output.push({
      filePath: localPath,
      fileName: file.name
    });
  }

  return output;
}

function uniqueByPath(files: CreateJobImageInput[]): CreateJobImageInput[] {
  const map = new Map<string, CreateJobImageInput>();
  for (const file of files) {
    map.set(file.filePath, file);
  }

  return Array.from(map.values());
}
