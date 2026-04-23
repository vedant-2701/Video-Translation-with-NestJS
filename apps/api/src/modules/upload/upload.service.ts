import {
    Injectable,
    Inject,
    Logger,
    InternalServerErrorException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { UploadVideoDto } from "./dto/upload-video.dto";
import { JobRepository } from "../jobs/job.repository";
import {
    STORAGE_PROVIDER,
    type IStorageProvider,
} from "../../storage/storage.provider.interface";
import {
    TRANSLATION_QUEUE,
    JobStatus,
    TranslationJobPayload,
} from "../../../../../shared/job-schema";
import * as path from "path";

@Injectable()
export class UploadService {
    private readonly logger = new Logger(UploadService.name);

    constructor(
        @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
        @InjectQueue(TRANSLATION_QUEUE)
        private readonly translationQueue: Queue,
        private readonly jobRepository: JobRepository,
    ) {}

    async handleUpload(file: Express.Multer.File, dto: UploadVideoDto) {
        const jobId = uuidv4();
        const ext = path.extname(file.originalname).toLowerCase();
        const inputFilename = `${jobId}-input${ext}`;
        const outputFilename = `${jobId}-output${ext}`;

        // Step 1 — Save file to storage
        let inputPath: string;
        try {
            inputPath = await this.storage.save(
                inputFilename,
                file.buffer,
                "uploads",
            );
        } catch (err) {
            this.logger.error(
                `Storage write failed for job ${jobId}`,
                (err as Error).message,
            );
            throw new InternalServerErrorException(
                "Failed to store uploaded file",
            );
        }

        const outputPath = path.join("outputs", outputFilename);

        // Step 2 — Create DB record (rollback file on failure)
        let job: Awaited<ReturnType<JobRepository["create"]>>;
        try {
            job = await this.jobRepository.create({
                id: jobId,
                status: JobStatus.QUEUED,
                sourceLanguage: dto.sourceLanguage,
                targetLanguage: dto.targetLanguage,
                inputFilename: file.originalname,
                inputPath,
                outputPath,
            });
        } catch (err) {
            this.logger.error(
                `DB insert failed for job ${jobId} — rolling back file`,
                (err as Error).message,
            );
            await this._safeDeleteFile(inputPath);
            throw new InternalServerErrorException(
                "Failed to create translation job",
            );
        }

        // Step 3 — Enqueue job (rollback file + DB record on failure)
        const payload: TranslationJobPayload = {
            jobId,
            inputPath,
            outputPath,
            sourceLanguage: dto.sourceLanguage,
            targetLanguage: dto.targetLanguage,
        };

        try {
            await this.translationQueue.add("translate", payload, {
                jobId,
                // Job-level timeout — BullMQ marks job as failed if worker takes > 35 min
                // Slightly longer than worker-side timeout to avoid race conditions
                timeout: 35 * 60 * 1000,
            });
        } catch (err) {
            this.logger.error(
                `Queue enqueue failed for job ${jobId} — rolling back`,
                (err as Error).message,
            );
            await this._safeDeleteFile(inputPath);
            // DB record stays (for audit) but with FAILED status
            await this.jobRepository.updateStatus(jobId, JobStatus.FAILED, {
                errorMessage: "Failed to enqueue translation job",
            });
            throw new InternalServerErrorException(
                "Failed to queue translation job",
            );
        }

        this.logger.log(
            `Job ${jobId} created | ${dto.sourceLanguage} → ${dto.targetLanguage} | ${(file.size / 1024 / 1024).toFixed(2)} MB`,
        );

        return job;
    }

    private async _safeDeleteFile(filePath: string): Promise<void> {
        try {
            await this.storage.delete(filePath);
        } catch (cleanupErr) {
            // Log but don't throw — rollback best-effort
            this.logger.warn(
                `Rollback file delete failed for ${filePath}: ${(cleanupErr as Error).message}`,
            );
        }
    }
}
