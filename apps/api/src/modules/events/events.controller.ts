import {
    Controller,
    Get,
    Param,
    Sse,
    MessageEvent,
    Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { EventsService } from "./events.service";

/**
 * EventsController
 *
 * GET /api/events/:jobId
 *
 * Opens a Server-Sent Events stream for the given job.
 * The client receives real-time progress events as the worker
 * processes each pipeline stage.
 *
 * Client usage (JavaScript):
 *   const es = new EventSource('/api/events/<jobId>');
 *   es.onmessage = (e) => {
 *     const { progress, stage } = JSON.parse(e.data);
 *     console.log(`${stage}: ${progress}%`);
 *     if (progress >= 100) es.close();
 *   };
 *
 * The connection stays open until the job completes/fails,
 * at which point the server closes the stream automatically.
 */
@Controller("events")
export class EventsController {
    private readonly logger = new Logger(EventsController.name);

    constructor(private readonly eventsService: EventsService) {}

    @Sse(":jobId")
    streamProgress(@Param("jobId") jobId: string): Observable<MessageEvent> {
        this.logger.log(`SSE client connected for job ${jobId}`);
        return this.eventsService.subscribe(jobId);
    }
}
