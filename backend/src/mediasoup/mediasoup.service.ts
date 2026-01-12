import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWorker } from 'mediasoup';
import type {
  Consumer,
  DtlsParameters,
  MediaKind,
  Producer,
  Router,
  RouterRtpCodecCapability,
  RtpCapabilities,
  RtpParameters,
  WebRtcTransport,
  Worker,
  WorkerLogLevel,
} from 'mediasoup/node/lib/types';

interface MediasoupStatus {
  enabled: boolean;
  workerReady: boolean;
  routerReady: boolean;
  error?: string;
}

@Injectable()
export class MediasoupService implements OnModuleInit {
  private readonly logger = new Logger(MediasoupService.name);
  private worker: Worker | null = null;
  private router: Router | null = null;
  private enabled = false;
  private transports = new Map<string, { transport: WebRtcTransport; peerId: string; direction: 'send' | 'recv' }>();
  private producers = new Map<string, { producer: Producer; peerId: string }>();
  private consumers = new Map<string, { consumer: Consumer; peerId: string }>();

  constructor(private readonly cfg: ConfigService) {}

  async onModuleInit() {
    this.enabled = this.cfg.get<string>('MEDIASOUP_ENABLED') === 'true';
    if (!this.enabled) {
      this.logger.log('Mediasoup disabled via MEDIASOUP_ENABLED');
      return;
    }

    const logLevel = (this.cfg.get<string>('MEDIASOUP_LOG_LEVEL') as WorkerLogLevel) || 'warn';
    const rtcMinPort = Number(this.cfg.get<string>('MEDIASOUP_RTC_MIN_PORT') ?? 40000);
    const rtcMaxPort = Number(this.cfg.get<string>('MEDIASOUP_RTC_MAX_PORT') ?? 49999);

    try {
      this.worker = await createWorker({ logLevel, rtcMinPort, rtcMaxPort });
      this.worker.on('died', () => {
        this.logger.error('Mediasoup worker died, will not restart automatically');
        this.worker = null;
        this.router = null;
        this.transports.clear();
        this.producers.clear();
        this.consumers.clear();
      });

      const mediaCodecs = this.getDefaultCodecs();
      this.router = await this.worker.createRouter({ mediaCodecs });
      this.logger.log(`Mediasoup initialized with codecs: ${mediaCodecs.map((c) => c.mimeType).join(', ')}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to initialize Mediasoup: ${message}`);
      this.enabled = false;
      this.worker = null;
      this.router = null;
      this.transports.clear();
      this.producers.clear();
      this.consumers.clear();
    }
  }

  getStatus(): MediasoupStatus {
    return {
      enabled: this.enabled,
      workerReady: !!this.worker,
      routerReady: !!this.router,
      error: !this.enabled ? 'disabled' : undefined,
    };
  }

  getRtpCapabilities() {
    if (!this.enabled || !this.router) return null;
    return this.router.rtpCapabilities;
  }

  isReady() {
    return this.enabled && !!this.router;
  }

  async createWebRtcTransport(peerId: string, direction: 'send' | 'recv') {
    if (!this.router || !this.worker) throw new Error('Mediasoup not ready');

    const listenIp = this.cfg.get<string>('MEDIASOUP_LISTEN_IP') || '0.0.0.0';
    const announcedIp = this.cfg.get<string>('MEDIASOUP_ANNOUNCED_IP') || undefined;

    const transport = await this.router.createWebRtcTransport({
      listenIps: [{ ip: listenIp, announcedIp }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1_000_000,
      appData: { peerId, direction },
    });

    this.transports.set(transport.id, { transport, peerId, direction });

    transport.on('dtlsstatechange', (state: string) => {
      if (state === 'failed' || state === 'closed') {
        this.logger.warn(`Transport ${transport.id} dtlsstate=${state}`);
      }
    });

    transport.on('@close', () => {
      this.transports.delete(transport.id);
    });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(peerId: string, transportId: string, dtlsParameters: DtlsParameters) {
    const entry = this.transports.get(transportId);
    if (!entry) throw new Error('transport not found');
    if (entry.peerId !== peerId) throw new Error('transport does not belong to peer');
    await entry.transport.connect({ dtlsParameters });
  }

  async produce(
    peerId: string,
    transportId: string,
    kind: MediaKind,
    rtpParameters: RtpParameters,
    appData?: Record<string, unknown>,
  ) {
    const entry = this.transports.get(transportId);
    if (!entry) throw new Error('transport not found');
    if (entry.peerId !== peerId) throw new Error('transport does not belong to peer');

    const producer = await entry.transport.produce({ kind, rtpParameters, appData });
    this.producers.set(producer.id, { producer, peerId });

    producer.on('transportclose', () => {
      this.producers.delete(producer.id);
    });

    return producer.id;
  }

  async consume(
    peerId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: RtpCapabilities,
  ) {
    if (!this.router) throw new Error('router not ready');

    const entry = this.transports.get(transportId);
    if (!entry) throw new Error('transport not found');
    if (entry.peerId !== peerId) throw new Error('transport does not belong to peer');

    const producerEntry = this.producers.get(producerId);
    if (!producerEntry) throw new Error('producer not found');

    if (!this.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('cannot consume');
    }

    const consumer = await entry.transport.consume({ producerId, rtpCapabilities, paused: false });
    this.consumers.set(consumer.id, { consumer, peerId });

    consumer.on('transportclose', () => {
      this.consumers.delete(consumer.id);
    });

    consumer.on('producerclose', () => {
      this.consumers.delete(consumer.id);
    });

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused,
    };
  }

  closePeer(peerId: string) {
    [...this.producers.entries()].forEach(([id, { producer, peerId: owner }]) => {
      if (owner === peerId) {
        producer.close();
        this.producers.delete(id);
      }
    });

    [...this.consumers.entries()].forEach(([id, { consumer, peerId: owner }]) => {
      if (owner === peerId) {
        consumer.close();
        this.consumers.delete(id);
      }
    });

    [...this.transports.entries()].forEach(([id, { transport, peerId: owner }]) => {
      if (owner === peerId) {
        transport.close();
        this.transports.delete(id);
      }
    });
  }

  /**
   * Minimal codec set that works across Chrome/Firefox/Edge.
   */
  private getDefaultCodecs(): RouterRtpCodecCapability[] {
    return [
      {
        kind: 'audio' as const,
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video' as const,
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video' as const,
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
        },
      },
    ];
  }
}
