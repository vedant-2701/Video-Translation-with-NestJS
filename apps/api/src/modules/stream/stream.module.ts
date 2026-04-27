import { Module } from "@nestjs/common";
import { StreamController } from "./stream.controller";
import { StreamService } from "./stream.service";
import { JobRepository } from "../jobs/job.repository";

@Module({
    controllers: [StreamController],
    providers: [StreamService, JobRepository],
})
export class StreamModule {}
