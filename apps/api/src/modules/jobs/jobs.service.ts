import { Injectable } from '@nestjs/common';
import { JobRepository } from './job.repository';

@Injectable()
export class JobsService {
  constructor(private readonly jobRepository: JobRepository) {}

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
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}