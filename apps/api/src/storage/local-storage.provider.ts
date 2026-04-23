import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IStorageProvider } from './storage.provider.interface';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly basePath: string;

  constructor(private readonly config: ConfigService) {
    this.basePath = this.config.get<string>('app.storage.localPath')!;
  }

  async save(
    filename: string,
    buffer: Buffer,
    folder: 'uploads' | 'outputs' | 'temp',
  ): Promise<string> {
    const dir = path.join(this.basePath, folder);
    await fs.mkdir(dir, { recursive: true });

    const storedPath = path.join(folder, filename);
    const fullPath = path.join(this.basePath, storedPath);

    await fs.writeFile(fullPath, buffer);
    this.logger.debug(`Saved file: ${fullPath}`);

    return storedPath;
  }

  resolve(storedPath: string): string {
    return path.join(this.basePath, storedPath);
  }

  async delete(storedPath: string): Promise<void> {
    const fullPath = path.join(this.basePath, storedPath);
    await fs.rm(fullPath, { force: true });
    this.logger.debug(`Deleted file: ${fullPath}`);
  }

  async exists(storedPath: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, storedPath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}