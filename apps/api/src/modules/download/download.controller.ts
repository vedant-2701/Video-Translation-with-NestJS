import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { DownloadService } from './download.service';

@Controller('download')
export class DownloadController {
  constructor(private readonly downloadService: DownloadService) {}

  /** GET /api/download/:jobId — stream translated video */
  @Get(':jobId')
  async downloadVideo(@Param('jobId') jobId: string, @Res() res: Response) {
    const { filePath, filename } = await this.downloadService.resolveOutput(jobId);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'video/mp4');

    res.sendFile(filePath, (err) => {
      if (err) throw new NotFoundException('Output file not found on disk');
    });
  }
}