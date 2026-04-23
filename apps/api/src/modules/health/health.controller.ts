import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { HealthService, HealthStatus } from './health.service';

/**
 * HealthController
 *
 * GET /api/health
 *   → 200 if all services are up
 *   → 200 with status "degraded" if some services are down
 *   → 503 if ALL services are down
 *
 * Standard convention: load balancers use this endpoint.
 * Return 200 even for "degraded" so the instance stays in rotation
 * unless it's fully down.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthStatus> {
    const health = await this.healthService.check();

    if (health.status === 'down') {
      throw new ServiceUnavailableException(health);
    }

    return health;
  }
}