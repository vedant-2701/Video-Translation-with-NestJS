import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { JobRepository } from './job.repository';
import {
  STORAGE_PROVIDER,
  type IStorageProvider,
  isPresignedProvider,
} from '../../storage/storage.provider.interface';
import * as fs from 'fs/promises';

@Injectable()
export class JobsService {
  constructor(
    private readonly jobRepository: JobRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  async getJob(jobId: string) {
    const job = await this.jobRepository.findById(jobId);
    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      sourceLanguage: job.sourceLanguage,
      targetLanguage: job.targetLanguage,
      inputFilename: job.inputFilename,
      errorMessage: job.errorMessage ?? null,
      downloadReady: job.status === 'COMPLETED',
      s3SubtitleEnKey: job.s3SubtitleEnKey ?? null,
      s3SubtitleHiKey: job.s3SubtitleHiKey ?? null,
      subtitlesReady: !!(job.s3SubtitleEnKey && job.s3SubtitleHiKey),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  async getSubtitleUrl(jobId: string, lang: 'en' | 'hi') {
    const job = await this.jobRepository.findById(jobId);
    const key =
      lang === 'en' ? job.s3SubtitleEnKey : job.s3SubtitleHiKey;

    if (!key) {
      throw new NotFoundException(`No ${lang} subtitle for job ${jobId}`);
    }

    if (isPresignedProvider(this.storage)) {
      const url = await this.storage.presignedGetUrl(key);
      return { url };
    }

    // Local driver: read file and return as text for blob URL approach
    const filePath = this.storage.resolve(key);
    const text = await fs.readFile(filePath, 'utf-8');
    return { text };
  }
}