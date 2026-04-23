import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { JobRepository } from '../jobs/job.repository';
import { STORAGE_PROVIDER, type IStorageProvider } from '../../storage/storage.provider.interface';
import { JobStatus } from '../../../../../shared/job-schema';
import * as path from 'path';

@Injectable()
export class DownloadService {
  constructor(
    private readonly jobRepository: JobRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  async resolveOutput(jobId: string): Promise<{ filePath: string; filename: string }> {
    const job = await this.jobRepository.findById(jobId);

    if (job.status !== JobStatus.COMPLETED) {
      throw new BadRequestException(
        `Job is not complete yet. Current status: ${job.status}`,
      );
    }

    const filePath = this.storage.resolve(job.outputPath!);
    const filename = `translated-${job.inputFilename}`;

    return { filePath, filename };
  }
}