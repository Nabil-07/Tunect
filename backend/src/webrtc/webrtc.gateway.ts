import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { WebrtcService } from './webrtc.service';
import { Role } from '@prisma/client';
import { MediasoupService } from '../mediasoup/mediasoup.service';
import { MediaKind, RtpCapabilities, RtpParameters } from 'mediasoup/node/lib/types';

interface AuthedUser {
  id: string;
  role: Role;
}

interface JoinPayload {
  bookingId: string;
}

interface SignalPayload {
  bookingId: string;
  sdp?: any;
  candidate?: any;
}

interface ChatSendPayload {
  bookingId: string;
  text: string;
  clientId?: string;
}

type Direction = 'send' | 'recv';

type ParticipantInfo = {
  socketId: string;
  role: Role;
};

@WebSocketGateway({
  namespace: '/webrtc',
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps)
      if (!origin) return callback(null, true);
      
      // Allow localhost
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
      
      // Allow production domains
      if (origin === 'https://tunectnow.com' || origin === 'https://test-tunectnow.com') {
        return callback(null, true);
      }
      
      // Allow any preprod subdomain
      if (origin.includes('.preprod.tunectnow.com')) {
        return callback(null, true);
      }
      
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  },
})
export class WebrtcGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(WebrtcGateway.name);
  private readonly participants = new Map<string, Map<string, ParticipantInfo>>(); // bookingId -> userId -> {socketId, role}
  private readonly connectionTimers = new Map<string, NodeJS.Timeout>();
  private readonly established = new Set<string>();
  private readonly peerState = new Map<
    string,
    {
      bookingId: string;
      userId: string;
      sendTransportId?: string;
      recvTransportId?: string;
      producers: Set<string>;
      consumers: Set<string>;
      rtpCapabilities?: RtpCapabilities;
    }
  >();

  constructor(
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly webrtc: WebrtcService,
    private readonly mediasoup: MediasoupService,
  ) {}

  private isDebug() {
    return this.cfg.get<string>('WEBRTC_DEBUG') === 'true';
  }

  async handleConnection(client: Socket) {
    // ONLY read token from client.handshake.auth.token (NOT cookies)
    const token = client.handshake.auth?.token as string;
    
    if (!token) {
      this.logger.warn(`Socket auth failed: Missing auth token origin=${client.handshake.headers.origin || '-'}`);
      client.emit('gateway-error', {
        code: 'AUTH_FAILED',
        reason: 'Invalid or expired token',
      });
      setTimeout(() => client.disconnect(), 150);
      return;
    }

    try {
      const decoded = await this.jwt.verifyAsync(token, {
        secret: this.cfg.get<string>('JWT_SECRET') || 'changeme',
      });
      
      // Attach user data to socket
      client.data.userId = decoded.sub;
      client.data.role = decoded.role;
      client.data.authenticated = true;
      client.data.user = { id: decoded.sub, role: decoded.role } as AuthedUser;
      client.data.origin = client.handshake.headers.origin || client.handshake.headers.referer;
      
      this.logger.log(`socket connected user=${decoded.sub} role=${decoded.role} origin=${client.data.origin || '-'}`);
      
      if (this.isDebug()) {
        this.logger.debug(`[WEBRTC_DEBUG] Auth success userId=${decoded.sub} role=${decoded.role}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Socket auth failed: ${message} origin=${client.handshake.headers.origin || '-'}`);
      client.emit('gateway-error', {
        code: 'AUTH_FAILED',
        reason: 'Invalid or expired token',
      });
      setTimeout(() => client.disconnect(), 150);
    }
  }

  handleDisconnect(client: Socket) {
    const user: AuthedUser | undefined = client.data.user;
    this.logger.log(`socket disconnected user=${user?.id || '-'} origin=${client.data.origin || '-'}`);
    this.cleanupPeer(client);
    this.evictFromRooms(client);
  }

  private peerKey(bookingId: string, userId: string) {
    return `${bookingId}:${userId}`;
  }

  private cleanupPeer(client: Socket) {
    const user: AuthedUser | undefined = client.data.user;
    const bookingId: string | undefined = client.data.bookingId;
    if (!user || !bookingId) return;
    const key = this.peerKey(bookingId, user.id);
    this.peerState.delete(key);
    this.mediasoup.closePeer(key);
  }

  private evictFromRooms(client: Socket) {
    const user: AuthedUser | undefined = client.data.user;
    if (!user) return;
    this.participants.forEach((map, bookingId) => {
      if (map.get(user.id)?.socketId === client.id) {
        map.delete(user.id);
        client.leave(bookingId);
        this.server.to(bookingId).emit('peer-left', { userId: user.id });

        if (map.size === 0) {
          this.participants.delete(bookingId);
          this.established.delete(bookingId);
          this.clearTimeoutFor(bookingId);
        }
      }
    });
  }

  @SubscribeMessage('join-booking')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() body: JoinPayload) {
    // Check authentication first
    if (!client.data.authenticated) {
      this.logger.warn(`join-booking rejected: not authenticated`);
      client.emit('gateway-error', { code: 'AUTH_FAILED', reason: 'Not authenticated' });
      return { ok: false, reason: 'AUTH_FAILED' };
    }

    const user: AuthedUser | undefined = client.data.user;
    const userId = client.data.userId as string;
    const userRole = client.data.role as Role;
    
    if (!user || !userId) {
      client.emit('gateway-error', { code: 'AUTH_FAILED', reason: 'User data missing' });
      return { ok: false, reason: 'AUTH_FAILED' };
    }

    const bookingId = body?.bookingId;
    if (!bookingId) {
      client.emit('gateway-error', { code: 'JOIN_DENIED', reason: 'bookingId is required' });
      return { ok: false, reason: 'bookingId is required' };
    }

    if (client.data.joinAttempted) {
      client.emit('gateway-error', { code: 'JOIN_DENIED', reason: 'JOIN_ALREADY_ATTEMPTED' });
      return { ok: false, reason: 'JOIN_ALREADY_ATTEMPTED' };
    }
    client.data.joinAttempted = true;

    // Validate participant - determine actual role in this booking
    let bookingRole: 'tutor' | 'student';
    try {
      this.logger.log(`join attempt booking=${bookingId} user=${userId} role=${userRole}`);
      const validation = await this.webrtc.validateParticipant(bookingId, userId, userRole);
      bookingRole = validation.role; // 'tutor' or 'student' based on booking
      
      if (this.isDebug()) {
        this.logger.debug(`[WEBRTC_DEBUG] join validated booking=${bookingId} user=${userId} bookingRole=${bookingRole}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Not allowed';
      this.logger.warn(`join denied booking=${bookingId} user=${userId} reason=${message}`);
      const reason =
        message.includes('not part') ? 'NOT_PART_OF_BOOKING'
        : message.includes('not found') ? 'BOOKING_NOT_FOUND'
        : message.includes('not active') ? 'BOOKING_NOT_ACTIVE'
        : message.includes('not confirmed') ? 'BOOKING_NOT_ACTIVE'
        : message.includes('Call window') ? 'CALL_WINDOW_NOT_ACTIVE'
        : message.includes('Group sessions') ? 'GROUP_SESSION_NOT_SUPPORTED'
        : 'JOIN_DENIED';
      client.emit('gateway-error', { code: 'JOIN_DENIED', reason });
      // DO NOT disconnect here - just return failure
      return { ok: false, reason };
    }

    // ensure single socket per user per booking
    const map = this.participants.get(bookingId) ?? new Map<string, ParticipantInfo>();
    const existingSocketId = map.get(userId)?.socketId;
    if (existingSocketId && existingSocketId !== client.id) {
      this.server.sockets.sockets.get(existingSocketId)?.disconnect(true);
    }

    map.set(userId, { socketId: client.id, role: userRole });
    this.participants.set(bookingId, map);
    client.join(bookingId);
    client.data.bookingId = bookingId;
    client.data.joined = true;
    client.emit('joined', { bookingId, role: bookingRole });

    client.emit('participants', {
      bookingId,
      participants: Array.from(map.entries()).map(([uid, info]) => ({ userId: uid, role: info.role })),
    });

    client.to(bookingId).emit('peer-joined', { userId, role: userRole });

    if (map.size === 2) {
      const sortedIds = Array.from(map.keys()).sort();
      const initiatorId = sortedIds[0];
      this.server.to(bookingId).emit('call-ready', { bookingId, initiatorId });
      this.startTimeout(bookingId);
    }

    this.logger.log(`join success booking=${bookingId} user=${userId} bookingRole=${bookingRole}`);
    return { ok: true, role: bookingRole };
  }

  @SubscribeMessage('mediasoup/get-rtp-capabilities')
  handleRtpCaps(@ConnectedSocket() client: Socket) {
    try {
      if (!this.mediasoup.isReady()) throw new Error('mediasoup not ready');
      client.emit('mediasoup/rtp-capabilities', this.mediasoup.getRtpCapabilities());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'mediasoup unavailable';
      client.emit('mediasoup/error', message);
    }
  }

  @SubscribeMessage('mediasoup/create-transport')
  async handleCreateTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { bookingId: string; direction: Direction; rtpCapabilities?: RtpCapabilities },
  ) {
    const user: AuthedUser | undefined = client.data.user;
    if (!user) return client.emit('mediasoup/error', 'Not authenticated');
    if (!payload?.bookingId || !payload.direction) return client.emit('mediasoup/error', 'bookingId and direction required');
    const bookingMap = this.participants.get(payload.bookingId);
    if (!bookingMap || bookingMap.get(user.id)?.socketId !== client.id) return client.emit('mediasoup/error', 'Not joined in booking');

    try {
      const peerKey = this.peerKey(payload.bookingId, user.id);
      const transportOpts = await this.mediasoup.createWebRtcTransport(peerKey, payload.direction);
      const state =
        this.peerState.get(peerKey) ?? {
          bookingId: payload.bookingId,
          userId: user.id,
          producers: new Set<string>(),
          consumers: new Set<string>(),
        };
      if (payload.direction === 'send') state.sendTransportId = transportOpts.id;
      else state.recvTransportId = transportOpts.id;
      if (payload.rtpCapabilities) state.rtpCapabilities = payload.rtpCapabilities;
      this.peerState.set(peerKey, state);
      client.emit('mediasoup/transport-created', { direction: payload.direction, transport: transportOpts });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to create transport';
      client.emit('mediasoup/error', message);
    }
  }

  @SubscribeMessage('mediasoup/connect-transport')
  async handleConnectTransport(@ConnectedSocket() client: Socket, @MessageBody() payload: { bookingId: string; transportId: string; dtlsParameters: any }) {
    const user: AuthedUser | undefined = client.data.user;
    if (!user) return client.emit('mediasoup/error', 'Not authenticated');
    if (!payload?.bookingId) return client.emit('mediasoup/error', 'bookingId required');
    const peerKey = this.peerKey(payload.bookingId, user.id);
    try {
      await this.mediasoup.connectTransport(peerKey, payload.transportId, payload.dtlsParameters as any);
      client.emit('mediasoup/transport-connected', { transportId: payload.transportId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to connect transport';
      client.emit('mediasoup/error', message);
    }
  }

  @SubscribeMessage('mediasoup/produce')
  async handleProduce(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { bookingId: string; transportId: string; kind: MediaKind; rtpParameters: RtpParameters },
  ) {
    const user: AuthedUser | undefined = client.data.user;
    if (!user) return client.emit('mediasoup/error', 'Not authenticated');
    if (!payload?.bookingId) return client.emit('mediasoup/error', 'bookingId required');
    const peerKey = this.peerKey(payload.bookingId, user.id);
    try {
      const producerId = await this.mediasoup.produce(peerKey, payload.transportId, payload.kind, payload.rtpParameters);
      const state = this.peerState.get(peerKey);
      state?.producers.add(producerId);
      client.emit('mediasoup/produced', { producerId });
      this.server.to(payload.bookingId).emit('mediasoup/new-producer', { producerId, userId: user.id, kind: payload.kind });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to produce';
      client.emit('mediasoup/error', message);
    }
  }

  @SubscribeMessage('mediasoup/consume')
  async handleConsume(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { bookingId: string; transportId: string; producerId: string; rtpCapabilities: RtpCapabilities },
  ) {
    const user: AuthedUser | undefined = client.data.user;
    if (!user) return client.emit('mediasoup/error', 'Not authenticated');
    if (!payload?.bookingId) return client.emit('mediasoup/error', 'bookingId required');
    const peerKey = this.peerKey(payload.bookingId, user.id);
    try {
      const consumerData = await this.mediasoup.consume(
        peerKey,
        payload.transportId,
        payload.producerId,
        payload.rtpCapabilities,
      );
      const state = this.peerState.get(peerKey);
      state?.consumers.add(consumerData.id);
      client.emit('mediasoup/consumed', consumerData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed to consume';
      client.emit('mediasoup/error', message);
    }
  }

  private startTimeout(bookingId: string) {
    if (this.connectionTimers.has(bookingId)) return;
    const timer = setTimeout(() => {
      if (this.established.has(bookingId)) return;
      this.webrtc.recordTechnicalFailure(bookingId, 'connection_timeout');
      this.server.to(bookingId).emit('session-failed', { reason: 'timeout' });
    }, 120_000);
    this.connectionTimers.set(bookingId, timer);
  }

  private clearTimeoutFor(bookingId: string) {
    const t = this.connectionTimers.get(bookingId);
    if (t) {
      clearTimeout(t);
      this.connectionTimers.delete(bookingId);
    }
  }

  @SubscribeMessage('offer')
  handleOffer(@ConnectedSocket() client: Socket, @MessageBody() payload: SignalPayload) {
    this.forwardToPeer(client, payload, 'offer');
  }

  @SubscribeMessage('answer')
  handleAnswer(@ConnectedSocket() client: Socket, @MessageBody() payload: SignalPayload) {
    this.forwardToPeer(client, payload, 'answer');
  }

  @SubscribeMessage('ice-candidate')
  handleIce(@ConnectedSocket() client: Socket, @MessageBody() payload: SignalPayload) {
    this.forwardToPeer(client, payload, 'ice-candidate');
  }

  @SubscribeMessage('whiteboard-update')
  handleWhiteboardUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { bookingId: string; elements?: any; appState?: any },
  ) {
    const user: AuthedUser | undefined = client.data.user;
    const bookingId = payload?.bookingId;
    if (!user || !bookingId) return;

    const bookingMap = this.participants.get(bookingId);
    if (!bookingMap || bookingMap.get(user.id)?.socketId !== client.id) return;

    this.server.to(bookingId).emit('whiteboard-update', {
      bookingId,
      userId: user.id,
      elements: payload?.elements,
      appState: payload?.appState,
    });
  }

  @SubscribeMessage('rtc-connected')
  handleConnected(@MessageBody() payload: { bookingId: string }) {
    if (payload?.bookingId) {
      this.established.add(payload.bookingId);
      this.clearTimeoutFor(payload.bookingId);
    }
  }

  @SubscribeMessage('connection-failed')
  handleFailure(@MessageBody() payload: { bookingId: string; reason?: string }) {
    if (!payload?.bookingId) return;
    if (this.isDebug()) {
      this.logger.warn(`[webrtc] client reported failure booking=${payload.bookingId} reason=${payload.reason || 'unknown'}`);
    }
    this.webrtc.recordTechnicalFailure(payload.bookingId, payload.reason || 'connection_failed');
    this.server.to(payload.bookingId).emit('session-failed', { reason: payload.reason || 'failed' });
  }

  /**
   * Debug-only log sink for preprod/prod troubleshooting.
   * Phase-1: backend never touches media; this is signaling telemetry only.
   */
  @SubscribeMessage('client-log')
  handleClientLog(@ConnectedSocket() client: Socket, @MessageBody() payload: { bookingId?: string; level?: string; message: string; data?: any }) {
    if (!this.isDebug()) return;
    const user: AuthedUser | undefined = client.data.user;
    const prefix = `[webrtc][client] user=${user?.id || 'unknown'} booking=${payload?.bookingId || '-'} level=${payload?.level || 'info'}`;
    this.logger.log(`${prefix} ${payload?.message || ''}`);
    if (payload?.data) {
      try {
        this.logger.debug(JSON.stringify(payload.data));
      } catch {}
    }
  }

  @SubscribeMessage('leave')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() payload: { bookingId: string }) {
    const user: AuthedUser | undefined = client.data.user;
    if (!user || !payload?.bookingId) return;
    const map = this.participants.get(payload.bookingId);
    if (map) {
      map.delete(user.id);
    }
    client.leave(payload.bookingId);
    this.server.to(payload.bookingId).emit('peer-left', { userId: user.id });

    if (map && map.size === 0) {
      this.participants.delete(payload.bookingId);
      this.established.delete(payload.bookingId);
      this.clearTimeoutFor(payload.bookingId);
    }

    const key = this.peerKey(payload.bookingId, user.id);
    this.peerState.delete(key);
    this.mediasoup.closePeer(key);
  }

  @SubscribeMessage('chat-send')
  handleChatSend(@ConnectedSocket() client: Socket, @MessageBody() payload: ChatSendPayload) {
    const user: AuthedUser | undefined = client.data.user;
    if (!user) return;
    const bookingId = payload?.bookingId;
    const text = (payload?.text || '').trim();
    if (!bookingId || !text) return;

    const bookingMap = this.participants.get(bookingId);
    const participant = bookingMap?.get(user.id);
    if (!participant || participant.socketId !== client.id) {
      return;
    }

    const message = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      bookingId,
      userId: user.id,
      role: user.role,
      text: text.slice(0, 2000),
      ts: new Date().toISOString(),
      clientId: payload.clientId,
    };

    this.server.to(bookingId).emit('chat-message', message);
  }

  @SubscribeMessage('whiteboard-update')
  handleWhiteboard(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    const bookingId = payload?.bookingId;
    if (!bookingId) return;
    client.to(bookingId).emit('whiteboard-update', payload);
  }

  private forwardToPeer(client: Socket, payload: SignalPayload, event: string) {
    const user: AuthedUser | undefined = client.data.user;
    if (!user || !payload?.bookingId) return;
    const map = this.participants.get(payload.bookingId);
    if (!map) return;
    // forward to the other participant only
    map.forEach((info, uid) => {
      if (uid !== user.id) {
        this.server.to(info.socketId).emit(event, payload);
      }
    });
  }
}
