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
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinConversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.join(`conversation:${data.conversationId}`);
    console.log(`User ${client.data.userId} joined conversation ${data.conversationId}`);
    return { status: 'joined', conversationId: data.conversationId };
  }

  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
    console.log(`User ${client.data.userId} left conversation ${data.conversationId}`);
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
