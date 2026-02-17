import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { app } from 'electron';
import type { BrowserContext, BrowserType, Locator, Page } from 'playwright';
import type { RunnerTaskInput, RunnerTaskResult } from '../models/types';
import type { ChatGPTAuthStateEvent } from '../../shared/contracts';
import { FileService } from './fileService';
import { chatGPTSelectors } from './chatgptSelectors';

const CHATGPT_URL = 'https://chatgpt.com/';
const DEFAULT_TIMEOUT_MS = 45_000;
const ACTION_TIMEOUT_MS = 15_000;
const GENERATION_TIMEOUT_MS = 240_000;
const DEFAULT_RATE_LIMIT_SECONDS = 15 * 60;
const DEFAULT_LOGIN_WAIT_MS = 5 * 60_000;
let chromiumLoader: Promise<BrowserType> | undefined;

export class PlaywrightRunner extends EventEmitter {
  private manualContext: BrowserContext | undefined;
  private runningTasks = 0;
  private authState: ChatGPTAuthStateEvent = {
    stage: 'unknown',
    checkedAtIso: new Date().toISOString(),
    message: '尚未检查登录状态'
  };

  constructor(private readonly fileService: FileService) {
    super();
  }

  getAuthState(): ChatGPTAuthStateEvent {
    return this.authState;
  }

  async checkAuthStatus(): Promise<ChatGPTAuthStateEvent> {
    if (this.runningTasks > 0) {
      return this.setAuthState({
        stage: 'busy',
        message: '任务执行中，稍后可再次检查登录状态。'
      });
    }

    if (!this.manualContext || !isContextAlive(this.manualContext)) {
      this.manualContext = undefined;
      return this.setAuthState({
        stage: 'unknown',
        message: '请先点击“打开网页版”，在可见窗口中完成 Cloudflare 验证与登录。'
      });
    }

    this.setAuthState({
      stage: 'checking',
      message: '正在检查 ChatGPT 登录状态...'
    });

    try {
      const page = await openChatGPTPage(this.manualContext, false);
      const stage = await detectAuthStage(page);

      if (stage === 'logged_in') {
        return this.setAuthState({
          stage,
          message: '已登录，可直接开始执行任务。'
        });
      }

      if (stage === 'logged_out') {
        return this.setAuthState({
          stage,
          message: '未登录或登录已失效，请点击“打开网页版”先登录。'
        });
      }

      return this.setAuthState({
        stage: 'unknown',
        message: '页面结构暂未识别，请点击“打开网页版”确认登录状态。'
      });
    } catch (error) {
      if (this.manualContext && !isContextAlive(this.manualContext)) {
        this.manualContext = undefined;
      }

      return this.setAuthState({
        stage: 'error',
        message: formatRunnerError(error, '登录状态检查失败')
      });
    }
  }

  async openChatGPTWeb(): Promise<ChatGPTAuthStateEvent> {
    if (this.runningTasks > 0) {
      return this.setAuthState({
        stage: 'busy',
        message: '任务执行中，暂时不能打开登录检查窗口。'
      });
    }

    try {
      if (!this.manualContext || !isContextAlive(this.manualContext)) {
        this.manualContext = await this.launchContext(false);
        this.manualContext.on('close', () => {
          if (!this.manualContext || !isContextAlive(this.manualContext)) {
            this.manualContext = undefined;
          }
        });
      }

      const page = await openChatGPTPage(this.manualContext, true);
      await page.bringToFront().catch(() => undefined);
      return this.checkAuthStatus();
    } catch (error) {
      return this.setAuthState({
        stage: 'error',
        message: formatRunnerError(error, '打开 ChatGPT 网页失败')
      });
    }
  }

