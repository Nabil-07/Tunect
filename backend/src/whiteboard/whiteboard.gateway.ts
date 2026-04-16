import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WhiteboardService } from './whiteboard.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({ namespace: '/whiteboard', cors: true })
export class WhiteboardGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WhiteboardGateway.name);

  /** Track which room (bookingId) each socket is in */
  private readonly socketRooms = new Map<string, string>();

  /** Debounce timers for DB persistence per room */
  private readonly saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Latest data per room (for debounced persistence) */
  private readonly pendingSaves = new Map<string, { userId: string; data: any }>();

  private readonly SAVE_DEBOUNCE_MS = 3000;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly whiteboardService: WhiteboardService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`[WB] Client ${client.id} connected without token — disconnecting`);
        client.disconnect(true);
        return;
      }

      const secret = this.configService.get<string>('JWT_SECRET') || 'changeme';
      const payload = await this.jwtService.verifyAsync(token, { secret });
      client.userId = payload.sub;

      this.logger.log(`[WB] Client ${client.id} authenticated as user ${payload.sub}`);
    } catch (err) {
      this.logger.warn(`[WB] Client ${client.id} auth failed: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const room = this.socketRooms.get(client.id);
    if (room) {
      this.socketRooms.delete(client.id);
      this.logger.log(`[WB] Client ${client.id} (user ${client.userId}) left room ${room}`);
    }
  }

  /**
   * Client joins a whiteboard room (bookingId).
   * Emits `wb:state` with the current data so the client always receives
   * initial state (does NOT rely on the ack callback which is unreliable
   * in NestJS async @SubscribeMessage handlers).
   */
  @SubscribeMessage('wb:join')
  async handleJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { bookingId: string },
  ) {
    if (!client.userId) {
      this.logger.warn(`[WB] wb:join rejected — no userId on socket ${client.id}`);
      return;
    }

    const { bookingId } = data;
    if (!bookingId || typeof bookingId !== 'string') {
      this.logger.warn(`[WB] wb:join rejected — invalid bookingId from socket ${client.id}`);
      return;
    }

    // Leave previous room if any
    const prevRoom = this.socketRooms.get(client.id);
    if (prevRoom) {
      client.leave(prevRoom);
    }

    // Join the new room
    client.join(bookingId);
    this.socketRooms.set(client.id, bookingId);

    this.logger.log(`[WB] User ${client.userId} joined room ${bookingId} (socket ${client.id})`);

    // Send current state to the joining client via explicit event
    // (NOT via return/ack — the NestJS async ack path is unreliable)
    try {
      const currentData = await this.whiteboardService.getWhiteboardData(
        bookingId,
        client.userId,
      );
      this.logger.log(`[WB] Sending wb:state to ${client.id} — ${(currentData as any)?.elements?.length ?? 0} elements`);
      client.emit('wb:state', currentData);
    } catch (err) {
      if (err instanceof ForbiddenException || err instanceof NotFoundException) {
        this.logger.warn(`[WB] Access denied for user ${client.userId} to room ${bookingId}: ${(err as Error).message}`);
        client.emit('error', { message: 'Access denied to this whiteboard' });
        client.disconnect(true);
        return;
      }
      this.logger.warn(`[WB] Failed to load state for room ${bookingId}: ${(err as Error).message}`);
      client.emit('wb:state', { elements: [], appState: {} });
    }
  }

  /**
   * Client sends element updates.
   * Broadcast to all other clients in the room and debounce-save to DB.
   */
  @SubscribeMessage('wb:update')
  handleUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      bookingId: string;
      elements: any[];
      appState?: any;
    },
  ) {
    if (!client.userId) return;

    const { bookingId, elements, appState } = data;
    if (!bookingId || !Array.isArray(elements)) {
      this.logger.warn(`[WB] wb:update rejected — invalid payload from socket ${client.id}`);
      return;
    }

    this.logger.log(`[WB] wb:update from user ${client.userId} in room ${bookingId} — ${elements.length} elements`);

    // Broadcast to everyone else in the room
    client.to(bookingId).emit('wb:remote-update', { elements, appState });

    // Debounced persistence to DB
    this.scheduleSave(bookingId, client.userId, { elements, appState });
  }

  /**
   * Client requests a full state snapshot (e.g. after reconnect).
   */
  @SubscribeMessage('wb:request-state')
  async handleRequestState(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { bookingId: string },
  ) {
    if (!client.userId) return;

    this.logger.log(`[WB] wb:request-state from user ${client.userId} for room ${data.bookingId}`);

    try {
      const currentData = await this.whiteboardService.getWhiteboardData(
        data.bookingId,
        client.userId,
      );
      client.emit('wb:state', currentData);
    } catch {
      client.emit('wb:state', { elements: [], appState: {} });
    }
  }

  /**
   * Debounce DB saves — batch rapid element updates into one write per room.
   */
  private scheduleSave(bookingId: string, userId: string, data: any) {
    this.pendingSaves.set(bookingId, { userId, data });

    const existing = this.saveTimers.get(bookingId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.saveTimers.delete(bookingId);
      const pending = this.pendingSaves.get(bookingId);
      if (!pending) return;
      this.pendingSaves.delete(bookingId);

      try {
        await this.whiteboardService.saveWhiteboardData(
          bookingId,
          pending.userId,
          pending.data,
        );
      } catch (err) {
        this.logger.warn(`Debounced save failed for ${bookingId}: ${(err as Error).message}`);
      }
    }, this.SAVE_DEBOUNCE_MS);

    this.saveTimers.set(bookingId, timer);
  }
}
