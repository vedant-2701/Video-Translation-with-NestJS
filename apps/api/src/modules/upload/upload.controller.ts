import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ConfigService } from '@nestjs/config';
import { UploadService } from './upload.service';
import { UploadVideoDto } from './dto/upload-video.dto';
import { VideoFileValidationPipe } from '../../common/pipes/video-file-validation.pipe';

@Controller('upload')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(
    private readonly uploadService: UploadService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /api/upload
   *
   * Multipart form-data fields:
   *   - video          : video file (mp4, mov, avi, mkv, webm)
   *   - sourceLanguage : e.g. "en"
   *   - targetLanguage : e.g. "es"
   *
   * Returns job ID immediately. Client polls GET /api/jobs/:jobId.
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('video', {
      storage: memoryStorage(),   // buffer in memory; LocalStorageProvider writes to disk
      limits: {
        fileSize: 500 * 1024 * 1024,  // 500 MB hard cap at multer level
        files: 1,
      },
    }),
  )
  async uploadVideo(
    @UploadedFile(new VideoFileValidationPipe(500)) file: Express.Multer.File,
    @Body() dto: UploadVideoDto,
  ) {
    this.logger.log(
      `Upload received: "${file.originalname}" | ${(file.size / 1024 / 1024).toFixed(2)} MB | ${file.mimetype}`,
    );

    const job = await this.uploadService.handleUpload(file, dto);

    return {
      jobId: job.id,
      status: job.status,
      sourceLanguage: dto.sourceLanguage,
      targetLanguage: dto.targetLanguage,
      message: 'Video queued for translation. Poll /api/jobs/:jobId for status.',
    };
  }
}