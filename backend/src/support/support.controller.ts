import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SupportService } from './support.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportMessageDto } from './dto/support-message.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

@Controller('support')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupportController {
  constructor(private readonly service: SupportService) {}

  @Post('tickets')
  createTicket(@CurrentUser('id') userId: string, @Body() dto: CreateSupportTicketDto) {
    return this.service.createTicket(userId, dto);
  }

  @Get('tickets/my')
  listMyTickets(@CurrentUser('id') userId: string) {
    return this.service.listMyTickets(userId);
  }

  @Get('tickets/unassigned')
  @Roles(Role.ADMIN)
  listUnassigned() {
    return this.service.listUnassigned();
  }

  @Get('tickets/assigned')
  @Roles(Role.ADMIN)
  listAssigned(@CurrentUser('id') adminId: string) {
    return this.service.listAssignedTo(adminId);
  }

  @Get('tickets/:id')
  getTicket(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: Role,
    @Param('id') ticketId: string,
  ) {
    return this.service.getTicket(userId, role, ticketId);
  }

  @Post('tickets/:id/messages')
  addMessage(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: Role,
    @Param('id') ticketId: string,
    @Body() dto: SupportMessageDto,
  ) {
    return this.service.addMessage(userId, role, ticketId, dto);
  }

  @Patch('tickets/:id/assign')
  @Roles(Role.ADMIN)
  assignToMe(@CurrentUser('id') adminId: string, @Param('id') ticketId: string) {
    return this.service.assignToMe(adminId, ticketId);
  }

  @Patch('tickets/:id/status')
  @Roles(Role.ADMIN)
  updateStatus(@Param('id') ticketId: string, @Body() dto: UpdateTicketStatusDto) {
    return this.service.updateStatus(ticketId, dto.status);
  }
}
