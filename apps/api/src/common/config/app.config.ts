import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
    port: parseInt(process.env.PORT ?? "3000", 10),
    nodeEnv: process.env.NODE_ENV ?? "development",
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB ?? "500", 10),
    workerSecret: process.env.WORKER_SECRET ?? "change-me",

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
        minio: {
            endpoint: process.env.MINIO_ENDPOINT ?? "localhost",
            port: parseInt(process.env.MINIO_PORT ?? "9000", 10),
            useSSL: process.env.MINIO_USE_SSL === "true",
            accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
            secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
            bucket: process.env.MINIO_BUCKET ?? "video-translation",
            presignedPutExpiry: parseInt(
                process.env.PRESIGNED_PUT_EXPIRY_SECONDS ?? "3600",
                10,
            ),
            presignedGetExpiry: parseInt(
                process.env.PRESIGNED_GET_EXPIRY_SECONDS ?? "86400",
                10,
            ),
            publicUrl: process.env.MINIO_PUBLIC_URL ?? "",
        },
        s3: {
            region: process.env.AWS_REGION ?? "",
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
            bucket: process.env.S3_BUCKET ?? "techreel-raw",
            presignedPutExpiry: parseInt(
                process.env.S3_PRESIGNED_PUT_EXPIRY_SECONDS ?? "300",
                10,
            ),
            presignedGetExpiry: parseInt(
                process.env.S3_PRESIGNED_GET_EXPIRY_SECONDS ?? "3600",
                10,
            ),
        }
    },

    jobs: {
        timeoutMinutes: parseInt(process.env.JOB_TIMEOUT_MINUTES ?? "30", 10),
        fileRetentionHours: parseInt(
            process.env.FILE_RETENTION_HOURS ?? "24",
            10,
        ),
    },

    log: {
        level: process.env.LOG_LEVEL ?? "info",
    },
}));
