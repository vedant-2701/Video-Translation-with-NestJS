import { Controller, Get, Param } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /** GET /api/jobs/:jobId — poll for status + progress */
  @Get(':jobId')
  async getJob(@Param('jobId') jobId: string) {
    return this.jobsService.getJob(jobId);
  }

  /** GET /api/jobs/:jobId/subtitle-url/:lang — get subtitle VTT URL or text */
  @Get(':jobId/subtitle-url/:lang')
  async getSubtitleUrl(
    @Param('jobId') jobId: string,
    @Param('lang') lang: 'en' | 'hi',
  ) {
    return this.jobsService.getSubtitleUrl(jobId, lang);
  }
}