  async runTask(input: RunnerTaskInput): Promise<RunnerTaskResult> {
    if (process.env.PICFACTORY_MOCK_RUNNER === '1') {
      await sleep(800);
      const outputPath = await this.fileService.saveMockOutput(
        input.refImage.filePath,
        input.outputDir,
        input.refImage.fileName,
        input.prompt.text
      );

      return {
        ok: true,
        outputPaths: [outputPath]
      };
    }

    const realRunnerEnabled = process.env.PICFACTORY_ENABLE_REAL_RUNNER === '1' || app.isPackaged;
    if (!realRunnerEnabled) {
      return {
        ok: false,
        outputPaths: [],
        retryable: false,
        reason: '真实执行器未启用，请设置 PICFACTORY_ENABLE_REAL_RUNNER=1 后重试（安装版默认启用）。'
      };
    }

    this.runningTasks += 1;
    let context: BrowserContext | undefined;
    let shouldClose = false;

    try {
      const taskOutputDir = buildTaskOutputDir(
        input.outputDir,
        input.refImage.fileName,
        input.prompt.text,
        input.task.id
      );
      await this.fileService.ensureDir(taskOutputDir);
      const contextBinding = await this.acquireTaskContext();
      context = contextBinding.context;
      shouldClose = contextBinding.shouldClose;
      const page = await openChatGPTPage(context, false);

      await ensureLoggedIn(page);
      this.setAuthState({
        stage: 'logged_in',
        message: '已登录，可正常执行任务。'
      });
      await startNewConversation(page);
      await uploadReferenceImage(page, input.refImage.filePath);

      const baselineImageSources = new Set(await collectImageSources(page));
      await submitPrompt(page, input.prompt.text);

      const outputPaths = await collectGeneratedOutputs(page, taskOutputDir, baselineImageSources);
      if (outputPaths.length === 0) {
        throw new Error('未捕获到 ChatGPT 生成结果。');
      }

      return {
        ok: true,
        outputPaths
      };
    } catch (error) {
      if (error instanceof RateLimitDetectedError) {
        return {
          ok: false,
          outputPaths: [],
          retryable: true,
          rateLimitSeconds: error.waitSeconds,
          reason: error.message
        };
      }

      if (error instanceof NonRetryableError) {
        if (/未登录/.test(error.message)) {
          this.setAuthState({
            stage: 'logged_out',
            message: '检测到登录失效，请先点击“打开网页版”重新登录。'
          });
        }

        return {
          ok: false,
          outputPaths: [],
          retryable: false,
          reason: error.message
        };
      }

      const rawMessage = error instanceof Error ? error.message : '自动化执行发生未知错误';
      const message = sanitizeErrorMessage(rawMessage) || '自动化执行发生未知错误';
      const parsedSeconds = parseRateLimitWaitSeconds(message);

      if (parsedSeconds) {
        return {
          ok: false,
          outputPaths: [],
          retryable: true,
          rateLimitSeconds: parsedSeconds,
          reason: message
        };
      }

      if (/未登录|登录/.test(message)) {
        this.setAuthState({
          stage: 'logged_out',
          message: '检测到登录状态异常，请先重新登录后再执行任务。'
        });
      }

      return {
        ok: false,
        outputPaths: [],
        retryable: true,
        reason: message
      };
    } finally {
      this.runningTasks = Math.max(0, this.runningTasks - 1);

      if (shouldClose) {
        await context?.close().catch(() => undefined);
      }
    }
  }

  private async acquireTaskContext(): Promise<{ context: BrowserContext; shouldClose: boolean }> {
    if (this.manualContext && isContextAlive(this.manualContext)) {
      return {
        context: this.manualContext,
        shouldClose: false
      };
    }

    return {
      context: await this.launchContext(process.env.PICFACTORY_HEADLESS === '1'),
      shouldClose: true
    };
  }

  private async launchContext(headless: boolean): Promise<BrowserContext> {
    configurePlaywrightBrowsersPath();
    const chromium = await getChromium();
    const profileDir = resolveProfileDir();
    await this.fileService.ensureDir(profileDir);
    const configuredChannel = process.env.PICFACTORY_BROWSER_CHANNEL?.trim();
    const executablePath = resolveBundledChromiumExecutablePath();
    const context = await chromium.launchPersistentContext(profileDir, {
      headless,
      timeout: DEFAULT_TIMEOUT_MS,
      channel: executablePath ? undefined : configuredChannel,
      executablePath,
      acceptDownloads: true
    });
    context.setDefaultTimeout(ACTION_TIMEOUT_MS);
    return context;
  }

