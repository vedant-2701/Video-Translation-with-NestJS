import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { UploadModule } from "./modules/upload/upload.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { DownloadModule } from "./modules/download/download.module";
import { HealthModule } from "./modules/health/health.module";
import { StorageModule } from "./storage/storage.module";
import { DatabaseModule } from "./common/database/database.module";
import appConfig from "./common/config/app.config";
import { EventsModule } from "./modules/events/events.module";
import { AppLoggerModule } from "./common/logger/logger.module";
import { JobCleanupModule } from "./common/jobs/job-cleanup.module";
import { StreamModule } from "./modules/stream/stream.module";
import { WorkerModule } from "./modules/worker/worker.module";

// BullMQ removed from root — no longer used for job queuing.
// Colab polls NestJS directly via HTTP (/api/worker/next-queued).
// JobCleanupModule: if it used BullMQ internally, check and update it separately.

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            load: [appConfig],
            envFilePath: ".env",
        }),

        AppLoggerModule,
        DatabaseModule,
        StorageModule,
        // JobCleanupModule,

        HealthModule,
        EventsModule,
        UploadModule,
        JobsModule,
        DownloadModule,
        StreamModule,
        WorkerModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
