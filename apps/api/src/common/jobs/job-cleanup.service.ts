import { Injectable, Logger, Inject } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { DATABASE_CLIENT } from "../database/database.module";
import {
    STORAGE_PROVIDER,
    type IStorageProvider,
} from "../../storage/storage.provider.interface";
import postgres from "postgres";

// Jobs stuck in PROCESSING for longer than this are timed out
const JOB_TIMEOUT_MINUTES = 30;

// Completed/failed jobs older than this have their files deleted
const FILE_RETENTION_HOURS = 24;

/**
 * JobCleanupService
 *
 * Two scheduled tasks:
 *
 * 1. timeoutStaleJobs (every 5 min)
 *    Finds jobs stuck in PROCESSING for > JOB_TIMEOUT_MINUTES and marks
 *    them FAILED. Handles worker crashes, OOM kills, network splits.
 *
 * 2. deleteExpiredFiles (every hour)
 *    Deletes input + output files for jobs older than FILE_RETENTION_HOURS.
 *    Prevents unbounded disk growth.
 */
@Injectable()
export class JobCleanupService {
    private readonly logger = new Logger(JobCleanupService.name);

    constructor(
        @Inject(DATABASE_CLIENT) private readonly db: postgres.Sql,
        @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
        private readonly config: ConfigService,
    ) {}

    // ── Task 1: Timeout stale jobs ────────────────────────────

    @Cron(CronExpression.EVERY_5_MINUTES)
    async timeoutStaleJobs(): Promise<void> {
        const cutoff = new Date(Date.now() - JOB_TIMEOUT_MINUTES * 60 * 1000);

        const stale = await this.db<{ id: string }[]>`
      UPDATE translation_jobs
      SET
        status        = 'FAILED',
        error_message = 'Job timed out after ${JOB_TIMEOUT_MINUTES} minutes without completing'
      WHERE
        status    = 'PROCESSING'
        AND updated_at < ${cutoff}
      RETURNING id
    `;

        if (stale.length > 0) {
            this.logger.warn(
                `Timed out ${stale.length} stale job(s): ${stale.map((j) => j.id).join(", ")}`,
            );
        }
    }

    // ── Task 2: Delete expired files ─────────────────────────

    @Cron(CronExpression.EVERY_HOUR)
    async deleteExpiredFiles(): Promise<void> {
        const cutoff = new Date(
            Date.now() - FILE_RETENTION_HOURS * 60 * 60 * 1000,
        );

        const expired = await this.db<
            { id: string; input_path: string; output_path: string | null }[]
        >`
      SELECT id, input_path, output_path
      FROM translation_jobs
      WHERE
        status IN ('COMPLETED', 'FAILED')
        AND updated_at < ${cutoff}
        AND input_path IS NOT NULL
    `;

        if (expired.length === 0) return;

        this.logger.log(
            `Cleaning up files for ${expired.length} expired job(s)`,
        );

        let deleted = 0;
        let errors = 0;

        for (const job of expired) {
            const paths = [job.input_path, job.output_path].filter(
                Boolean,
            ) as string[];

            for (const filePath of paths) {
                try {
                    const exists = await this.storage.exists(filePath);
                    if (exists) {
                        await this.storage.delete(filePath);
                        deleted++;
                    }
                } catch (err) {
                    this.logger.warn(
                        `Failed to delete file ${filePath}: ${(err as Error).message}`,
                    );
                    errors++;
                }
            }

            // Null out paths in DB so we don't attempt deletion again
            await this.db`
        UPDATE translation_jobs
        SET input_path = NULL, output_path = NULL
        WHERE id = ${job.id}
      `;
        }

        this.logger.log(
            `File cleanup complete. Deleted: ${deleted}, Errors: ${errors}`,
        );
    }
}
