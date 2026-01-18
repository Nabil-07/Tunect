import { io, Socket } from "socket.io-client";
import api, { readToken } from "../lib/apiClient";

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
  onGatewayError?: (payload: { code: string; reason?: string }) => void;
  onJoinFailed?: (reason?: string) => void;
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
let joinAttempted = false;
let currentHandlers: WebrtcHandlers | null = null;
export type WebrtcSocketState =
  | "idle"
  | "connecting"
  | "connected"
  | "joined"
  | "failed"
  | "disconnected";
let socketState: WebrtcSocketState = "idle";
const socketStateListeners = new Set<(state: WebrtcSocketState) => void>();

function setSocketState(next: WebrtcSocketState) {
  if (socketState === next) return;
  socketState = next;
  socketStateListeners.forEach((cb) => cb(next));
}

export function getWebrtcSocketState() {
  return socketState;
}

export function onWebrtcSocketStateChange(cb: (state: WebrtcSocketState) => void) {
  socketStateListeners.add(cb);
  return () => socketStateListeners.delete(cb);
}

function wsBase(): string {
  const devProxyTarget = import.meta.env.VITE_API_PROXY_TARGET;
  const envApiUrl = import.meta.env.VITE_API_URL;

  // In dev, prefer Vite proxy target, then explicit API URL, then same-origin.
  if (import.meta.env.DEV) {
    const devUrl = devProxyTarget || envApiUrl || window.location.origin;
    return devUrl.replace(/\/+$/, "");
  }

  // In prod, always use explicit API URL (fallback to preprod).
  const rawBackendUrl = envApiUrl || "https://api-preprod.tunectnow.com";
  return rawBackendUrl.replace(/\/+$/, "");
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
  socket.on("gateway-error", (payload: { code: string; reason?: string }) => {
    console.warn("[webrtc] gateway-error received:", payload);
    setSocketState("failed");
    
    // Differentiate auth failure from join denial
    const failureCode = payload?.code || "UNKNOWN_ERROR";
    const failureReason = payload?.reason || failureCode;
    
    emitJoinFailed(failureCode);
    handlers.onGatewayError?.(payload);
    if (handlers.onError) {
      handlers.onError(failureReason);
    }
  });
  if (handlers.onMediasoupNewProducer) socket.on("mediasoup/new-producer", handlers.onMediasoupNewProducer);
  if (handlers.onMediasoupError) socket.on("mediasoup/error", handlers.onMediasoupError);
}

function emitJoinFailed(reason?: string) {
  if (!currentHandlers) return;
  currentHandlers.onJoinFailed?.(reason);
}

function resetJoinAttempt() {
  joinAttempted = false;
}

