import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { JobRepository } from '../jobs/job.repository';
import { TRANSLATION_QUEUE } from '../../shared/job-schema';

@Module({
  imports: [
    BullModule.registerQueue({ name: TRANSLATION_QUEUE }),
  ],
  controllers: [UploadController],
  providers: [UploadService, JobRepository],
})
export class UploadModule {}