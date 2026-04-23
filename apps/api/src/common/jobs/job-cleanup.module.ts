import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { JobCleanupService } from "./job-cleanup.service";

@Module({
    imports: [ScheduleModule.forRoot()],
    providers: [JobCleanupService],
})
export class JobCleanupModule {}
