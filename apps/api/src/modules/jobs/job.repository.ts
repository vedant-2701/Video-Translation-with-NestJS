import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DATABASE_CLIENT } from '../../common/database/database.module';
import { JobStatus, JobStatusType } from '../../shared/job-schema';
import postgres from 'postgres';

export interface TranslationJob {
  id: string;
  status: JobStatusType;
  sourceLanguage: string;
  targetLanguage: string;
  inputFilename: string;
  inputPath: string;
  outputPath?: string;
  errorMessage?: string;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class JobRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: postgres.Sql) {}

  async create(data: Omit<TranslationJob, 'progress' | 'createdAt' | 'updatedAt'>): Promise<TranslationJob> {
    const [row] = await this.db`
      INSERT INTO translation_jobs
        (id, status, source_language, target_language, input_filename, input_path, output_path)
      VALUES
        (${data.id}, ${data.status}, ${data.sourceLanguage}, ${data.targetLanguage},
         ${data.inputFilename}, ${data.inputPath}, ${data.outputPath ?? null})
      RETURNING *
    `;
    return this.map(row);
  }

  async findById(id: string): Promise<TranslationJob> {
    const [row] = await this.db`
      SELECT * FROM translation_jobs WHERE id = ${id}
    `;
    if (!row) throw new NotFoundException(`Job ${id} not found`);
    return this.map(row);
  }

  async updateStatus(
    id: string,
    status: JobStatusType,
    extra?: { progress?: number; errorMessage?: string; outputPath?: string },
  ): Promise<void> {
    await this.db`
      UPDATE translation_jobs
      SET
        status        = ${status},
        progress      = ${extra?.progress ?? this.db`progress`},
        error_message = ${extra?.errorMessage ?? null},
        output_path   = ${extra?.outputPath ?? this.db`output_path`}
      WHERE id = ${id}
    `;
  }

  async updateProgress(id: string, progress: number): Promise<void> {
    await this.db`
      UPDATE translation_jobs SET progress = ${progress} WHERE id = ${id}
    `;
  }

  private map(row: any): TranslationJob {
    return {
      id: row.id,
      status: row.status,
      sourceLanguage: row.source_language,
      targetLanguage: row.target_language,
      inputFilename: row.input_filename,
      inputPath: row.input_path,
      outputPath: row.output_path,
      errorMessage: row.error_message,
      progress: row.progress,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}