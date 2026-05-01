import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Minio from "minio";
import { IStorageProvider } from "./storage.provider.interface";

/**
 * MinioStorageProvider
 *
 * Implements IStorageProvider using MinIO (S3-compatible).
 *
 * Key differences from LocalStorageProvider:
 *   - save()            → uploads buffer directly to MinIO
 *   - resolve()         → returns the object key (not a file path)
 *   - presignedPutUrl() → generates a presigned PUT URL for direct browser upload
 *   - presignedGetUrl() → generates a presigned GET URL for direct browser download
 *
 * Object key convention: {folder}/{filename}
 *   e.g. uploads/abc123-input.mp4
 *        outputs/abc123-output.mp4
 */
@Injectable()
export class MinioStorageProvider implements IStorageProvider {
    private readonly logger = new Logger(MinioStorageProvider.name);
    private readonly client: Minio.Client;
    private readonly bucket: string;
    private readonly presignedPutExpiry: number;
    private readonly presignedGetExpiry: number;

    constructor(private readonly config: ConfigService) {
        this.bucket = this.config.get<string>("app.storage.minio.bucket")!;
        this.presignedPutExpiry = this.config.get<number>(
            "app.storage.minio.presignedPutExpiry",
        )!;
        this.presignedGetExpiry = this.config.get<number>(
            "app.storage.minio.presignedGetExpiry",
        )!;

        this.client = new Minio.Client({
            endPoint: this.config.get<string>("app.storage.minio.endpoint")!,
            port: this.config.get<number>("app.storage.minio.port")!,
            useSSL: this.config.get<boolean>("app.storage.minio.useSSL")!,
            accessKey: this.config.get<string>("app.storage.minio.accessKey")!,
            secretKey: this.config.get<string>("app.storage.minio.secretKey")!,
        });
    }

    /**
     * Upload a buffer directly to MinIO.
     * Used for small files that NestJS already has in memory (e.g. generated VTT files).
     * For large video files, use presignedPutUrl() instead.
     */
    async save(
        filename: string,
        buffer: Buffer,
        folder: "uploads" | "outputs" | "temp",
    ): Promise<string> {
        const key = `${folder}/${filename}`;
        await this.client.putObject(this.bucket, key, buffer, buffer.length);
        this.logger.debug(`Uploaded to MinIO: ${key}`);
        return key;
    }

    /**
     * Returns the object key as-is.
     * Use presignedGetUrl() to get a URL the browser or Colab can actually fetch.
     */
    resolve(storedPath: string): string {
        return storedPath;
    }

    async delete(storedPath: string): Promise<void> {
        await this.client.removeObject(this.bucket, storedPath);
        this.logger.debug(`Deleted from MinIO: ${storedPath}`);
    }

    async exists(storedPath: string): Promise<boolean> {
        try {
            await this.client.statObject(this.bucket, storedPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Generate a presigned PUT URL.
     * Browser uploads directly to MinIO using this URL — NestJS never touches the file bytes.
     */
    async presignedPutUrl(key: string): Promise<string> {
        return this.client.presignedPutObject(
            this.bucket,
            key,
            this.presignedPutExpiry,
        );
    }

    /**
     * Generate a presigned GET URL.
     * Used for Colab to download the input video and for the browser to download output.
     */
    async presignedGetUrl(key: string): Promise<string> {
        return this.client.presignedGetObject(
            this.bucket,
            key,
            this.presignedGetExpiry,
        );
    }

    /**
     * Ensure the configured bucket exists.
     * Call once on application startup (MinioStorageProvider is a singleton).
     */
    async ensureBucket(): Promise<void> {
        const exists = await this.client.bucketExists(this.bucket);
        if (!exists) {
            await this.client.makeBucket(this.bucket);
            this.logger.log(`Created MinIO bucket: ${this.bucket}`);
        } else {
            this.logger.debug(`MinIO bucket exists: ${this.bucket}`);
        }
    }
}
