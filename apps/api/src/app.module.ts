import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
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

@Module({
    imports: [
        // ── Config ─────────────────────────────────────────────
        ConfigModule.forRoot({
            isGlobal: true,
            load: [appConfig],
            envFilePath: ".env",
        }),

        // ── Structured Logging (Pino) ──────────────────────────
        AppLoggerModule,

        // ── Queue (BullMQ + Redis) ─────────────────────────────
        BullModule.forRootAsync({
            useFactory: () => ({
                connection: {
                    host: process.env.REDIS_HOST ?? "localhost",
                    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
                },
                defaultJobOptions: {
                    attempts: 3,
                    backoff: { type: "exponential", delay: 5000 },
                    removeOnComplete: { count: 100 },
                    removeOnFail: { count: 50 },
                },
            }),
        }),

        // ── Infrastructure ─────────────────────────────────────
        DatabaseModule,
        StorageModule,

        // ── Scheduled Tasks ────────────────────────────────────
        JobCleanupModule,

        // ── Feature Modules ────────────────────────────────────
        HealthModule,
        EventsModule,
        UploadModule,
        JobsModule,
        DownloadModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
