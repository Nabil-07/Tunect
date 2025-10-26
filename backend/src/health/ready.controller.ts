import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class ReadyController {
  constructor(private prisma: PrismaService) {}

  @Get('ready')
  async ready() {
    // DB ping
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
