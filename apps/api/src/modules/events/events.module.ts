import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";

/**
 * EventsModule
 *
 * Provides Server-Sent Events (SSE) endpoint at GET /api/events/:jobId
 * Client connects once and receives real-time progress updates as the
 * Python worker publishes them to Redis pub/sub.
 *
 * No WebSocket server needed — SSE is one-directional and simpler.
 */
@Module({
    controllers: [EventsController],
    providers: [EventsService],
    exports: [EventsService],
})
export class EventsModule {}