export function connectWebrtc(handlers?: WebrtcHandlers, token?: string) {
  if (socket) return socket;
  currentHandlers = handlers ?? null;
  const authToken = token ?? readToken();
  if (!authToken) throw new Error("Missing auth token for WebRTC signaling");

  const backendUrl = wsBase();
  
  // Socket.IO namespace handling:
  // Connect to base server, then use .of('/webrtc') to join namespace
  // Socket.IO constructs: {backendUrl}/socket.io/?EIO=4&transport=websocket
  // Then joins namespace /webrtc via .of('/webrtc')
  // In dev mode, backendUrl is http://localhost:3000 (direct connection)
  // In prod, backendUrl is https://api-preprod.tunectnow.com
  
  // Log connection attempt for debugging
  const tokenPreview = authToken ? `${authToken.substring(0, 20)}...` : 'MISSING';
  if (import.meta.env.DEV) {
    console.log(`[webrtc] Connecting to WebSocket: ${backendUrl} namespace=/webrtc (dev mode)`, { tokenPreview });
  } else {
    console.log(`[webrtc] Connecting to WebSocket: ${backendUrl} namespace=/webrtc (production)`, { tokenPreview });
  }
  
  setSocketState("connecting");
  
  // Connect directly to /webrtc namespace
  // Socket.IO will construct: {backendUrl}/socket.io/?EIO=4&transport=websocket
  // And join namespace /webrtc automatically when URL includes the namespace path
  socket = io(`${backendUrl}/webrtc`, {
    auth: { token: authToken },
    transports: ["websocket"], // WebSocket only, no polling
    withCredentials: false, // JWT auth only, no cookies
    forceNew: true,
    path: "/socket.io",
    timeout: 20_000,
  });

  socket.on("connect", () => {
    setSocketState("connected");
    if (import.meta.env.DEV && authToken) {
      console.log("[webrtc] Socket connected with auth token");
    }
  });

  socket.on("connect_error", (err) => {
    // Lightweight diagnostic to surface handshake failures
    console.warn("[webrtc] socket connect_error", err?.message || err, { url: backendUrl, namespace: '/webrtc' });
    // Don't overwrite if already failed
    if (socketState !== "failed") {
      setSocketState("failed");
    }
  });

  socket.on("disconnect", (reason) => {
    console.warn("[webrtc] socket disconnected", reason);
    
    // If we already joined, this is a normal disconnect (network drop, etc.)
    if (socketState === "joined") {
      setSocketState("disconnected");
      return;
    }
    
    // If we were already in failed state (from connect_error), don't change
    if (socketState === "failed") {
      return;
    }
    
    // Server forcibly disconnected us before we joined - likely auth failure
    if (reason === "io server disconnect" && !joinAttempted) {
      setSocketState("failed");
      emitJoinFailed("AUTH_FAILED");
      if (currentHandlers?.onError) {
        currentHandlers.onError("AUTH_FAILED");
      }
      return;
    }
    
    // Any other disconnect before joining is a connection failure
    if (!joinAttempted) {
      setSocketState("failed");
      emitJoinFailed("SOCKET_DISCONNECTED");
      if (currentHandlers?.onError) {
        currentHandlers.onError("SOCKET_DISCONNECTED");
      }
      return;
    }
    
    setSocketState("disconnected");
  });

  socket.on("reconnect_attempt", (attempt) => {
    console.info("[webrtc] reconnect attempt", attempt);
  });

  bindHandlers(handlers);
  resetJoinAttempt();
  return socket;
}

