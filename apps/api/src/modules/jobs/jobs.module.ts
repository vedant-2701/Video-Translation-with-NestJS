import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobRepository } from './job.repository';
import { StorageModule } from '../../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [JobsController],
  providers: [JobsService, JobRepository],
  exports: [JobRepository],
})
export class JobsModule {}