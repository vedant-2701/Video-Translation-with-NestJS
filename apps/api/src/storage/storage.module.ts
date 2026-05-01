import { Module, Global, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
    STORAGE_PROVIDER,
    IStorageProvider,
} from "./storage.provider.interface";
import { LocalStorageProvider } from "./local-storage.provider";
import { MinioStorageProvider } from "./minio-storage.provider";
import { S3StorageProvider } from "./s3-storage.provider";

/**
 * StorageModule
 *
 * Selects the correct IStorageProvider based on STORAGE_DRIVER env var:
 *   local → LocalStorageProvider  (default, dev)
 *   minio → MinioStorageProvider  (production, Colab flow)
 *   s3   → S3StorageProvider      (AWS S3)
 */
@Global()
@Module({
    providers: [
        LocalStorageProvider,
        MinioStorageProvider,
        S3StorageProvider,
        {
            provide: STORAGE_PROVIDER,
            inject: [ConfigService, LocalStorageProvider, MinioStorageProvider, S3StorageProvider],
            useFactory: (
                config: ConfigService,
                local: LocalStorageProvider,
                minio: MinioStorageProvider,
                s3: S3StorageProvider,
            ): IStorageProvider => {
                const driver = config.get<string>(
                    "app.storage.driver",
                    "local",
                );
                switch (driver) {
                    case "minio":
                        return minio;
                    case "s3":
                        return s3;
                    case "local":
                    default:
                        return local;
                }
            },
        },
    ],
    exports: [STORAGE_PROVIDER],
})
export class StorageModule implements OnApplicationBootstrap {
    constructor(
        private readonly config: ConfigService,
        private readonly minio: MinioStorageProvider,
        private readonly s3: S3StorageProvider,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.config.get<string>("app.storage.driver") === "minio") {
            await this.minio.ensureBucket();
        }
    }
}