  private setAuthState(patch: Omit<Partial<ChatGPTAuthStateEvent>, 'checkedAtIso'>): ChatGPTAuthStateEvent {
    this.authState = {
      ...this.authState,
      ...patch,
      checkedAtIso: new Date().toISOString()
    };
    this.emit('auth-state', this.authState);
    return this.authState;
  }
}

class RateLimitDetectedError extends Error {
  constructor(
    readonly waitSeconds: number,
    message: string
  ) {
    super(message);
  }
}

class NonRetryableError extends Error {}

function isContextAlive(context: BrowserContext): boolean {
  try {
    const browser = context.browser();
    if (browser && !browser.isConnected()) {
      return false;
    }

    void context.pages();
    return true;
  } catch {
    return false;
  }
}

async function openChatGPTPage(context: BrowserContext, forceNavigate: boolean): Promise<Page> {
  const page = context.pages().find((item) => !item.isClosed()) ?? (await context.newPage());

  if (forceNavigate || !page.url().startsWith('https://chatgpt.com')) {
    await page.goto(CHATGPT_URL, {
      timeout: DEFAULT_TIMEOUT_MS,
      waitUntil: 'domcontentloaded'
    });
  }

  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
  return page;
}

async function detectAuthStage(page: Page): Promise<'logged_in' | 'logged_out' | 'unknown'> {
  const composerReady = await waitForAnySelector(page, chatGPTSelectors.composerInputs, 7_000);
  if (composerReady) {
    return 'logged_in';
  }

  const loginPromptVisible = await isAnySelectorVisible(page, chatGPTSelectors.loginCtas, 2_500);
  if (loginPromptVisible) {
    return 'logged_out';
  }

  return 'unknown';
}

function formatRunnerError(error: unknown, fallback: string): string {
  const detail = sanitizeErrorMessage(error);
  if (!detail) {
    return fallback;
  }

  return `${fallback}：${detail}`;
}

function resolveProfileDir(): string {
  const customPath = process.env.PICFACTORY_PROFILE_DIR?.trim();
  if (customPath) {
    return customPath;
  }

  const userDataDir = resolveSafeUserDataDir();
  return path.join(userDataDir, 'playwright-profile');
}

function resolveSafeUserDataDir(): string {
  try {
    if (app.isReady()) {
      return app.getPath('userData');
    }
  } catch {
    // Fall through.
  }

  const home = process.env.HOME?.trim();
  if (home) {
    return path.join(home, '.picfactory-runtime');
  }

  return path.join(os.tmpdir(), 'picfactory-runtime');
}

function configurePlaywrightBrowsersPath(): void {
  if (!app.isPackaged) {
    return;
  }

  const bundledPath = path.join(process.resourcesPath, 'ms-playwright');
  process.env.PLAYWRIGHT_BROWSERS_PATH = bundledPath;

  if (!fs.existsSync(bundledPath)) {
    throw new Error('安装包缺少内置浏览器组件，请安装最新版本后重试。');
  }
}

