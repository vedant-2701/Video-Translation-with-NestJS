import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobRepository } from './job.repository';

@Module({
  controllers: [JobsController],
  providers: [JobsService, JobRepository],
  exports: [JobRepository],
})
export class JobsModule {}