import { io, Socket } from "socket.io-client";
import api, { baseURL, readToken } from "../lib/apiClient";

export type WebrtcHandlers = {
  onCallReady?: (payload: { bookingId: string; initiatorId: string }) => void;
  onOffer?: (payload: any) => void;
  onAnswer?: (payload: any) => void;
  onIceCandidate?: (payload: any) => void;
  onParticipants?: (payload: { bookingId: string; participants: Array<{ userId: string; role: string }> }) => void;
  onPeerJoined?: (payload: { userId: string; role: string }) => void;
  onPeerLeft?: (payload: { userId: string }) => void;
  onSessionFailed?: (payload: { reason: string }) => void;
  onError?: (message: string) => void;
  onWhiteboardUpdate?: (payload: any) => void;
  onChatMessage?: (payload: {
    id: string;
    bookingId: string;
    userId: string;
    role: string;
    text: string;
    ts: string;
    clientId?: string;
  }) => void;
  onMediasoupNewProducer?: (payload: { producerId: string; userId: string; kind: string }) => void;
  onMediasoupError?: (message: string) => void;
};

export type MediasoupTransportOptions = {
  id: string;
  iceParameters: any;
  iceCandidates: any;
  dtlsParameters: any;
};

export type MediasoupConsumerData = {
  id: string;
  producerId: string;
  kind: string;
  rtpParameters: any;
  type: string;
  producerPaused: boolean;
};

export type JoinState =
  | { status: "waiting"; message: string; millisUntilStart: number; startsAt: number; endsAt: number }
  | { status: "open"; message: string; startsAt: number; endsAt: number }
  | { status: "after"; message: string; endedAt: number };

let socket: Socket | null = null;

function wsBase(): string {
  return `${baseURL}/webrtc`;
}

function bindHandlers(handlers?: WebrtcHandlers) {
  if (!socket || !handlers) return;
  const {
    onCallReady,
    onOffer,
    onAnswer,
    onIceCandidate,
    onParticipants,
    onPeerJoined,
    onPeerLeft,
    onSessionFailed,
    onError,
    onWhiteboardUpdate,
    onChatMessage,
  } = handlers;
  if (onCallReady) socket.on("call-ready", onCallReady);
  if (onOffer) socket.on("offer", onOffer);
  if (onAnswer) socket.on("answer", onAnswer);
  if (onIceCandidate) socket.on("ice-candidate", onIceCandidate);
  if (onParticipants) socket.on("participants", onParticipants);
  if (onPeerJoined) socket.on("peer-joined", onPeerJoined);
  if (onPeerLeft) socket.on("peer-left", onPeerLeft);
  if (onSessionFailed) socket.on("session-failed", onSessionFailed);
  if (onError) socket.on("error", onError);
  if (onWhiteboardUpdate) socket.on("whiteboard-update", onWhiteboardUpdate);
  if (onChatMessage) socket.on("chat-message", onChatMessage);
  if (handlers.onMediasoupNewProducer) socket.on("mediasoup/new-producer", handlers.onMediasoupNewProducer);
  if (handlers.onMediasoupError) socket.on("mediasoup/error", handlers.onMediasoupError);
}

export function connectWebrtc(handlers?: WebrtcHandlers, token?: string) {
  if (socket) return socket;
  const authToken = token ?? readToken();
  if (!authToken) throw new Error("Missing auth token for WebRTC signaling");

  const base = wsBase();

  socket = io(wsBase(), {
    auth: { token: authToken },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10_000,
    withCredentials: false,
    forceNew: true,
    path: "/socket.io",
  });

  socket.on("connect_error", (err) => {
    // Lightweight diagnostic to surface handshake failures
    console.warn("[webrtc] socket connect_error", err?.message || err, { url: base });
  });

  socket.on("disconnect", (reason) => {
    console.warn("[webrtc] socket disconnected", reason);
  });

  socket.on("reconnect_attempt", (attempt) => {
    console.info("[webrtc] reconnect attempt", attempt);
  });

  bindHandlers(handlers);
  return socket;
}

function ensureSocket(): Socket {
  if (!socket) throw new Error("WebRTC socket not connected");
  return socket;
}

export function disconnectWebrtc() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function joinBooking(bookingId: string) {
  ensureSocket().emit("join-booking", { bookingId });
}

export function sendOffer(payload: any) {
  ensureSocket().emit("offer", payload);
}

export function sendAnswer(payload: any) {
  ensureSocket().emit("answer", payload);
}

