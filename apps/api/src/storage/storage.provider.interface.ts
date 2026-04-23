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
    folder: 'uploads' | 'outputs' | 'temp',
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

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';