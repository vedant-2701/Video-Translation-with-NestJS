import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
    port: parseInt(process.env.PORT ?? "3000", 10),
    nodeEnv: process.env.NODE_ENV ?? "development",
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB ?? "500", 10),

    redis: {
        host: process.env.REDIS_HOST ?? "localhost",
        port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    },

    database: {
        url: process.env.DATABASE_URL ?? "",
    },

    storage: {
        driver: process.env.STORAGE_DRIVER ?? "local",
        localPath: process.env.STORAGE_LOCAL_PATH ?? "./storage",
    },

    jobs: {
        // Minutes before a PROCESSING job is marked timed-out
        timeoutMinutes: parseInt(process.env.JOB_TIMEOUT_MINUTES ?? "30", 10),
        // Hours before completed/failed job files are deleted from disk
        fileRetentionHours: parseInt(
            process.env.FILE_RETENTION_HOURS ?? "24",
            10,
        ),
    },

    log: {
        level: process.env.LOG_LEVEL ?? "info",
    },
}));
