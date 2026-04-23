import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE_CLIENT } from '../../common/database/database.module';
import Redis from 'ioredis';
import postgres from 'postgres';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  uptime: number;
  timestamp: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    storage: ServiceHealth;
  };
}

interface ServiceHealth {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

/**
 * HealthService
 *
 * Actively probes each dependency (DB, Redis, storage) and returns
 * a structured health report. Used by ops/monitoring tools and load
 * balancers to determine if the instance is ready to serve traffic.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: postgres.Sql,
    private readonly config: ConfigService,
  ) {}

  async check(): Promise<HealthStatus> {
    const [database, redis, storage] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStorage(),
    ]);

    const allUp = [database, redis, storage].every((s) => s.status === 'up');
    const anyUp = [database, redis, storage].some((s) => s.status === 'up');

    return {
      status: allUp ? 'ok' : anyUp ? 'degraded' : 'down',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services: { database, redis, storage },
    };
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await this.db`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.error('Database health check failed', err);
      return { status: 'down', error: (err as Error).message };
    }
  }

  private async checkRedis(): Promise<ServiceHealth> {
    const start = Date.now();
    const client = new Redis({
      host: this.config.get<string>('app.redis.host'),
      port: this.config.get<number>('app.redis.port'),
      connectTimeout: 3000,
      lazyConnect: true,
    });

    try {
      await client.connect();
      await client.ping();
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.error('Redis health check failed', err);
      return { status: 'down', error: (err as Error).message };
    } finally {
      await client.quit().catch(() => {});
    }
  }

  private async checkStorage(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      const fs = await import('fs/promises');
      const storagePath = this.config.get<string>('app.storage.localPath')!;
      await fs.access(storagePath);
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', error: (err as Error).message };
    }
  }
}