function resolveBundledChromiumExecutablePath(): string | undefined {
  if (!app.isPackaged) {
    return undefined;
  }

  const browsersRoot = path.join(process.resourcesPath, 'ms-playwright');
  if (!fs.existsSync(browsersRoot)) {
    return undefined;
  }

  const chromiumDirName = fs
    .readdirSync(browsersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .find((name) => /^chromium-\d+$/.test(name));

  if (!chromiumDirName) {
    return undefined;
  }

  const chromiumRoot = path.join(browsersRoot, chromiumDirName);
  const candidates = getChromiumExecutableCandidates(chromiumRoot);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function getChromiumExecutableCandidates(chromiumRoot: string): string[] {
  if (process.platform === 'darwin') {
    return [
      path.join(
        chromiumRoot,
        'chrome-mac-arm64',
        'Google Chrome for Testing.app',
        'Contents',
        'MacOS',
        'Google Chrome for Testing'
      ),
      path.join(
        chromiumRoot,
        'chrome-mac',
        'Google Chrome for Testing.app',
        'Contents',
        'MacOS',
        'Google Chrome for Testing'
      )
    ];
  }

  if (process.platform === 'win32') {
    return [
      path.join(chromiumRoot, 'chrome-win', 'chrome.exe'),
      path.join(chromiumRoot, 'chrome-win64', 'chrome.exe'),
      path.join(chromiumRoot, 'chrome-win32', 'chrome.exe')
    ];
  }

  return [path.join(chromiumRoot, 'chrome-linux', 'chrome')];
}

async function getChromium(): Promise<BrowserType> {
  if (!chromiumLoader) {
    chromiumLoader = import('playwright').then((module) => module.chromium);
  }

  return chromiumLoader;
}

function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const message = raw.trim();
  if (!message) {
    return '';
  }

  if (/Executable doesn't exist|download new browsers|playwright install/i.test(message)) {
    if (app.isPackaged) {
      return '内置浏览器组件缺失，请重新安装最新版 PicFactory。';
    }
    return '未检测到 Playwright 浏览器，请先执行 npm run prepare:browsers。';
  }

  return message.split('\n')[0].trim();
}

async function ensureLoggedIn(page: Page): Promise<void> {
  const composerReady = await waitForAnySelector(page, chatGPTSelectors.composerInputs, 8_000);
  if (composerReady) {
    return;
  }

  const loginPromptVisible = await isAnySelectorVisible(page, chatGPTSelectors.loginCtas, 2_500);
  if (loginPromptVisible) {
    const waitMs = parsePositiveInt(process.env.PICFACTORY_LOGIN_WAIT_MS) ?? DEFAULT_LOGIN_WAIT_MS;
    const readyAfterLogin = await waitForAnySelector(page, chatGPTSelectors.composerInputs, waitMs);
    if (readyAfterLogin) {
      return;
    }

    throw new NonRetryableError('检测到未登录 ChatGPT，请先登录后再执行任务。');
  }

  throw new NonRetryableError('未找到 ChatGPT 输入框，页面可能尚未就绪或界面结构已变化。');
}

async function startNewConversation(page: Page): Promise<void> {
  const clicked = await clickFirstVisible(page, chatGPTSelectors.newChatButtons, 3_000);
  if (clicked) {
    await sleep(500);
  }
}

async function uploadReferenceImage(page: Page, filePath: string): Promise<void> {
  let fileInput = await getFileInput(page);

  if (!fileInput) {
    await clickFirstVisible(page, chatGPTSelectors.attachButtons, 3_000);
    await sleep(350);
    fileInput = await getFileInput(page);
  }

  if (!fileInput) {
    throw new Error('在 ChatGPT 页面未找到图片上传入口。');
  }

  await fileInput.setInputFiles(filePath);
  await waitForAnySelector(page, chatGPTSelectors.attachmentIndicators, 8_000).catch(() => undefined);
}

async function submitPrompt(page: Page, prompt: string): Promise<void> {
  const composer = await waitForAnySelector(page, chatGPTSelectors.composerInputs, 20_000);
  if (!composer) {
    throw new Error('提交前未找到提示词输入框。');
  }

  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    throw new NonRetryableError('提示词为空，请填写后重试。');
  }

  const tagName = (await composer.evaluate((node) => node.tagName.toLowerCase()).catch(() => '')) || '';

  if (tagName === 'textarea') {
    await composer.fill(normalizedPrompt);
  } else {
    await composer.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => undefined);
    await page.keyboard.type(normalizedPrompt, { delay: 8 });
  }

  const sentByButton = await clickFirstVisible(page, chatGPTSelectors.sendButtons, 2_000);
  if (!sentByButton) {
    await composer.press('Enter');
  }
}

async function collectGeneratedOutputs(
  page: Page,
  taskOutputDir: string,
  baselineImageSources: Set<string>
): Promise<string[]> {
  await waitForGeneration(page, baselineImageSources);

  const downloads = await attemptDownloadOutputs(page, taskOutputDir);
  if (downloads.length > 0) {
    return dedupe(downloads);
  }

  const screenshots = await captureGeneratedImages(page, taskOutputDir, baselineImageSources);
  return dedupe(screenshots);
}

async function waitForGeneration(page: Page, baselineImageSources: Set<string>): Promise<void> {
  const timeoutMs = parsePositiveInt(process.env.PICFACTORY_GENERATION_TIMEOUT_MS) ?? GENERATION_TIMEOUT_MS;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const rateLimit = await detectRateLimit(page);
    if (rateLimit) {
      throw new RateLimitDetectedError(rateLimit.waitSeconds, rateLimit.message);
    }

    const currentSources = await collectImageSources(page);
    const newSources = currentSources.filter((src) => !baselineImageSources.has(src));

    if (newSources.length > 0) {
      return;
    }

    await sleep(1_500);
  }

  throw new Error('等待生成结果超时。');
}

