import { Module } from "@nestjs/common";
import { LoggerModule as PinoLoggerModule } from "nestjs-pino";
import { ConfigModule, ConfigService } from "@nestjs/config";

/**
 * LoggerModule
 *
 * Configures Pino as the global NestJS logger.
 * - Development: pretty-printed, human readable
 * - Production:  JSON lines, machine parseable (Datadog / CloudWatch ready)
 *
 * Every log line automatically includes:
 *   req.id, method, url, statusCode, responseTime, pid, hostname
 */
@Module({
    imports: [
        PinoLoggerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const isProd =
                    config.get<string>("app.nodeEnv") === "production";

                return {
                    pinoHttp: {
                        level: isProd ? "info" : "debug",

                        // Production: pure JSON. Development: pretty coloured output.
                        transport: isProd
                            ? undefined
                            : {
                                  target: "pino-pretty",
                                  options: {
                                      colorize: true,
                                      singleLine: false,
                                      translateTime: "SYS:standard",
                                      ignore: "pid,hostname",
                                  },
                              },

                        // Redact sensitive fields from logs
                        redact: {
                            paths: [
                                "req.headers.authorization",
                                "req.headers.cookie",
                                "req.body.password",
                            ],
                            remove: true,
                        },

                        // Attach a unique request ID to every log line
                        genReqId: (req: any) =>
                            req.headers["x-request-id"] ?? crypto.randomUUID(),

                        // Suppress noisy health check logs
                        autoLogging: {
                            ignore: (req: any) => req.url?.includes("/health"),
                        },

                        customSuccessMessage: (req: any, res: any) =>
                            `${req.method} ${req.url} completed`,

                        customErrorMessage: (req: any, res: any, err: Error) =>
                            `${req.method} ${req.url} errored: ${err.message}`,
                    },
                };
            },
        }),
    ],
    exports: [PinoLoggerModule],
})
export class AppLoggerModule {}
