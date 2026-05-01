import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

/**
 * WorkerGuard
 *
 * Validates the X-Worker-Secret header on all worker endpoints.
 * Colab sends this header on every request to /api/worker/*.
 * NestJS compares it against WORKER_SECRET env var.
 *
 * This is intentionally simple — no JWT, no OAuth.
 * For a single trusted Colab instance, a shared secret is sufficient.
 */
@Injectable()
export class WorkerGuard implements CanActivate {
    private readonly secret: string;

    constructor(private readonly config: ConfigService) {
        this.secret = this.config.get<string>("app.workerSecret")!;
    }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        const header = request.headers["x-worker-secret"];

        if (!header || header !== this.secret) {
            throw new UnauthorizedException("Invalid or missing worker secret");
        }

        return true;
    }
}
