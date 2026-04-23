import { Injectable, OnModuleDestroy, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Observable, Subject } from "rxjs";
import Redis from "ioredis";

export interface ProgressEvent {
    jobId: string;
    progress: number;
    stage: string;
    message?: string;
}

/**
 * EventsService
 *
 * Each call to subscribe() creates a dedicated Redis subscriber connection
 * for one job channel. When the worker publishes a progress event to
 * Redis channel `job:progress:<jobId>`, this service forwards it to the
 * SSE stream consumed by the client.
 *
 * Channel format: job:progress:<jobId>
 * Message format: JSON { jobId, progress, stage, message? }
 *
 * Connections are cleaned up automatically when the client disconnects.
 */
@Injectable()
export class EventsService implements OnModuleDestroy {
    private readonly logger = new Logger(EventsService.name);
    private readonly activeSubscribers = new Map<string, Redis>();

    constructor(private readonly config: ConfigService) {}

    /**
     * Returns an Observable that emits SSE MessageEvents for a specific job.
     * The observable completes when progress reaches 100 or job fails.
     */
    subscribe(jobId: string): Observable<MessageEvent> {
        const subject = new Subject<MessageEvent>();
        const channel = `job:progress:${jobId}`;

        const subscriber = new Redis({
            host: this.config.get<string>("app.redis.host"),
            port: this.config.get<number>("app.redis.port"),
            lazyConnect: false,
        });

        this.activeSubscribers.set(jobId, subscriber);

        subscriber.subscribe(channel, (err) => {
            if (err) {
                this.logger.error(
                    `Failed to subscribe to channel ${channel}`,
                    err,
                );
                subject.error(err);
                return;
            }
            this.logger.debug(`Subscribed to ${channel}`);
        });

        subscriber.on("message", (_channel: string, message: string) => {
            try {
                const event: ProgressEvent = JSON.parse(message);

                subject.next(
                    new MessageEvent("message", {
                        data: JSON.stringify(event),
                    }),
                );

                // Auto-complete stream when job is done or failed
                if (
                    event.progress >= 100 ||
                    event.stage === "DONE" ||
                    event.stage === "FAILED"
                ) {
                    this.logger.debug(
                        `Job ${jobId} terminal event received — closing SSE stream`,
                    );
                    subject.complete();
                    this._cleanup(jobId);
                }
            } catch (parseErr) {
                this.logger.warn(`Failed to parse progress event: ${message}`);
            }
        });

        subscriber.on("error", (err: Error) => {
            this.logger.error(
                `Redis subscriber error for job ${jobId}`,
                err.message,
            );
            subject.error(err);
            this._cleanup(jobId);
        });

        return subject.asObservable();
    }

    /**
     * Publish a progress event to Redis. Called by worker via its own
     * Redis connection. Also callable from NestJS side for internal events.
     */
    async publish(event: ProgressEvent): Promise<void> {
        const publisher = new Redis({
            host: this.config.get<string>("app.redis.host"),
            port: this.config.get<number>("app.redis.port"),
        });

        try {
            const channel = `job:progress:${event.jobId}`;
            await publisher.publish(channel, JSON.stringify(event));
        } finally {
            await publisher.quit();
        }
    }

    private _cleanup(jobId: string): void {
        const sub = this.activeSubscribers.get(jobId);
        if (sub) {
            sub.quit().catch(() => {});
            this.activeSubscribers.delete(jobId);
            this.logger.debug(`Cleaned up subscriber for job ${jobId}`);
        }
    }

    onModuleDestroy(): void {
        // Clean up all open Redis connections on shutdown
        for (const [jobId, sub] of this.activeSubscribers.entries()) {
            sub.quit().catch(() => {});
            this.logger.debug(`Shutdown cleanup: subscriber for job ${jobId}`);
        }
        this.activeSubscribers.clear();
    }
}
