import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    UseGuards,
    HttpCode,
    HttpStatus,
    Inject,
    Logger,
    NotFoundException,
    Res,
} from "@nestjs/common";
import type { Response } from 'express';
import { WorkerGuard } from "./worker.guard";
import { JobRepository } from "../jobs/job.repository";
import { EventsService } from "../events/events.service";
import { JobStatus, PipelineStage } from "../../shared/job-schema";
import {
    STORAGE_PROVIDER,
    type IStorageProvider,
    type IPresignedStorageProvider,
    isPresignedProvider,
} from "../../storage/storage.provider.interface";

// worker.controller.ts — replace the inline DTOs at the top

import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class WorkerProgressDto {
    @IsNumber()
    @Min(0)
    @Max(100)
    @Type(() => Number)
    progress!: number;

    @IsString()
    stage!: string;

    @IsString()
    @IsOptional()
    message?: string;
}

export class WorkerCompleteDto {
    @IsString()
    s3OutputKey!: string;

    @IsString()
    @IsOptional()
    s3SubtitleEnKey?: string;

    @IsString()
    @IsOptional()
    s3SubtitleHiKey?: string;
}

export class WorkerFailDto {
    @IsString()
    errorMessage!: string;
}

/**
 * WorkerController
 *
 * All endpoints are protected by WorkerGuard (X-Worker-Secret header).
 * Colab is the only caller.
 *
 * Endpoints:
 *   GET  /api/worker/next-queued        — claim oldest QUEUED job atomically
 *   GET  /api/worker/:jobId/input-url   — presigned GET URL for input video
 *   POST /api/worker/:jobId/progress    — update progress + publish SSE event
 *   POST /api/worker/:jobId/complete    — mark COMPLETED, store output key
 *   POST /api/worker/:jobId/fail        — mark FAILED, store error message
 */
@Controller("worker")
@UseGuards(WorkerGuard)
export class WorkerController {
    private readonly logger = new Logger(WorkerController.name);

    constructor(
        private readonly jobRepository: JobRepository,
        private readonly eventsService: EventsService,
        @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    ) {}

    /**
     * Atomically claim the oldest QUEUED job.
     * Sets status → PROCESSING so no other Colab instance picks it up.
     * Returns 204 if no jobs are queued.
     */
    @Get("next-queued")
    async nextQueued(@Res() res: Response) {
        const job = await this.jobRepository.claimNextQueued();

        if (!job) {
            return res.status(204).send();
        }

        this.logger.log(`Job ${job.id} claimed by worker`);

        return res.status(200).json({
            jobId: job.id,
            s3InputKey: job.s3InputKey,
            sourceLanguage: job.sourceLanguage,
            targetLanguage: job.targetLanguage,
            inputFilename: job.inputFilename,
        });
    }

    /**
     * Generate a presigned GET URL so Colab can download the input video
     * directly from MinIO without routing through NestJS.
     */
    @Get(":jobId/input-url")
    async inputUrl(@Param("jobId") jobId: string) {
        const job = await this.jobRepository.findById(jobId);

        if (!job.s3InputKey) {
            throw new NotFoundException("No S3 input key for this job");
        }

        if (!isPresignedProvider(this.storage)) {
            throw new NotFoundException(
                "Storage driver does not support presigned URLs",
            );
        }

        const url = await this.storage.presignedGetUrl(job.s3InputKey);
        return { url };
    }

    /**
     * Colab calls this after each pipeline stage (start + complete).
     * NestJS updates DB and publishes to Redis → SSE fires to browser.
     */
    @Post(":jobId/progress")
    @HttpCode(HttpStatus.NO_CONTENT)
    async progress(
        @Param("jobId") jobId: string,
        @Body() dto: WorkerProgressDto,
    ) {
        this.logger.debug(`Progress update: ${jobId} → ${dto.progress}% / ${dto.stage}`);
        await this.jobRepository.updateProgress(jobId, dto.progress, dto.stage);

        await this.eventsService.publish({
            jobId,
            progress: dto.progress,
            stage: dto.stage,
            message: dto.message,
        });
    }

    /**
     * Colab calls this to get a presigned PUT URL for uploading output files
     * (translated video + VTT subtitle files) directly to MinIO.
     */
    @Post(":jobId/output-upload-url")
    async outputUploadUrl(
        @Param("jobId") jobId: string,
        @Body() body: { s3Key: string },
    ) {
        if (!isPresignedProvider(this.storage)) {
            throw new NotFoundException(
                "Storage driver does not support presigned URLs",
            );
        }
        const url = await this.storage.presignedPutUrl(body.s3Key);
        return { url };
    }

    /**
     * Colab calls this when pipeline completes successfully.
     * s3OutputKey is the MinIO object key for the translated video.
     */
    @Post(":jobId/complete")
    @HttpCode(HttpStatus.NO_CONTENT)
    async complete(
        @Param("jobId") jobId: string,
        @Body() dto: WorkerCompleteDto,
    ) {
        await this.jobRepository.updateStatus(jobId, JobStatus.COMPLETED, {
            progress: 100,
            s3OutputKey: dto.s3OutputKey,
            s3SubtitleEnKey: dto.s3SubtitleEnKey,
            s3SubtitleHiKey: dto.s3SubtitleHiKey,
        });

        await this.eventsService.publish({
            jobId,
            progress: 100,
            stage: PipelineStage.DONE,
            message: "Translation complete",
        });

        this.logger.log(`Job ${jobId} completed → ${dto.s3OutputKey}`);
    }

    /**
     * Colab calls this on any unrecoverable pipeline error.
     */
    @Post(":jobId/fail")
    @HttpCode(HttpStatus.NO_CONTENT)
    async fail(@Param("jobId") jobId: string, @Body() dto: WorkerFailDto) {
        await this.jobRepository.updateStatus(jobId, JobStatus.FAILED, {
            errorMessage: dto.errorMessage,
        });

        await this.eventsService.publish({
            jobId,
            progress: 0,
            stage: PipelineStage.FAILED,
            message: dto.errorMessage,
        });

        this.logger.error(`Job ${jobId} failed: ${dto.errorMessage}`);
    }
}
