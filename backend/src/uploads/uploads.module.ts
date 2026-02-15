import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { UploadsPublicController } from './uploads.public.controller';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController, UploadsPublicController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
