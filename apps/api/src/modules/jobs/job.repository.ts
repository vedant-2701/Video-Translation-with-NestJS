import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { DATABASE_CLIENT } from "../../common/database/database.module";
import { JobStatus, JobStatusType } from "../../shared/job-schema";
import postgres from "postgres";

export interface TranslationJob {
    id: string;
    status: JobStatusType;
    sourceLanguage: string;
    targetLanguage: string;
    inputFilename: string;
    inputPath?: string; // local driver only
    outputPath?: string; // local driver only
    s3InputKey?: string; // MinIO driver
    s3OutputKey?: string; // MinIO driver
    s3SubtitleEnKey?: string; // MinIO driver
    s3SubtitleHiKey?: string; // MinIO driver
    currentStage?: string; // updated by Colab on each stage transition
    errorMessage?: string;
    progress: number;
    createdAt: Date;
    updatedAt: Date;
}

@Injectable()
export class JobRepository {
    constructor(@Inject(DATABASE_CLIENT) private readonly db: postgres.Sql) {}

    async create(
        data: Pick<
            TranslationJob,
            | "id"
            | "status"
            | "sourceLanguage"
            | "targetLanguage"
            | "inputFilename"
            | "inputPath"
            | "outputPath"
            | "s3InputKey"
        >,
    ): Promise<TranslationJob> {
        const [row] = await this.db`
            INSERT INTO translation_jobs
                (id, status, source_language, target_language,
                 input_filename, input_path, output_path, s3_input_key)
            VALUES
                (${data.id}, ${data.status}, ${data.sourceLanguage},
                 ${data.targetLanguage}, ${data.inputFilename},
                 ${data.inputPath ?? null}, ${data.outputPath ?? null},
                 ${data.s3InputKey ?? null})
            RETURNING *
        `;
        return this._map(row);
    }

    async findById(id: string): Promise<TranslationJob> {
        const [row] = await this.db`
            SELECT * FROM translation_jobs WHERE id = ${id}
        `;
        if (!row) throw new NotFoundException(`Job ${id} not found`);
        return this._map(row);
    }

    /**
     * Atomically claim the oldest QUEUED job → PROCESSING.
     * Uses SELECT FOR UPDATE SKIP LOCKED so concurrent Colab instances
     * (if ever added) never pick the same job.
     * Returns null if no jobs are queued.
     */
    async claimNextQueued(): Promise<TranslationJob | null> {
        const [row] = await this.db`
            UPDATE translation_jobs
            SET status = ${JobStatus.PROCESSING}, updated_at = NOW()
            WHERE id = (
                SELECT id FROM translation_jobs
                WHERE status = ${JobStatus.QUEUED}
                ORDER BY created_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING *
        `;
        return row ? this._map(row) : null;
    }

    async updateStatus(
        id: string,
        status: JobStatusType,
        extra?: {
            progress?: number;
            errorMessage?: string;
            outputPath?: string;
            s3OutputKey?: string;
            s3SubtitleEnKey?: string;
            s3SubtitleHiKey?: string;
        },
    ): Promise<void> {
        await this.db`
            UPDATE translation_jobs
            SET
                status              = ${status},
                progress            = ${extra?.progress ?? this.db`progress`},
                error_message       = ${extra?.errorMessage ?? null},
                output_path         = ${extra?.outputPath ?? this.db`output_path`},
                s3_output_key       = ${extra?.s3OutputKey ?? this.db`s3_output_key`},
                s3_subtitle_en_key  = ${extra?.s3SubtitleEnKey ?? this.db`s3_subtitle_en_key`},
                s3_subtitle_hi_key  = ${extra?.s3SubtitleHiKey ?? this.db`s3_subtitle_hi_key`},
                updated_at          = NOW()
            WHERE id = ${id}
        `;
    }

    /**
     * Called by WorkerController on every progress POST from Colab.
     * Updates both numeric progress and the current stage label.
     * current_stage is used by EventsService for SSE replay on reconnect.
     */
    async updateProgress(
        id: string,
        progress: number,
        currentStage: string,
    ): Promise<void> {
        await this.db`
            UPDATE translation_jobs
            SET
                progress      = ${progress},
                current_stage = ${currentStage},
                updated_at    = NOW()
            WHERE id = ${id}
        `;
    }

    private _map(row: any): TranslationJob {
        return {
            id: row.id,
            status: row.status,
            sourceLanguage: row.source_language,
            targetLanguage: row.target_language,
            inputFilename: row.input_filename,
            inputPath: row.input_path ?? undefined,
            outputPath: row.output_path ?? undefined,
            s3InputKey: row.s3_input_key ?? undefined,
            s3OutputKey: row.s3_output_key ?? undefined,
            s3SubtitleEnKey: row.s3_subtitle_en_key ?? undefined,
            s3SubtitleHiKey: row.s3_subtitle_hi_key ?? undefined,
            currentStage: row.current_stage ?? undefined,
            errorMessage: row.error_message ?? undefined,
            progress: row.progress,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}
