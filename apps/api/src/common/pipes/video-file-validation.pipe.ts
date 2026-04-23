import {
  PipeTransform,
  Injectable,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';

const ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo',   // .avi
  'video/x-matroska',  // .mkv
  'video/webm',
];

const ALLOWED_EXTENSIONS = ['.mp4', '.mpeg', '.mov', '.avi', '.mkv', '.webm'];

/**
 * VideoFileValidationPipe
 *
 * Validates uploaded video files before they reach the service layer.
 * Checks:
 *   1. File is present
 *   2. MIME type is an allowed video format
 *   3. File extension matches allowed list
 *   4. File size is within the configured limit
 *
 * Applied at controller level — keeps validation out of service logic (SRP).
 */
@Injectable()
export class VideoFileValidationPipe implements PipeTransform {
  private readonly maxSizeBytes: number;

  constructor(maxSizeMb: number = 500) {
    this.maxSizeBytes = maxSizeMb * 1024 * 1024;
  }

  transform(file: Express.Multer.File): Express.Multer.File {
    if (!file) {
      throw new BadRequestException('No video file provided');
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type: "${file.mimetype}". Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    // Validate extension
    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `Invalid file extension: "${ext}". Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }

    // Validate file size
    if (file.size > this.maxSizeBytes) {
      throw new PayloadTooLargeException(
        `File too large: ${(file.size / 1024 / 1024).toFixed(2)} MB. Maximum allowed: ${this.maxSizeBytes / 1024 / 1024} MB`,
      );
    }

    return file;
  }
}