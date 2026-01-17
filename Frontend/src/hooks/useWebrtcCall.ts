import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeJoinState,
  connectWebrtc,
  currentSocket,
  disconnectWebrtc,
  fetchIceConfig,
  fetchMediasoupRtpCapabilities,
  createMediasoupTransport,
  connectMediasoupTransport,
  produceMediasoup,
  consumeMediasoup,
  joinBooking,
  markConnectionFailed,
  markRtcConnected,
  sendAnswer,
  sendIceCandidate,
  sendOffer,
  sendClientLog,
  sendChatMessage,
} from "../services/webrtcClient";

import type { WebrtcHandlers } from "../services/webrtcClient";

const requestMedia = async () => {
  console.log("[webrtc] requesting media permissions...");
  // Request audio-only by default (camera video disabled)
  const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
  console.log("[webrtc] media permission granted", {
    audio: stream.getAudioTracks().length,
    video: stream.getVideoTracks().length,
  });
  return stream;
};

export type PeerCallbacks = Pick<
  WebrtcHandlers,
  "onOffer" | "onAnswer" | "onIceCandidate" | "onCallReady" | "onParticipants" | "onPeerJoined" | "onPeerLeft" | "onSessionFailed" | "onChatMessage" | "onError"
>;

export function useWebrtcCall(bookingId: string | null, startTime?: string | Date, endTime?: string | Date, handlers?: PeerCallbacks) {
  const [joinState, setJoinState] = useState(() =>
    startTime && endTime
      ? computeJoinState(startTime, endTime)
      : ({ status: "waiting", message: "Loading", millisUntilStart: 0, startsAt: 0, endsAt: 0 } as const),
  );
  const [iceConfig, setIceConfig] = useState<any>(null);
  const [rtpCapabilities, setRtpCapabilities] = useState<any>(null);
  const [sendTransport, setSendTransport] = useState<any>(null);
  const [recvTransport, setRecvTransport] = useState<any>(null);
  const hasJoined = useRef(false);

  const boundHandlers = useMemo<WebrtcHandlers>(() => ({
    ...handlers,
    onCallReady: (payload) => handlers?.onCallReady?.(payload),
    onSessionFailed: (payload) => {
      hasJoined.current = false;
      handlers?.onSessionFailed?.(payload);
    },
  }), [handlers]);

  useEffect(() => {
    if (!startTime || !endTime) return;
    const interval = setInterval(() => {
      setJoinState(computeJoinState(startTime, endTime));
    }, 5_000);
    setJoinState(computeJoinState(startTime, endTime));
    return () => clearInterval(interval);
  }, [startTime, endTime]);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    let socket: ReturnType<typeof connectWebrtc> | null = null;

    const onDisconnect = () => {
      hasJoined.current = false;
      console.log("[webrtc] socket disconnected - will require rejoin on reconnect");
    };

    (async () => {
      try {
        await requestMedia();
        if (cancelled) return;

        socket = connectWebrtc(boundHandlers);
        socket.on("connect", () => console.log("[webrtc] socket connected", socket?.id));
        socket.on("connect_error", (err: any) => console.error("[webrtc] socket connect_error", err));
        socket.on("disconnect", onDisconnect);

        fetchIceConfig().then(setIceConfig).catch(() => setIceConfig(null));

        let mediasoupEnabled = false;
        try {
          mediasoupEnabled = localStorage.getItem("mediasoup_enabled") === "true";
        } catch {
          mediasoupEnabled = false;
        }

        if (mediasoupEnabled) {
          fetchMediasoupRtpCapabilities().then(setRtpCapabilities).catch(() => setRtpCapabilities(null));
        }
      } catch (err) {
        console.error("[webrtc] media permission denied or failed", err);
      }
    })();

    return () => {
      cancelled = true;
      if (socket) {
        socket.off("disconnect", onDisconnect);
        socket.off("connect");
        socket.off("connect_error");
      }
      disconnectWebrtc();
    };
  }, [bookingId, boundHandlers]);

  useEffect(() => {
    if (joinState.status === "open") {
      if (currentSocket()?.connected) {
        join();
      } else {
        currentSocket()?.once("connect", () => join());
      }
    } else if (joinState.status === "after") {
      hasJoined.current = false;
    }
  }, [joinState.status]);

  const join = async () => {
    const s = currentSocket();
    if (!bookingId || hasJoined.current || !s || !s.connected) return;
    const ack = await joinBooking(bookingId);
    if (!ack?.ok) return;
    hasJoined.current = true;
  };

  const signalOffer = (sdp: any) => sendOffer({ bookingId, sdp });
  const signalAnswer = (sdp: any) => sendAnswer({ bookingId, sdp });
  const signalIce = (candidate: any) => sendIceCandidate({ bookingId, candidate });
  const markConnected = () => bookingId && markRtcConnected(bookingId);
  const markFailed = (reason?: string) => bookingId && markConnectionFailed(bookingId, reason);

  const sendChat = (text: string, clientId?: string) => {
    if (!bookingId) return;
    sendChatMessage({ bookingId, text, clientId });
  };

  const logClient = (message: string, data?: any, level: "debug" | "info" | "warn" | "error" = "debug") => {
    try {
      sendClientLog({ bookingId: bookingId ?? undefined, level, message, data });
    } catch {
      // ignore if socket not connected
    }
  };

  const createSendTransport = async () => {
    if (!bookingId) throw new Error("No bookingId");
    const transport = await createMediasoupTransport(bookingId, "send", rtpCapabilities);
    setSendTransport(transport);
    return transport;
  };

  const connectSendTransport = async (dtlsParameters: any) => {
    if (!bookingId || !sendTransport) throw new Error("Send transport missing");
    await connectMediasoupTransport(bookingId, sendTransport.id, dtlsParameters);
  };

  const createRecvTransport = async () => {
    if (!bookingId) throw new Error("No bookingId");
    const transport = await createMediasoupTransport(bookingId, "recv", rtpCapabilities);
    setRecvTransport(transport);
    return transport;
  };

  const connectRecvTransport = async (dtlsParameters: any) => {
    if (!bookingId || !recvTransport) throw new Error("Recv transport missing");
    await connectMediasoupTransport(bookingId, recvTransport.id, dtlsParameters);
  };

  const produceTrack = async (kind: "audio" | "video", rtpParameters: any) => {
    if (!bookingId || !sendTransport) throw new Error("Send transport missing");
    return await produceMediasoup(bookingId, sendTransport.id, kind, rtpParameters);
  };

  const consumeTrack = async (producerId: string) => {
    if (!bookingId || !recvTransport || !rtpCapabilities) throw new Error("Recv transport or caps missing");
    return await consumeMediasoup(bookingId, recvTransport.id, producerId, rtpCapabilities);
  };

  return {
    socket: currentSocket(),
    joinState,
    iceConfig,
    rtpCapabilities,
    join,
    signalOffer,
    signalAnswer,
    signalIce,
    markConnected,
    markFailed,
    logClient,
    sendChat,
    createSendTransport,
    connectSendTransport,
    createRecvTransport,
    connectRecvTransport,
    produceTrack,
    consumeTrack,
    sendTransport,
    recvTransport,
  };
}
