import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage.provider.interface';
import { LocalStorageProvider } from './local-storage.provider';

/**
 * StorageModule — registers the correct IStorageProvider implementation
 * based on STORAGE_DRIVER env var.
 *
 * To add MinIO later:
 *   1. Create MinioStorageProvider implements IStorageProvider
 *   2. Add case 'minio' below
 *   Done. No other changes needed.
 */
@Global()
@Module({
  providers: [
    LocalStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, LocalStorageProvider],
      useFactory: (
        config: ConfigService,
        local: LocalStorageProvider,
      ): LocalStorageProvider => {
        const driver = config.get<string>('app.storage.driver', 'local');
        switch (driver) {
          case 'local':
          default:
            return local;
          // case 'minio': return minioProvider;  ← plug in here later
        }
      },
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}