import {
    Injectable,
    Inject,
    Logger,
    BadRequestException,
    InternalServerErrorException,
    NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import { InitUploadDto } from "./dto/init-upload.dto";
import { ConfirmUploadDto } from "./dto/confirm-upload.dto";
import { JobRepository } from "../jobs/job.repository";
import {
    STORAGE_PROVIDER,
    type IStorageProvider,
    isPresignedProvider,
} from "../../storage/storage.provider.interface";
import { JobStatus } from "../../shared/job-schema";

@Injectable()
export class UploadService {
    private readonly logger = new Logger(UploadService.name);

    constructor(
        private readonly config: ConfigService,
        private readonly jobRepository: JobRepository,
        @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    ) {}

    /**
     * Step 1: Create a PENDING job and return a presigned PUT URL.
     * Browser uses the URL to upload directly to MinIO.
     */
    async initUpload(dto: InitUploadDto) {
        const maxMb = this.config.get<number>("app.maxFileSizeMb", 500);
        if (dto.fileSizeMb > maxMb) {
            throw new BadRequestException(
                `File size ${dto.fileSizeMb}MB exceeds limit of ${maxMb}MB`,
            );
        }

        if (!isPresignedProvider(this.storage)) {
            throw new InternalServerErrorException(
                "Storage driver does not support presigned uploads. Set STORAGE_DRIVER=s3.",
            );
        }

        const jobId = uuidv4();
        const ext = path.extname(dto.filename).toLowerCase();
        const s3Key = `uploads/${jobId}-input${ext}`;

        // Create PENDING job row
        await this.jobRepository.create({
            id: jobId,
            status: JobStatus.PENDING,
            sourceLanguage: dto.sourceLanguage,
            targetLanguage: dto.targetLanguage,
            inputFilename: dto.filename,
            s3InputKey: s3Key,
        });

        // Generate presigned PUT URL — browser uploads directly here
        const bucket = this.config.get<string>("app.storage.s3.bucket");
        let presignedUrl: string;
        
        // Check if storage provider has generatePresignedPutUrl method
        if (typeof (this.storage as any).generatePresignedPutUrl === "function") {
            const result = await (this.storage as any).generatePresignedPutUrl(
                { key: s3Key },
                bucket,
            );
            presignedUrl = result.upload_url;
        } else {
            presignedUrl = await this.storage.presignedPutUrl(s3Key);
        }

        this.logger.log(`Upload initiated: job=${jobId} key=${s3Key} bucket=${bucket}`);

        return {
            jobId,
            presignedUrl,
            s3Key,
        };
    }

    /**
     * Step 2: Browser confirms upload completed.
     * Verify file exists in MinIO, then transition job PENDING → QUEUED.
     * Colab picks up QUEUED jobs on its next poll.
     */
    async confirmUpload(jobId: string, dto: ConfirmUploadDto) {
        const job = await this.jobRepository.findById(jobId);

        if (job.status !== JobStatus.PENDING) {
            throw new BadRequestException(
                `Job ${jobId} is not in PENDING state (current: ${job.status})`,
            );
        }

        // Verify file actually landed in MinIO before queuing
        const exists = await this.storage.exists(dto.s3Key);
        if (!exists) {
            throw new NotFoundException(
                `File not found in storage at key: ${dto.s3Key}. ` +
                    `Upload may have failed — try again.`,
            );
        }

        await this.jobRepository.updateStatus(jobId, JobStatus.QUEUED);

        this.logger.log(`Job ${jobId} confirmed and queued`);

        return {
            jobId,
            status: JobStatus.QUEUED,
            message: "Upload confirmed. Job queued for translation.",
        };
    }
}
