import { Module } from '@nestjs/common';
import { DownloadController } from './download.controller';
import { DownloadService } from './download.service';
import { JobRepository } from '../jobs/job.repository';

@Module({
  controllers: [DownloadController],
  providers: [DownloadService, JobRepository],
})
export class DownloadModule {}