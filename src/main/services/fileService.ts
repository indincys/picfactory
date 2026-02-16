import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export class FileService {
  async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  async saveMockOutput(referencePath: string, baseOutputDir: string, refName: string, promptText: string): Promise<string> {
    const promptSlug = slugify(promptText).slice(0, 80) || 'prompt';
    const refSlug = slugify(refName) || 'reference';
    const ext = path.extname(referencePath) || '.png';

    const targetDir = path.join(baseOutputDir, refSlug, promptSlug);
    await this.ensureDir(targetDir);

    const fileName = `${Date.now()}${ext}`;
    const outputPath = path.join(targetDir, fileName);
    await fs.copyFile(referencePath, outputPath);
    return outputPath;
  }

  async deleteFiles(pathsToDelete: string[]): Promise<void> {
    await Promise.all(
      pathsToDelete.map(async (targetPath) => {
        try {
          await fs.unlink(targetPath);
        } catch {
          // Ignore missing files for idempotent deletion.
        }
      })
    );
  }
}

function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s-_]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}
