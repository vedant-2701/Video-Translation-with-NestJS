import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { JobRepository } from "../jobs/job.repository";

@Module({
    controllers: [EventsController],
    providers: [EventsService, JobRepository],
    exports: [EventsService],
})
export class EventsModule {}
