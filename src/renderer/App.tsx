import { useEffect } from 'react';
import type { BrowserMode, ChatGPTAuthStage, ChatGPTAuthStateEvent, UpdateStage, UpdateStateEvent } from '../shared/contracts';
import { useJobStore } from './app/store/jobStore';
import { ProgressPage } from './app/pages/ProgressPage';
import { ResultPage } from './app/pages/ResultPage';
import { TaskConfigPage } from './app/pages/TaskConfigPage';

export function App(): JSX.Element {
  const page = useJobStore((state) => state.page);
  const setPage = useJobStore((state) => state.setPage);
  const initializeIpc = useJobStore((state) => state.initializeIpc);
  const authState = useJobStore((state) => state.authState);
  const browserMode = useJobStore((state) => state.browserMode);
  const setBrowserMode = useJobStore((state) => state.setBrowserMode);
  const checkAuthStatus = useJobStore((state) => state.checkAuthStatus);
  const openChatGPTWeb = useJobStore((state) => state.openChatGPTWeb);
  const updateState = useJobStore((state) => state.updateState);
  const checkForUpdates = useJobStore((state) => state.checkForUpdates);
  const downloadUpdate = useJobStore((state) => state.downloadUpdate);
  const quitAndInstallUpdate = useJobStore((state) => state.quitAndInstallUpdate);

  useEffect(() => {
    initializeIpc();
  }, [initializeIpc]);

  const authStage = authState?.stage ?? 'unknown';
  const updateStage = updateState?.stage ?? 'idle';
  const isBusy = updateStage === 'checking' || updateStage === 'downloading' || updateStage === 'installing';

  const onUpdateAction = async () => {
    if (updateStage === 'available') {
      await downloadUpdate();
      return;
    }

    if (updateStage === 'downloaded') {
      await quitAndInstallUpdate();
      return;
    }

    if (updateStage === 'unsupported' || updateStage === 'downloading' || updateStage === 'checking') {
      return;
    }

    if (updateStage === 'installing') {
      return;
    }

    await checkForUpdates();
  };

  return (
    <div className="min-h-screen bg-deep text-slate-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        <header className="glass-card mb-6 animate-floatin p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">PicFactory 图片自动化工具</h1>
              <p className="mt-1 text-sm text-slate-600">批量调用 ChatGPT 网页版出图，支持中断恢复与结果管理。</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className={getAuthBadgeClassName(authStage)}>登录状态：{getAuthStageLabel(authStage)}</span>
                <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white text-xs">
                  <ModeButton
                    active={browserMode === 'isolated'}
                    label="独立模式"
                    onClick={() => {
                      void setBrowserMode('isolated');
                    }}
                  />
                  <ModeButton
                    active={browserMode === 'system_chrome'}
                    label="稳定模式"
                    onClick={() => {
                      void setBrowserMode('system_chrome');
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void openChatGPTWeb();
                  }}
                  disabled={authStage === 'busy'}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  打开网页版
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void checkAuthStatus();
                  }}
                  disabled={authStage === 'checking' || authStage === 'busy'}
                  className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {authStage === 'checking' ? '检查中...' : '刷新登录'}
                </button>
              </div>
              <div className="text-right text-xs text-slate-600">
                <div>{formatAuthSummary(authState)}</div>
                <div>{getBrowserModeHint(browserMode)}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">{formatUpdateSummary(updateState)}</span>
                <button
                  type="button"
                  onClick={() => {
                    void onUpdateAction();
                  }}
                  disabled={isBusy || updateStage === 'unsupported'}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    updateStage === 'downloaded'
                      ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                      : updateStage === 'available'
                        ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  } disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                >
                  {getUpdateButtonLabel(updateState)}
                </button>
              </div>
            </div>
          </div>
        </header>

        <nav className="mb-6 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:w-[420px]">
          <TabButton active={page === 'config'} onClick={() => setPage('config')} label="任务配置" />
          <TabButton active={page === 'progress'} onClick={() => setPage('progress')} label="执行进度" />
          <TabButton active={page === 'results'} onClick={() => setPage('results')} label="结果管理" />
        </nav>

        {page === 'config' ? <TaskConfigPage /> : null}
        {page === 'progress' ? <ProgressPage /> : null}
        {page === 'results' ? <ResultPage /> : null}
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

interface ModeButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

function ModeButton({ active, label, onClick }: ModeButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1.5 transition ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      {label}
    </button>
  );
}

function TabButton({ active, onClick, label }: TabButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm transition ${
        active
          ? 'bg-amber-400 text-slate-950 shadow-[0_8px_22px_rgba(251,191,36,0.28)]'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function getUpdateButtonLabel(state: UpdateStateEvent | null): string {
  const stage = state?.stage ?? 'idle';

  switch (stage) {
    case 'checking':
      return '检查中...';
    case 'available':
      return '下载更新';
    case 'downloading':
      return `下载中 ${Math.round(state?.progressPercent ?? 0)}%`;
    case 'downloaded':
      return '重启安装';
    case 'installing':
      return '安装中...';
    case 'unsupported':
      return '自动更新未启用';
    default:
      return '检查更新';
  }
}

function formatAuthSummary(state: ChatGPTAuthStateEvent | null): string {
  if (!state) {
    return '登录状态：初始化中';
  }

  const detail = state.message ? `（${state.message}）` : '';
  return `登录检查：${new Date(state.checkedAtIso).toLocaleTimeString()} ${detail}`;
}

function getBrowserModeHint(mode: BrowserMode): string {
  if (mode === 'system_chrome') {
    return '稳定模式：复用本机 Chrome 登录态（建议先关闭所有 Chrome 窗口）。';
  }

  return '独立模式：使用应用内置浏览器，会话互不影响。';
}

function getAuthStageLabel(stage: ChatGPTAuthStage): string {
  switch (stage) {
    case 'checking':
      return '检查中';
    case 'logged_in':
      return '已登录';
    case 'logged_out':
      return '未登录';
    case 'busy':
      return '任务执行中';
    case 'error':
      return '检查失败';
    default:
      return '未知';
  }
}

function getAuthBadgeClassName(stage: ChatGPTAuthStage): string {
  const base = 'rounded-full border px-3 py-1 text-xs';

  switch (stage) {
    case 'logged_in':
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
    case 'logged_out':
      return `${base} border-rose-200 bg-rose-50 text-rose-700`;
    case 'checking':
      return `${base} border-amber-200 bg-amber-50 text-amber-700`;
    case 'busy':
      return `${base} border-slate-300 bg-slate-100 text-slate-600`;
    case 'error':
      return `${base} border-rose-200 bg-rose-50 text-rose-700`;
    default:
      return `${base} border-slate-200 bg-slate-100 text-slate-600`;
  }
}

function formatUpdateSummary(state: UpdateStateEvent | null): string {
  if (!state) {
    return '更新状态：初始化中';
  }

  const stageText = getUpdateStageLabel(state.stage);
  const versionText = state.targetVersion ? ` -> v${state.targetVersion}` : '';
  return `更新状态：${stageText}${versionText}`;
}

function getUpdateStageLabel(stage: UpdateStage): string {
  switch (stage) {
    case 'idle':
      return '待检查';
    case 'checking':
      return '检查中';
    case 'available':
      return '有新版本';
    case 'not_available':
      return '已是最新';
    case 'downloading':
      return '下载中';
    case 'downloaded':
      return '已下载';
    case 'installing':
      return '安装中';
    case 'error':
      return '更新失败';
    case 'unsupported':
      return '未启用';
    default:
      return stage;
  }
}
