import {
    Controller,
    Post,
    Body,
    Param,
    Logger,
    BadRequestException,
} from "@nestjs/common";
import { UploadService } from "./upload.service";
import { InitUploadDto } from "./dto/init-upload.dto";
import { ConfirmUploadDto } from "./dto/confirm-upload.dto";

/**
 * UploadController
 *
 * New two-step upload flow (replaces multipart POST):
 *
 * Step 1 — POST /api/upload/init
 *   Browser sends { filename, sourceLanguage, targetLanguage, fileSizeMb }.
 *   NestJS creates a PENDING job, generates a MinIO presigned PUT URL,
 *   and returns { jobId, presignedUrl, s3Key }.
 *   Browser uploads directly to MinIO using the presigned URL.
 *
 * Step 2 — POST /api/upload/:jobId/confirm
 *   Browser calls this after the PUT to MinIO succeeds.
 *   NestJS verifies the file exists in MinIO, updates job → QUEUED.
 *   Colab will pick it up on its next poll.
 */
@Controller("upload")
export class UploadController {
    private readonly logger = new Logger(UploadController.name);

    constructor(private readonly uploadService: UploadService) {}

    @Post("init")
    async initUpload(@Body() dto: InitUploadDto) {
        return this.uploadService.initUpload(dto);
    }

    @Post(":jobId/confirm")
    async confirmUpload(
        @Param("jobId") jobId: string,
        @Body() dto: ConfirmUploadDto,
    ) {
        return this.uploadService.confirmUpload(jobId, dto);
    }
}
