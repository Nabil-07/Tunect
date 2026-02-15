import { Controller, Get } from '@nestjs/common';
import { PolicyConfigService } from './policy-config.service';

@Controller('policy-config')
export class PolicyConfigController {
  constructor(private readonly policy: PolicyConfigService) {}

  @Get()
  getPublicConfig() {
    return this.policy.getPublicConfig();
  }
}
