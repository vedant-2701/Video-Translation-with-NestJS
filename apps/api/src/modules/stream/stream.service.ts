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
} from "../../storage/storage.provider.interface";
import * as fs from "fs";
import * as path from "path";

export interface StreamTarget {
    filePath: string;
    fileSize: number;
    mimeType: string;
    filename: string;
}

const MIME_MAP: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/mp4", // serve as mp4 container
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
        return this.buildTarget(job.inputPath, job.inputFilename);
    }

    async resolveOutput(jobId: string): Promise<StreamTarget> {
        const job = await this.jobRepository.findById(jobId);

        if (job.status !== "COMPLETED") {
            throw new BadRequestException(
                `Job is not complete yet. Current status: ${job.status}`,
            );
        }

        if (!job.outputPath) {
            throw new NotFoundException(
                "Output file path not recorded for this job",
            );
        }

        const filename = `translated-${job.inputFilename}`;
        return this.buildTarget(job.outputPath, filename);
    }

    private buildTarget(storedPath: string, filename: string): StreamTarget {
        const filePath = this.storage.resolve(storedPath);

        if (!fs.existsSync(filePath)) {
            throw new NotFoundException(`File not found on disk: ${filename}`);
        }

        const fileSize = fs.statSync(filePath).size;
        const ext = path.extname(filename).toLowerCase();
        const mimeType = MIME_MAP[ext] ?? "video/mp4";

        return { filePath, fileSize, mimeType, filename };
    }
}
