import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportMessageDto } from './dto/support-message.dto';
import { SupportTicketStatus } from '@prisma/client';
import { Role } from '../auth/role.enum';

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  async createTicket(userId: string, dto: CreateSupportTicketDto) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        subject: dto.subject?.trim() || null,
        status: SupportTicketStatus.OPEN,
        lastMessageAt: new Date(),
        messages: {
          create: {
            senderId: userId,
            message: dto.message,
          },
        },
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    return ticket;
  }

  async listMyTickets(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async listUnassigned() {
    return this.prisma.supportTicket.findMany({
      where: { assignedToId: null, status: { in: [SupportTicketStatus.OPEN, SupportTicketStatus.ASSIGNED] } },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  async listAssignedTo(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { assignedToId: userId },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  async getTicket(userId: string, role: Role, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { sender: { select: { id: true, name: true, email: true, role: true } } },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (role !== Role.ADMIN && ticket.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return ticket;
  }

  async addMessage(userId: string, role: Role, ticketId: string, dto: SupportMessageDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, userId: true, assignedToId: true, status: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (role !== Role.ADMIN && ticket.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Auto-assign if admin replies to an unassigned ticket
    if (role === Role.ADMIN && !ticket.assignedToId) {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { assignedToId: userId, status: SupportTicketStatus.ASSIGNED },
      });
    }

    const message = await this.prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: userId,
        message: dto.message,
      },
      include: { sender: { select: { id: true, name: true, email: true, role: true } } },
    });

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { lastMessageAt: new Date() },
    });

    return message;
  }

  async assignToMe(adminId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, assignedToId: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.assignedToId && ticket.assignedToId !== adminId) {
      throw new BadRequestException('Ticket already assigned');
    }
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { assignedToId: adminId, status: SupportTicketStatus.ASSIGNED },
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    });
  }

  async updateStatus(ticketId: string, status: SupportTicketStatus) {
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status },
    });
  }
}
