import {
    Injectable,
    OnModuleDestroy,
    OnModuleInit,
    Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Observable, Subject } from "rxjs";
import { finalize } from "rxjs/operators";
import Redis from "ioredis";
import { JobRepository } from "../jobs/job.repository";
import { JobProgressEvent } from "../../shared/job-schema";

/**
 * EventsService
 *
 * Changes from original:
 *   1. Persistent publisher connection (was: new connection per publish call).
 *   2. Replay on SSE connect: immediately emits current DB state so clients
 *      that connect after stages have already completed get current progress.
 *   3. JobRepository injected to support the replay query.
 */
@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(EventsService.name);
    private readonly activeSubscribers = new Map<
        string,
        {
            subscriber: Redis;
            subject: Subject<MessageEvent>;
            refCount: number;
        }
    >();

    // Persistent publisher — created once, reused for all publish() calls.
    // Creating a new connection per publish was wasteful and leaked under load.
    private publisher!: Redis;

    constructor(
        private readonly config: ConfigService,
        private readonly jobRepository: JobRepository,
    ) {}

    onModuleInit(): void {
        this.publisher = new Redis({
            host: this.config.get<string>("app.redis.host"),
            port: this.config.get<number>("app.redis.port"),
            lazyConnect: false,
        });
        this.publisher.on("error", (err) =>
            this.logger.error("Redis publisher error", err.message),
        );
        this.logger.log("Redis publisher connection established");
    }

    subscribe(jobId: string): Observable<MessageEvent> {
        const channel = `job:progress:${jobId}`;

        // Check if we already have an active subscription for this jobId.
        // Multiple clients can subscribe to the same job (e.g., React StrictMode double-invoke,
        // or multiple browser tabs). We share a single Redis subscriber and subject
        // with reference counting to avoid orphaned subscriptions.
        const existing = this.activeSubscribers.get(jobId);
        if (existing) {
            this.logger.log(
                `[SSE] Reusing existing subscription for job ${jobId} (refCount: ${existing.refCount} → ${existing.refCount + 1})`,
            );
            existing.refCount += 1;

            return existing.subject.asObservable().pipe(
                finalize(() => {
                    const entry = this.activeSubscribers.get(jobId);
                    if (entry) {
                        entry.refCount -= 1;
                        this.logger.log(
                            `[SSE] Client unsubscribed from job ${jobId} (refCount: ${entry.refCount})`,
                        );
                        if (entry.refCount <= 0) {
                            this.logger.log(
                                `[SSE] No more subscribers for job ${jobId} — cleaning up Redis connection`,
                            );
                            this._cleanup(jobId);
                        }
                    }
                }),
            );
        }

        // First subscription for this jobId — create new subject and subscriber
        const subject = new Subject<MessageEvent>();
        this.logger.log(`[SSE] New subscription for job ${jobId}`);

        const subscriber = new Redis({
            host: this.config.get<string>("app.redis.host"),
            port: this.config.get<number>("app.redis.port"),
            lazyConnect: false,
        });

        this.activeSubscribers.set(jobId, {
            subscriber,
            subject,
            refCount: 1,
        });

        // Add reconnect listener to detect connection drops
        subscriber.on("reconnecting", () => {
            this.logger.warn(`[SSE] Redis subscriber reconnecting for job ${jobId}`);
        });

        // Add ready listener to confirm connection is established
        subscriber.on("ready", () => {
            this.logger.log(`[SSE] Redis subscriber ready for job ${jobId}`);
        });

        subscriber.on("error", (err: Error) => {
            this.logger.error(
                `[SSE] Redis subscriber error for job ${jobId}: ${err.message}`,
            );
            subject.error(err);
            this._cleanup(jobId);
        });

        subscriber.on("message", (_channel: string, raw: string) => {
            try {
                this.logger.debug(`[SSE] Message received on ${jobId}: ${raw}`);
                const event: JobProgressEvent = JSON.parse(raw);

                subject.next(
                    new MessageEvent("message", {
                        data: JSON.stringify(event),
                    }),
                );

                if (
                    event.progress >= 100 ||
                    event.stage === "DONE" ||
                    event.stage === "FAILED"
                ) {
                    subject.complete();
                    this._cleanup(jobId);
                }
            } catch (err) {
                this.logger.warn(`Failed to parse progress event: ${raw}`, err);
            }
        });

        // CRITICAL: Set up subscription synchronously, before returning the observable.
        // We must subscribe to the channel IMMEDIATELY and SYNCHRONOUSLY, not in a callback.
        // In Redis pub/sub, if events arrive after PUBLISH but before this client calls SUBSCRIBE,
        // those events are lost (pub/sub is fire-and-forget, not persistent).
        // By calling subscribe() immediately (not awaiting), we ensure the subscription
        // command is sent to Redis right away.
        subscriber.subscribe(channel, (err) => {
            if (err) {
                this.logger.error(`Failed to subscribe to ${channel}: ${err.message}`, err);
                subject.error(err);
                return;
            }
            this.logger.log(`[SSE] Subscribed to Redis channel ${channel}`);
            // Emit replay after subscription is confirmed
            this._emitReplay(jobId, subject).catch((err) => {
                this.logger.warn(
                    `[SSE] Replay query failed for job ${jobId}: ${(err as Error).message}`,
                );
            });
        });

        // CRITICAL FIX: Add finalize() operator to clean up when client disconnects.
        // When the client closes the EventSource or the HTTP connection ends,
        // the Observable unsubscribes and finalize() runs.
        // With reference counting, we only clean up the Redis subscriber when
        // the refCount reaches 0 (last client disconnected).
        return subject.asObservable().pipe(
            finalize(() => {
                const entry = this.activeSubscribers.get(jobId);
                if (entry) {
                    entry.refCount -= 1;
                    this.logger.log(
                        `[SSE] Client unsubscribed from job ${jobId} (refCount: ${entry.refCount})`,
                    );
                    if (entry.refCount <= 0) {
                        this.logger.log(
                            `[SSE] No more subscribers for job ${jobId} — cleaning up Redis connection`,
                        );
                        this._cleanup(jobId);
                    }
                }
            }),
        );
    }

    async publish(event: JobProgressEvent): Promise<void> {
        const channel = `job:progress:${event.jobId}`;
        this.logger.debug(`Publishing to Redis: ${channel} → ${JSON.stringify(event)}`);
        const numSubscribers = await this.publisher.publish(channel, JSON.stringify(event));
        this.logger.debug(`Published to ${numSubscribers} subscribers on ${channel}`);
    }

    private async _emitReplay(
        jobId: string,
        subject: Subject<MessageEvent>,
    ): Promise<void> {
        try {
            const job = await this.jobRepository.findById(jobId);
            this.logger.debug(`[SSE] Replay check for ${jobId}: progress=${job.progress}, stage=${job.currentStage}, status=${job.status}`);

            // Only replay if the job has made actual progress.
            // A PENDING/QUEUED job with 0% progress needs no replay —
            // the real events will arrive once Colab picks it up.
            if (job.progress === 0 && !job.currentStage) {
                this.logger.debug(`[SSE] No replay needed (0% progress, no stage)`);
                return;
            }

            const replayEvent: JobProgressEvent = {
                jobId,
                progress: job.progress,
                stage: job.currentStage ?? job.status,
                message: `Current status: ${job.status}`,
                isReplay: true,
            };

            subject.next(
                new MessageEvent("message", {
                    data: JSON.stringify(replayEvent),
                }),
            );

            this.logger.log(
                `[SSE] Replay emitted for job ${jobId}: ${job.progress}% / ${job.currentStage ?? job.status}`,
            );
        } catch (err) {
            // Don't crash the SSE stream if DB lookup fails
            this.logger.warn(
                `[SSE] Replay query failed for job ${jobId}: ${(err as Error).message}`,
            );
        }
    }

    private _cleanup(jobId: string): void {
        const entry = this.activeSubscribers.get(jobId);
        if (entry) {
            entry.subscriber.quit().catch(() => {});
            this.activeSubscribers.delete(jobId);
        }
    }

    onModuleDestroy(): void {
        for (const [, entry] of this.activeSubscribers.entries()) {
            entry.subscriber.quit().catch(() => {});
        }
        this.activeSubscribers.clear();
        this.publisher?.quit().catch(() => {});
    }
}