async function attemptDownloadOutputs(page: Page, taskOutputDir: string): Promise<string[]> {
  const outputs: string[] = [];

  for (const selector of chatGPTSelectors.downloadButtons) {
    const elements = page.locator(selector);
    const count = await elements.count();
    if (count === 0) {
      continue;
    }

    for (let index = 0; index < Math.min(count, 4); index += 1) {
      const element = elements.nth(index);
      const visible = await element.isVisible().catch(() => false);
      if (!visible) {
        continue;
      }

      try {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 7_500 }),
          element.click({ timeout: 3_000 })
        ]);

        const suggested = sanitizeFilename(download.suggestedFilename() || `generated-${Date.now()}.png`);
        const filePath = path.join(taskOutputDir, withCounterPrefix(index + 1, suggested));
        await download.saveAs(filePath);
        outputs.push(filePath);
      } catch {
        // Ignore and continue with next candidate button.
      }
    }

    if (outputs.length > 0) {
      return outputs;
    }
  }

  return outputs;
}

async function captureGeneratedImages(
  page: Page,
  taskOutputDir: string,
  baselineImageSources: Set<string>
): Promise<string[]> {
  const captured: string[] = [];
  const selector = chatGPTSelectors.resultImages.join(', ');
  const images = page.locator(selector);
  const count = await images.count();

  for (let index = 0; index < Math.min(count, 8); index += 1) {
    const image = images.nth(index);

    const meta = await image
      .evaluate((node) => {
        if (!node || typeof node !== 'object') {
          return null;
        }

        const candidate = node as {
          currentSrc?: string;
          src?: string;
          naturalWidth?: number;
          width?: number;
          naturalHeight?: number;
          height?: number;
          alt?: string;
        };

        const src = candidate.currentSrc || candidate.src || '';
        const width = candidate.naturalWidth || candidate.width || 0;
        const height = candidate.naturalHeight || candidate.height || 0;
        const alt = (candidate.alt || '').toLowerCase();

        return { src, width, height, alt };
      })
      .catch(() => null);

    if (!meta) {
      continue;
    }

    if (!isLikelyGeneratedImage(meta.src, meta.alt, meta.width, meta.height)) {
      continue;
    }

    if (meta.src && baselineImageSources.has(meta.src)) {
      continue;
    }

    const outputPath = path.join(taskOutputDir, `generated-${Date.now()}-${index + 1}.png`);

    try {
      await image.scrollIntoViewIfNeeded().catch(() => undefined);
      await image.screenshot({ path: outputPath, timeout: 6_000 });
      captured.push(outputPath);
    } catch {
      // Continue; screenshot can fail for detached nodes.
    }
  }

  if (captured.length === 0) {
    const fallbackPath = path.join(taskOutputDir, `generated-fallback-${Date.now()}.png`);
    await page.screenshot({ path: fallbackPath, fullPage: false });
    captured.push(fallbackPath);
  }

  return captured;
}

async function collectImageSources(page: Page): Promise<string[]> {
  const selector = chatGPTSelectors.resultImages.join(', ');

  const sources = await page
    .evaluate((imageSelector) => {
      const items = new Set<string>();
      const root = globalThis as unknown as {
        document?: {
          querySelectorAll: (selector: string) => Iterable<unknown>;
        };
      };
      const nodes = root.document?.querySelectorAll(imageSelector) ?? [];

      for (const node of nodes) {
        if (!node || typeof node !== 'object') {
          continue;
        }

        const candidate = node as {
          currentSrc?: string;
          src?: string;
          alt?: string;
          naturalWidth?: number;
          width?: number;
          naturalHeight?: number;
          height?: number;
        };

        const src = candidate.currentSrc || candidate.src || '';
        const alt = (candidate.alt || '').toLowerCase();
        const width = candidate.naturalWidth || candidate.width || 0;
        const height = candidate.naturalHeight || candidate.height || 0;

        if (!src) {
          continue;
        }

        if (width < 128 || height < 128) {
          continue;
        }

        if (
          src.includes('avatar') ||
          alt.includes('avatar') ||
          alt.includes('profile') ||
          src.includes('/_next/image')
        ) {
          continue;
        }

        items.add(src);
      }

      return Array.from(items);
    }, selector)
    .catch(() => [] as string[]);

  return dedupe(sources);
}

