import { Module } from '@nestjs/common';
import { RecurringTemplatesController } from './recurring-templates.controller';
import { RecurringTemplatesService } from './recurring-templates.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RecurringTemplatesController],
  providers: [RecurringTemplatesService],
  exports: [RecurringTemplatesService],
})
export class RecurringTemplatesModule {}
