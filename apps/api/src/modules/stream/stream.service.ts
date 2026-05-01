import {
    Injectable,
    Inject,
    NotFoundException,
    BadRequestException,
} from "@nestjs/common";
import { JobRepository } from "../jobs/job.repository";
import {
    STORAGE_PROVIDER,
    type IStorageProvider,
    isPresignedProvider,
} from "../../storage/storage.provider.interface";
import * as fs from "fs";
import * as path from "path";

export interface StreamTarget {
    // Local driver: filePath + fileSize set, presignedUrl null
    filePath?: string;
    fileSize?: number;
    // MinIO driver: presignedUrl set, filePath + fileSize null
    presignedUrl?: string;
    mimeType: string;
    filename: string;
}

const MIME_MAP: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/mp4",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
};

@Injectable()
export class StreamService {
    constructor(
        private readonly jobRepository: JobRepository,
        @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    ) {}

    async resolveInput(jobId: string): Promise<StreamTarget> {
        const job = await this.jobRepository.findById(jobId);

        if (isPresignedProvider(this.storage) && job.s3InputKey) {
            const url = await this.storage.presignedGetUrl(job.s3InputKey);
            return {
                presignedUrl: url,
                mimeType: this._mime(job.inputFilename),
                filename: job.inputFilename,
            };
        }

        // Local driver fallback
        return this._localTarget(job.inputPath!, job.inputFilename);
    }

    async resolveOutput(jobId: string): Promise<StreamTarget> {
        const job = await this.jobRepository.findById(jobId);

        if (job.status !== "COMPLETED") {
            throw new BadRequestException(
                `Job is not complete yet. Current status: ${job.status}`,
            );
        }

        if (isPresignedProvider(this.storage) && job.s3OutputKey) {
            const url = await this.storage.presignedGetUrl(job.s3OutputKey);
            const filename = `translated-${job.inputFilename}`;
            return {
                presignedUrl: url,
                mimeType: this._mime(filename),
                filename,
            };
        }

        // Local driver fallback
        if (!job.outputPath) {
            throw new NotFoundException("Output file path not recorded");
        }
        const filename = `translated-${job.inputFilename}`;
        return this._localTarget(job.outputPath, filename);
    }

    private _localTarget(storedPath: string, filename: string): StreamTarget {
        const filePath = this.storage.resolve(storedPath);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException(`File not found: ${filename}`);
        }
        return {
            filePath,
            fileSize: fs.statSync(filePath).size,
            mimeType: this._mime(filename),
            filename,
        };
    }

    private _mime(filename: string): string {
        const ext = path.extname(filename).toLowerCase();
        return MIME_MAP[ext] ?? "video/mp4";
    }
}
