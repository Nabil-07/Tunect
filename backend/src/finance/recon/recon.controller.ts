import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { ReconService } from './recon.service';
import { ReconAdjustmentDto } from './dto/recon-adjustment.dto';

@Controller('admin/finance/recon')
export class ReconController {
  constructor(private readonly svc: ReconService) {}

  @Get('daily')
  async daily(@Query('date') date?: string) {
    return this.svc.daily(date);
  }

  @Post('bank/upload')
  @UseInterceptors(FileInterceptor('file'))
  async bankUpload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Use form field name "file".');
    }
    return this.svc.parseBank(file);
  }

  @Post('gateway/upload')
  @UseInterceptors(FileInterceptor('file'))
  async gatewayUpload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Use form field name "file".');
    }
    return this.svc.parseGateway(file);
  }

  @Post('adjustment')
  async adjustment(@Body() dto: ReconAdjustmentDto) {
    return this.svc.adjustment(dto);
  }
}
