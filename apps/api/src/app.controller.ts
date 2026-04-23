import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** GET /api — basic API info */
  @Get()
  getInfo() {
    return this.appService.getInfo();
  }
}