import { Controller, Get, Param } from '@nestjs/common';
import { DownloadService } from './download.service';

@Controller('download')
export class DownloadController {
    constructor(private readonly downloadService: DownloadService) {}

    /**
     * GET /api/download/:jobId
     *
     * Returns a presigned MinIO GET URL.
     * Browser fetches the video directly from MinIO using this URL.
     * NestJS no longer proxies the video bytes.
     *
     * Response: { url: string, filename: string }
     */
    @Get(':jobId')
    async downloadVideo(@Param('jobId') jobId: string) {
        return this.downloadService.resolveOutput(jobId);
    }
}