async function ensureSocketConnected(timeoutMs = 10_000): Promise<boolean> {
  if (!socket) return false;
  if (socket.connected) {
    if (socketState === "idle" || socketState === "connecting") setSocketState("connected");
    return true;
  }
  const start = Date.now();
  return await new Promise((resolve) => {
    const timer = window.setInterval(() => {
      if (!socket) {
        window.clearInterval(timer);
        resolve(false);
        return;
      }
      if (socket.connected) {
        window.clearInterval(timer);
        setSocketState("connected");
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

export function disconnectWebrtc() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  setSocketState("disconnected");
  resetJoinAttempt();
  currentHandlers = null;
}

export async function joinBooking(bookingId: string) {
  if (joinAttempted) {
    setSocketState("failed");
    emitJoinFailed("JOIN_ALREADY_ATTEMPTED");
    return { ok: false, reason: "JOIN_ALREADY_ATTEMPTED" };
  }
  joinAttempted = true;
  if (!socket) return { ok: false, reason: "SOCKET_NOT_CONNECTED" };
  const ok = await ensureSocketConnected();
  if (!ok || !socket.connected) {
    setSocketState("failed");
    return { ok: false, reason: "SOCKET_NOT_CONNECTED" };
  }

  return await new Promise<{ ok: boolean; reason?: string; role?: 'tutor' | 'student' }>((resolve) => {
    socket?.emit("join-booking", { bookingId }, (ack: { ok: boolean; reason?: string; role?: 'tutor' | 'student' }) => {
      if (!ack?.ok) {
        setSocketState("failed");
        emitJoinFailed(ack?.reason);
        disconnectWebrtc();
        currentHandlers?.onError?.(ack?.reason || "Join denied");
        resolve({ ok: false, reason: ack?.reason });
        return;
      }
      setSocketState("joined");
      if (import.meta.env.DEV) {
        console.log(`[webrtc] join-booking ACK ok, role=${ack.role}`);
      }
      resolve({ ok: true, role: ack.role });
    });
  });
}

async function ensureSocketReady(timeoutMs = 5_000): Promise<boolean> {
  if (!socket) return false;
  const start = Date.now();
  return await new Promise((resolve) => {
    const timer = window.setInterval(() => {
      if (!socket) {
        window.clearInterval(timer);
        resolve(false);
        return;
      }
      if (socket.connected && socketState === "joined") {
        window.clearInterval(timer);
        resolve(true);
        return;
      }
      if (socketState === "failed" || socketState === "disconnected") {
        window.clearInterval(timer);
        resolve(false);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

export async function sendOffer(payload: any) {
  const ok = await ensureSocketReady();
  if (!ok) return;
  socket?.emit("offer", payload);
}

export async function sendAnswer(payload: any) {
  const ok = await ensureSocketReady();
  if (!ok) return;
  socket?.emit("answer", payload);
}

export async function sendIceCandidate(payload: any) {
  const ok = await ensureSocketReady();
  if (!ok) return;
  socket?.emit("ice-candidate", payload);
}

export async function markRtcConnected(bookingId: string) {
  const ok = await ensureSocketReady();
  if (!ok) return;
  socket?.emit("rtc-connected", { bookingId });
}

export async function markConnectionFailed(bookingId: string, reason?: string) {
  const ok = await ensureSocketReady();
  if (!ok) return;
  socket?.emit("connection-failed", { bookingId, reason });
}

export function emitWhiteboardUpdate(payload: any) {
  const bookingId = payload?.bookingId;
  if (!bookingId) return;
  ensureSocketReady().then((ok) => {
    if (!ok) return;
    socket?.emit("whiteboard-update", payload);
  });
}

export function sendChatMessage(payload: { bookingId: string; text: string; clientId?: string }) {
  if (!payload?.bookingId) return;
  const text = (payload?.text || "").trim();
  if (!text) return;
  ensureSocketReady().then((ok) => {
    if (!ok) return;
    socket?.emit("chat-send", { bookingId: payload.bookingId, text, clientId: payload.clientId });
  });
}

export function sendClientLog(payload: { bookingId?: string; level?: "debug" | "info" | "warn" | "error"; message: string; data?: any }) {
  ensureSocketReady().then((ok) => {
    if (!ok) return;
    socket?.emit("client-log", payload);
  });
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
    const s = socket;
    if (!s) {
      reject(new Error("WebRTC socket not connected"));
      return;
    }
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
  const ready = await ensureSocketReady();
  const s = socket;
  if (!ready || !s) throw new Error("WebRTC socket not connected");
  s.emit("mediasoup/create-transport", { bookingId, direction, rtpCapabilities });
  const result = await waitFor<{ direction: string; transport: MediasoupTransportOptions }>(
    "mediasoup/transport-created",
    (d) => d?.transport?.id && d.direction === direction,
  );
  return result.transport;
}

export async function connectMediasoupTransport(bookingId: string, transportId: string, dtlsParameters: any) {
  const ready = await ensureSocketReady();
  const s = socket;
  if (!ready || !s) throw new Error("WebRTC socket not connected");
  s.emit("mediasoup/connect-transport", { bookingId, transportId, dtlsParameters });
  await waitFor<{ transportId: string }>("mediasoup/transport-connected", (d) => d?.transportId === transportId);
}

export async function produceMediasoup(
  bookingId: string,
  transportId: string,
  kind: "audio" | "video",
  rtpParameters: any,
) {
  const ready = await ensureSocketReady();
  const s = socket;
  if (!ready || !s) throw new Error("WebRTC socket not connected");
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
  const ready = await ensureSocketReady();
  const s = socket;
  if (!ready || !s) throw new Error("WebRTC socket not connected");
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
