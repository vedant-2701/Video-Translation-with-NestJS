import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { IPresignedStorageProvider } from "./storage.provider.interface";

export interface PresignedPutUrlOptions {
    /** S3 object key - e.g. uploads/{jobId}-input.mp4 */
    key: string;
    /** MIME type - optional */
    contentType?: string;
    /** URL validity window in seconds - default 300 (5 minutes) */
    expiresIn?: number;
}

export interface PresignedPutUrlResult {
    /** The presigned PUT URL - client uploads directly to this */
    upload_url: string;
    /** ISO 8601 expiry timestamp */
    expires_at: string;
}

/**
 * S3StorageProvider
 *
 * Implements IPresignedStorageProvider using AWS S3.
 *
 * Key differences from LocalStorageProvider:
 *   - save()            → uploads buffer directly to S3
 *   - resolve()         → returns the object key (not a file path)
 *   - presignedPutUrl() → generates a presigned PUT URL for direct browser upload
 *   - presignedGetUrl() → generates a presigned GET URL for direct browser download
 *
 * Object key convention: {folder}/{filename}
 *   e.g. uploads/abc123-input.mp4
 *        outputs/abc123-output.mp4
 */
@Injectable()
export class S3StorageProvider implements IPresignedStorageProvider {
    private readonly logger = new Logger(S3StorageProvider.name);
    private readonly client: S3Client;
    private readonly bucket: string;
    private readonly presignedPutExpiry: number;
    private readonly presignedGetExpiry: number;

    constructor(private readonly config: ConfigService) {
        this.bucket = this.config.get<string>("app.storage.s3.bucket") ?? "techreel-raw";
        this.presignedPutExpiry = this.config.get<number>("app.storage.s3.presignedPutExpiry") ?? 300;
        this.presignedGetExpiry = this.config.get<number>("app.storage.s3.presignedGetExpiry") ?? 3600;

        const region = this.config.get<string>("app.storage.s3.region");
        const accessKeyId = this.config.get<string>("app.storage.s3.accessKeyId");
        const secretAccessKey = this.config.get<string>("app.storage.s3.secretAccessKey");

        if (!region || !accessKeyId || !secretAccessKey) {
            this.logger.warn(
                "S3 credentials not fully configured. Check AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY",
            );
        }

        this.client = new S3Client({
            region: region ?? "us-east-1",
            credentials: {
                accessKeyId: accessKeyId ?? "",
                secretAccessKey: secretAccessKey ?? "",
            },
        });

        this.logger.log(
            `S3StorageProvider initialized with bucket: ${this.bucket}, region: ${region}`,
        );
    }

    /**
     * Upload a buffer directly to S3.
     * Used for small files that NestJS already has in memory (e.g. generated VTT files).
     * For large video files, use presignedPutUrl() instead.
     */
    async save(
        filename: string,
        buffer: Buffer,
        folder: "uploads" | "outputs" | "temp",
    ): Promise<string> {
        const key = `${folder}/${filename}`;
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
        });
        await this.client.send(command);
        this.logger.debug(`Uploaded to S3: ${key}`);
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
        const command = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: storedPath,
        });
        await this.client.send(command);
        this.logger.debug(`Deleted from S3: ${storedPath}`);
    }

    async exists(storedPath: string): Promise<boolean> {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: storedPath,
            });
            await this.client.send(command);
            return true;
        } catch (err: unknown) {
            const code = (err as { name?: string })?.name;
            if (code === "NotFound" || code === "NoSuchKey") {
                return false;
            }
            // Unexpected error - log and rethrow
            this.logger.error(`S3 HeadObject failed for key "${storedPath}":`, err);
            throw err;
        }
    }

    /**
     * Generate a presigned PUT URL.
     * Browser uploads directly to S3 using this URL — NestJS never touches the file bytes.
     */
    async presignedPutUrl(key: string, bucket?: string): Promise<string> {
        const targetBucket = bucket || this.bucket;
        const command = new PutObjectCommand({
            Bucket: targetBucket,
            Key: key,
        });
        return getSignedUrl(this.client, command, { expiresIn: this.presignedPutExpiry });
    }

    /**
     * Generate a presigned GET URL.
     * Used for Colab to download the input video and for the browser to download output.
     */
    async presignedGetUrl(key: string, bucket?: string): Promise<string> {
        const targetBucket = bucket || this.bucket;
        const command = new GetObjectCommand({
            Bucket: targetBucket,
            Key: key,
        });
        return getSignedUrl(this.client, command, { expiresIn: this.presignedGetExpiry });
    }

    /**
     * Generate a presigned PUT URL with options (matches previous project pattern).
     * Returns both URL and expiry timestamp.
     */
    async generatePresignedPutUrl(
        options: PresignedPutUrlOptions,
        bucket?: string,
    ): Promise<PresignedPutUrlResult> {
        const targetBucket = bucket || this.bucket;
        const expiresIn = options.expiresIn ?? this.presignedPutExpiry;

        const command = new PutObjectCommand({
            Bucket: targetBucket,
            Key: options.key,
            ...(options.contentType && { ContentType: options.contentType }),
        });

        const upload_url = await getSignedUrl(this.client, command, { expiresIn });
        const expires_at = new Date(Date.now() + expiresIn * 1000).toISOString();

        this.logger.debug(`Presigned PUT URL generated for ${options.key}`);

        return { upload_url, expires_at };
    }

    /**
     * Generate a presigned GET URL with expiry timestamp.
     */
    async generatePresignedGetUrl(
        key: string,
        bucket?: string,
        expiresIn?: number,
    ): Promise<PresignedPutUrlResult> {
        const targetBucket = bucket || this.bucket;
        const expiry = expiresIn ?? this.presignedGetExpiry;

        const command = new GetObjectCommand({
            Bucket: targetBucket,
            Key: key,
        });

        const upload_url = await getSignedUrl(this.client, command, { expiresIn: expiry });
        const expires_at = new Date(Date.now() + expiry * 1000).toISOString();

        this.logger.debug(`Presigned GET URL generated for ${key}`);

        return { upload_url, expires_at };
    }

    /**
     * Verify object exists without downloading it.
     * Uses HeadObject - only fetches metadata, not the body.
     */
    async objectExists(key: string, bucket?: string): Promise<boolean> {
        return this.exists(key); // Implementation already handles exists checks
    }
}