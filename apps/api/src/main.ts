import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { GlobalHttpExceptionFilter } from "./common/filters/http-exception.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        bufferLogs: true, // buffer logs until Pino logger is ready
    });

    // ── Use Pino as the NestJS logger ──────────────────────────
    app.useLogger(app.get(Logger));

    // ── Global Exception Filter ────────────────────────────────
    app.useGlobalFilters(new GlobalHttpExceptionFilter());

    // ── Global Validation Pipe ─────────────────────────────────
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    // ── Global Logging Interceptor ─────────────────────────────
    app.useGlobalInterceptors(new LoggingInterceptor());

    // ── Global Prefix ──────────────────────────────────────────
    app.setGlobalPrefix("api");

    // ── CORS ───────────────────────────────────────────────────
    app.enableCors({
        origin: process.env.CORS_ORIGIN ?? "http://localhost:3001",
        methods: ["GET", "POST"],
        exposedHeaders: [
            "Content-Range",
            "Accept-Ranges",
            "Content-Length",
            "Content-Disposition",
        ],
    });

    // ── Graceful Shutdown ──────────────────────────────────────
    // Lets in-flight requests complete before closing DB/Redis connections
    app.enableShutdownHooks();

    const port = process.env.PORT ?? 3000;
    await app.listen(port);

    const logger = app.get(Logger);
    logger.log(`🚀 API running on http://localhost:${port}/api`, "Bootstrap");
    logger.log(
        `🏥 Health:    http://localhost:${port}/api/health`,
        "Bootstrap",
    );
    logger.log(
        `📡 SSE:       http://localhost:${port}/api/events/:jobId`,
        "Bootstrap",
    );
}

bootstrap();
