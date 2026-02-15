import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PolicyConfigService } from './policy-config.service';
import { PolicyConfigController } from './policy-config.controller';

@Module({
  imports: [PrismaModule],
  providers: [PolicyConfigService],
  controllers: [PolicyConfigController],
  exports: [PolicyConfigService],
})
export class PolicyConfigModule {}
