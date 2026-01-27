// src/app.controller.ts
import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health/health.service';

@Controller()
export class AppController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  async health(@Res() res: Response) {
    const result = await this.healthService.check();

    // Return 503 if critical service (database) is down
    if (result.status === 'down') {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json(result);
    }

    // Return 200 for ok/degraded
    return res.status(HttpStatus.OK).json(result);
  }
}