async function detectRateLimit(page: Page): Promise<{ waitSeconds: number; message: string } | undefined> {
  const bodyText = await page
    .locator('body')
    .innerText({ timeout: 1_000 })
    .catch(() => '');

  if (!bodyText) {
    return undefined;
  }

  const normalized = bodyText.toLowerCase();
  const hit =
    normalized.includes('rate limit') ||
    normalized.includes('try again') ||
    normalized.includes('too many requests') ||
    normalized.includes('please wait') ||
    normalized.includes('请稍后') ||
    normalized.includes('请等待') ||
    normalized.includes('达到上限') ||
    normalized.includes('请求过于频繁');

  if (!hit) {
    return undefined;
  }

  const waitSeconds = parseRateLimitWaitSeconds(bodyText) ?? DEFAULT_RATE_LIMIT_SECONDS;
  const summary = bodyText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => /rate limit|try again|too many|请稍后|请等待|上限|频繁/i.test(line));

  return {
    waitSeconds,
    message: summary ?? `检测到频率限制，等待 ${waitSeconds} 秒后重试。`
  };
}

async function getFileInput(page: Page): Promise<Locator | undefined> {
  for (const selector of chatGPTSelectors.fileInputs) {
    const locator = page.locator(selector).first();
    const count = await page.locator(selector).count();
    if (count > 0) {
      return locator;
    }
  }

  return undefined;
}

async function waitForAnySelector(page: Page, selectors: readonly string[], timeoutMs: number): Promise<Locator | undefined> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      const visible = await locator.isVisible().catch(() => false);
      if (visible) {
        return locator;
      }
    }

    await sleep(250);
  }

  return undefined;
}

async function isAnySelectorVisible(page: Page, selectors: readonly string[], timeoutMs: number): Promise<boolean> {
  const found = await waitForAnySelector(page, selectors, timeoutMs);
  return Boolean(found);
}

async function clickFirstVisible(page: Page, selectors: readonly string[], timeoutMs: number): Promise<boolean> {
  const element = await waitForAnySelector(page, selectors, timeoutMs);
  if (!element) {
    return false;
  }

  await element.click({ timeout: 3_000 });
  return true;
}

function buildTaskOutputDir(baseDir: string, refName: string, prompt: string, taskId: string): string {
  return path.join(baseDir, sanitizeFilename(refName), sanitizeFilename(prompt).slice(0, 80), taskId);
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function withCounterPrefix(index: number, fileName: string): string {
  return `${String(index).padStart(2, '0')}-${fileName}`;
}

function sanitizeFilename(raw: string): string {
  const normalized = raw
    .normalize('NFKD')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return normalized || 'item';
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value;
}

function parseRateLimitWaitSeconds(rawMessage: string): number | undefined {
  const minuteMatch = rawMessage.match(/(\d+)\s*(minute|min|分钟)/i);
  if (minuteMatch) {
    const minutes = Number.parseInt(minuteMatch[1], 10);
    if (Number.isFinite(minutes) && minutes > 0) {
      return minutes * 60;
    }
  }

  const secondMatch = rawMessage.match(/(\d+)\s*(second|sec|秒)/i);
  if (secondMatch) {
    const seconds = Number.parseInt(secondMatch[1], 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds;
    }
  }

  const hourMatch = rawMessage.match(/(\d+)\s*(hour|hr|小时)/i);
  if (hourMatch) {
    const hours = Number.parseInt(hourMatch[1], 10);
    if (Number.isFinite(hours) && hours > 0) {
      return hours * 3600;
    }
  }

  return undefined;
}

function isLikelyGeneratedImage(src: string, alt: string, width: number, height: number): boolean {
  if (width < 160 || height < 160) {
    return false;
  }

  if (src.includes('avatar') || alt.includes('avatar') || alt.includes('profile')) {
    return false;
  }

  return true;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
