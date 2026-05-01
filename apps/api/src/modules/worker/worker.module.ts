import { Module } from "@nestjs/common";
import { WorkerController } from "./worker.controller";
import { WorkerGuard } from "./worker.guard";
import { JobRepository } from "../jobs/job.repository";
import { EventsModule } from "../events/events.module";

@Module({
    imports: [EventsModule],
    controllers: [WorkerController],
    providers: [WorkerGuard, JobRepository],
})
export class WorkerModule {}
