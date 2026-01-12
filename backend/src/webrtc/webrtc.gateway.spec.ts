import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WebrtcGateway } from './webrtc.gateway';
import { WebrtcService } from './webrtc.service';
import { Role } from '@prisma/client';
import { MediasoupService } from '../mediasoup/mediasoup.service';

jest.useFakeTimers();

const makeSocket = (id: string, userId: string, role: Role) => {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  return {
    id,
    data: { user: { id: userId, role } },
    handshake: { auth: {}, headers: {} },
    join: jest.fn(),
    leave: jest.fn(),
    emit,
    to,
    disconnect: jest.fn(),
  } as any;
};

describe('WebrtcGateway', () => {
  const jwt = { verifyAsync: jest.fn() } as unknown as JwtService;
  const cfg = { get: jest.fn() } as unknown as ConfigService;
  const webrtc: Partial<WebrtcService> = {
    validateParticipant: jest.fn().mockResolvedValue({}),
    recordTechnicalFailure: jest.fn().mockResolvedValue(undefined),
  };
  const mediasoup: Partial<MediasoupService> = {
    closePeer: jest.fn(),
    isReady: jest.fn().mockReturnValue(false),
  };

  const makeGateway = () => {
    const gateway = new WebrtcGateway(jwt, cfg, webrtc as WebrtcService, mediasoup as MediasoupService);
    const toEmit = jest.fn();
    gateway['server'] = {
      to: jest.fn().mockReturnValue({ emit: toEmit }),
      sockets: { sockets: new Map() },
    } as any;
    return { gateway, toEmit };
  };

  it('starts timeout and records technical failure if peers do not connect', async () => {
    const { gateway, toEmit } = makeGateway();
    const a = makeSocket('s1', 'u1', 'STUDENT');
    const b = makeSocket('s2', 'u2', 'TUTOR');

    await gateway.handleJoin(a, { bookingId: 'b1' });
    await gateway.handleJoin(b, { bookingId: 'b1' });

    jest.runOnlyPendingTimers();

    expect(webrtc.recordTechnicalFailure).toHaveBeenCalledWith('b1', 'connection_timeout');
    expect(toEmit).toHaveBeenCalledWith('session-failed', { reason: 'timeout' });
  });
});
