import {
    Injectable,
    Inject,
    BadRequestException,
    InternalServerErrorException,
} from "@nestjs/common";
import { JobRepository } from "../jobs/job.repository";
import {
    STORAGE_PROVIDER,
    type IStorageProvider,
    isPresignedProvider,
} from "../../storage/storage.provider.interface";
import { JobStatus } from "../../shared/job-schema";

@Injectable()
export class DownloadService {
    constructor(
        private readonly jobRepository: JobRepository,
        @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    ) {}

    /**
     * Returns a presigned GET URL for the translated video.
     * Browser fetches directly from MinIO — NestJS never proxies the bytes.
     */
    async resolveOutput(
        jobId: string,
    ): Promise<{ url: string; filename: string }> {
        const job = await this.jobRepository.findById(jobId);

        if (job.status !== JobStatus.COMPLETED) {
            throw new BadRequestException(
                `Job is not complete yet. Current status: ${job.status}`,
            );
        }

        if (!job.s3OutputKey) {
            throw new BadRequestException(
                "Output key not recorded — job may have completed without uploading output.",
            );
        }

        if (!isPresignedProvider(this.storage)) {
            throw new InternalServerErrorException(
                "Storage driver does not support presigned URLs.",
            );
        }

        const url = await this.storage.presignedGetUrl(job.s3OutputKey);
        const filename = `translated-${job.inputFilename}`;

        return { url, filename };
    }
}
