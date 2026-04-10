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
import { UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { PiiGuardService } from '../common/pii-guard.service';

@WebSocketGateway({
  cors: {
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'https://tunectnow.com',
      'https://www.tunectnow.com',
      ...(process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) ?? []),
    ].filter((v, i, a) => a.indexOf(v) === i), // dedupe
    credentials: true,
  },
  namespace: '/chat',
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socket IDs

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private piiGuard: PiiGuardService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Extract token from handshake auth
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        client.disconnect();
        return;
      }

      // Verify JWT and get user
      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub;

      // Store socket for this user
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      // Store userId in socket data for later use
      client.data.userId = userId;

      console.log(`Client connected: ${client.id} (User: ${userId})`);
    } catch (error) {
      console.error('WebSocket connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId)!.delete(client.id);
      if (this.userSockets.get(userId)!.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    // Notify all conversation rooms this socket was in that the user went offline
    const rooms: Set<string> = client.data.conversationRooms || new Set();
    rooms.forEach((convId) => {
      this.server.to(`conversation:${convId}`).emit('userPresence', {
        userId,
        conversationId: convId,
        online: false,
      });
    });

    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const room = `conversation:${data.conversationId}`;
    // Track which conversation rooms this socket has joined
    if (!client.data.conversationRooms) client.data.conversationRooms = new Set<string>();
    client.data.conversationRooms.add(data.conversationId);

    client.join(room);
    console.log(`User ${client.data.userId} joined conversation ${data.conversationId}`);

    // Tell everyone else in the room this user is online
    client.to(room).emit('userPresence', {
      userId: client.data.userId,
      conversationId: data.conversationId,
      online: true,
    });

    // Tell the joiner which other users are already in the room
    const socketsInRoom = await this.server.in(room).fetchSockets();
    const onlineUserIds = socketsInRoom
      .filter((s) => s.data.userId && s.data.userId !== client.data.userId)
      .map((s) => s.data.userId as string);
    onlineUserIds.forEach((userId) => {
      client.emit('userPresence', { userId, conversationId: data.conversationId, online: true });
    });

    return { status: 'joined', conversationId: data.conversationId };
  }

  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const room = `conversation:${data.conversationId}`;
    client.leave(room);
    if (client.data.conversationRooms) client.data.conversationRooms.delete(data.conversationId);
    console.log(`User ${client.data.userId} left conversation ${data.conversationId}`);

    // Tell others this user went offline
    this.server.to(room).emit('userPresence', {
      userId: client.data.userId,
      conversationId: data.conversationId,
      online: false,
    });

    return { status: 'left', conversationId: data.conversationId };
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    // Broadcast typing indicator to other users in the conversation
    client.to(`conversation:${data.conversationId}`).emit('userTyping', {
      userId: client.data.userId,
      conversationId: data.conversationId,
      isTyping: data.isTyping,
    });
  }

  // Server-side method to emit new messages
  async emitNewMessage(conversationId: string, message: any) {
    // Emit to conversation room
    this.server.to(`conversation:${conversationId}`).emit('newMessage', message);
  }

  // Emit conversation list updates
  async emitConversationUpdate(userId: string, conversation: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit('conversationUpdate', conversation);
      });
    }
  }

  // Check if user is online
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
  }

  // Get online status for multiple users
  getUsersOnlineStatus(userIds: string[]): Map<string, boolean> {
    const status = new Map<string, boolean>();
    userIds.forEach((userId) => {
      status.set(userId, this.isUserOnline(userId));
    });
    return status;
  }
}