export function sendIceCandidate(payload: any) {
  ensureSocket().emit("ice-candidate", payload);
}

export function markRtcConnected(bookingId: string) {
  ensureSocket().emit("rtc-connected", { bookingId });
}

export function markConnectionFailed(bookingId: string, reason?: string) {
  ensureSocket().emit("connection-failed", { bookingId, reason });
}

export function emitWhiteboardUpdate(payload: any) {
  const bookingId = payload?.bookingId;
  if (!bookingId) return;
  ensureSocket().emit("whiteboard-update", payload);
}

export function sendChatMessage(payload: { bookingId: string; text: string; clientId?: string }) {
  if (!payload?.bookingId) return;
  const text = (payload?.text || "").trim();
  if (!text) return;
  ensureSocket().emit("chat-send", { bookingId: payload.bookingId, text, clientId: payload.clientId });
}

export function sendClientLog(payload: { bookingId?: string; level?: "debug" | "info" | "warn" | "error"; message: string; data?: any }) {
  ensureSocket().emit("client-log", payload);
}

export async function fetchIceConfig() {
  const res = await api.get("/webrtc/ice-config");
  return res.data;
}

export async function fetchMediasoupStatus() {
  const res = await api.get("/webrtc/mediasoup/status");
  return res.data as { enabled: boolean; workerReady: boolean; routerReady: boolean; error?: string };
}

export async function fetchMediasoupRtpCapabilities() {
  const res = await api.get("/webrtc/mediasoup/rtp-capabilities");
  return res.data;
}

function waitFor<T = any>(event: string, predicate: (data: any) => boolean, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const s = ensureSocket();
    const timer = setTimeout(() => {
      s.off(event, handler as any);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    const handler = (data: any) => {
      if (!predicate(data)) return;
      clearTimeout(timer);
      s.off(event, handler as any);
      resolve(data as T);
    };

    s.on(event, handler as any);
  });
}

export async function createMediasoupTransport(bookingId: string, direction: "send" | "recv", rtpCapabilities?: any) {
  const s = ensureSocket();
  s.emit("mediasoup/create-transport", { bookingId, direction, rtpCapabilities });
  const result = await waitFor<{ direction: string; transport: MediasoupTransportOptions }>(
    "mediasoup/transport-created",
    (d) => d?.transport?.id && d.direction === direction,
  );
  return result.transport;
}

export async function connectMediasoupTransport(bookingId: string, transportId: string, dtlsParameters: any) {
  const s = ensureSocket();
  s.emit("mediasoup/connect-transport", { bookingId, transportId, dtlsParameters });
  await waitFor<{ transportId: string }>("mediasoup/transport-connected", (d) => d?.transportId === transportId);
}

export async function produceMediasoup(
  bookingId: string,
  transportId: string,
  kind: "audio" | "video",
  rtpParameters: any,
) {
  const s = ensureSocket();
  s.emit("mediasoup/produce", { bookingId, transportId, kind, rtpParameters });
  const res = await waitFor<{ producerId: string }>("mediasoup/produced", (d) => !!d?.producerId);
  return res.producerId;
}

export async function consumeMediasoup(
  bookingId: string,
  transportId: string,
  producerId: string,
  rtpCapabilities: any,
): Promise<MediasoupConsumerData> {
  const s = ensureSocket();
  s.emit("mediasoup/consume", { bookingId, transportId, producerId, rtpCapabilities });
  return await waitFor<MediasoupConsumerData>("mediasoup/consumed", (d) => d?.producerId === producerId);
}

export function computeJoinState(startTime: string | Date, endTime: string | Date): JoinState {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const now = Date.now();

  if (Number.isNaN(start)) return { status: "after", message: "Schedule unavailable", endedAt: now };

  const maxDurationMs = 60 * 60_000;
  const computedEnd = Number.isNaN(end) ? start + maxDurationMs : Math.min(end, start + maxDurationMs);

  if (now < start) {
    return {
      status: "waiting",
      message: `Class starts at ${new Date(startTime).toLocaleString()}`,
      millisUntilStart: start - now,
      startsAt: start,
      endsAt: computedEnd,
    };
  }

  if (now > computedEnd) {
    return {
      status: "after",
      message: `Class ended at ${new Date(computedEnd).toLocaleString()}`,
      endedAt: computedEnd,
    };
  }

  return {
    status: "open",
    message: "Class in progress",
    startsAt: start,
    endsAt: computedEnd,
  };
}

export function currentSocket(): Socket | null {
  return socket;
}
