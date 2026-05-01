import { Module } from "@nestjs/common";
import { UploadController } from "./upload.controller";
import { UploadService } from "./upload.service";
import { JobRepository } from "../jobs/job.repository";

@Module({
    controllers: [UploadController],
    providers: [UploadService, JobRepository],
})
export class UploadModule {}
