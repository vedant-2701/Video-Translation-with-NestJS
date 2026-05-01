/**
 * IStorageProvider — Strategy interface for file storage.
 *
 * Implementing a new driver (e.g. MinIO, S3) only requires
 * implementing this interface and registering it in StorageModule.
 * Zero changes to upload/download modules.
 */
export interface IStorageProvider {
    /**
     * Save an incoming file buffer to storage.
     * Returns the stored path/key.
     */
    save(
        filename: string,
        buffer: Buffer,
        folder: "uploads" | "outputs" | "temp",
    ): Promise<string>;

    /**
     * Resolve the full readable path/URL for a stored file.
     */
    resolve(storedPath: string): string;

    /**
     * Delete a file from storage.
     */
    delete(storedPath: string): Promise<void>;

    /**
     * Check if a file exists.
     */
    exists(storedPath: string): Promise<boolean>;
}

/**
 * IPresignedStorageProvider — extended interface for drivers that support
 * presigned URLs (MinIO, S3).
 *
 * Use isPresignedProvider() type guard before calling these methods.
 * LocalStorageProvider does NOT implement this.
 */
export interface IPresignedStorageProvider extends IStorageProvider {
    presignedPutUrl(key: string): Promise<string>;
    presignedGetUrl(key: string): Promise<string>;
}

/**
 * Type guard — narrows IStorageProvider to IPresignedStorageProvider.
 * Use wherever presigned URL methods are needed.
 */
export function isPresignedProvider(
    provider: IStorageProvider,
): provider is IPresignedStorageProvider {
    return (
        typeof (provider as any).presignedPutUrl === "function" &&
        typeof (provider as any).presignedGetUrl === "function"
    );
}

export const STORAGE_PROVIDER = "STORAGE_PROVIDER";
