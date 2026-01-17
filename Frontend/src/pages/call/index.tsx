import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Mic, MicOff, MonitorUp, RotateCcw, Video, VideoOff } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { getBookingDetails, type BookingDetailsDto } from "../../services/bookingsService";
import { useToast } from "../../contexts/ToastContext";
import { getTokenPayload } from "../../lib/apiClient";
import { useWebrtcCall } from "../../hooks/useWebrtcCall";
import { disconnectWebrtc, getWebrtcSocketState, onWebrtcSocketStateChange } from "../../services/webrtcClient";
import Whiteboard from "../../components/Whiteboard/Whiteboard";

type MediaMode = "video" | "audio" | "whiteboard";
type SidePanelTab = "whiteboard" | "participants" | "chat";

type Participant = { userId: string; role: string };

type ChatMessage = {
  id: string;
  bookingId: string;
  userId: string;
  role: string;
  text: string;
  ts: string;
  clientId?: string;
};

type ConnSnapshot = {
  iceConnectionState?: RTCIceConnectionState;
  connectionState?: RTCPeerConnectionState;
  iceGatheringState?: RTCIceGatheringState;
  signalingState?: RTCSignalingState;
  turnInUse?: boolean;
  selectedCandidateType?: string;
};

function isDebugEnabled() {
  try {
    return localStorage.getItem("webrtc_debug") === "true";
  } catch {
    return false;
  }
}

async function getStatsSummary(pc: RTCPeerConnection): Promise<{ turnInUse: boolean; selectedCandidateType?: string } | null> {
  try {
    const stats = await pc.getStats();
    let selectedPair: any = null;
    let localCandidate: any = null;

    stats.forEach((report: any) => {
      if (report.type === "transport" && report.selectedCandidatePairId) {
        selectedPair = stats.get(report.selectedCandidatePairId);
      }
    });

    if (!selectedPair) {
      stats.forEach((report: any) => {
        if (report.type === "candidate-pair" && report.selected) selectedPair = report;
      });
    }

    if (selectedPair?.localCandidateId) {
      localCandidate = stats.get(selectedPair.localCandidateId);
    }

    const candidateType = localCandidate?.candidateType || localCandidate?.type;
    const turnInUse = candidateType === "relay";

    return { turnInUse, selectedCandidateType: candidateType };
  } catch {
    return null;
  }
}

function formatCountdown(ms: number | null) {
  if (ms === null) return "--:--";
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

type UiPhase = "waiting" | "connecting" | "live" | "weak" | "reconnecting" | "ended";

type ConnectionState = "connecting" | "waiting" | "live" | "weak-network" | "reconnecting";

function deriveUiPhase(params: {
  waiting: boolean;
  sessionEnded: boolean;
  socketConnected: boolean;
  conn: ConnSnapshot;
}) {
  const { waiting, sessionEnded, socketConnected, conn } = params;
  if (waiting) return "waiting";
  if (sessionEnded) return "ended";
  if (!socketConnected) return "connecting";
  if (conn.connectionState === "failed") return "reconnecting";
  if (conn.iceConnectionState === "disconnected" || conn.connectionState === "connecting") return "weak";
  if (conn.connectionState === "connected" || conn.iceConnectionState === "completed") return "live";
  return "connecting";
}

function joinReasonMessage(reason?: string) {
  const reasonMap: Record<string, string> = {
    NOT_PART_OF_BOOKING: "You are not part of this booking.",
    BOOKING_NOT_FOUND: "Booking not found.",
    BOOKING_NOT_ACTIVE: "This booking is not active yet.",
    CALL_WINDOW_NOT_ACTIVE: "The call window is not active yet.",
    GROUP_SESSION_NOT_SUPPORTED: "Group sessions are not supported for this call.",
    JOIN_DENIED: "You are not allowed to join this class.",
    JOIN_TIMEOUT: "Unable to join the call. Please try again.",
    SOCKET_DISCONNECTED: "Connection lost before joining the call.",
    JOIN_ALREADY_ATTEMPTED: "Unable to join the call at the moment.",
    SOCKET_NOT_CONNECTED: "Unable to connect to the signaling server.",
  };
  return reasonMap[reason || ""] || reason || "Unable to join the call.";
}

type CallSessionProps = {
  bookingId: string;
  data: BookingDetailsDto;
  meUserId?: string;
  onJoinBlocked?: (reason: string) => void;
};

function CallSession({ bookingId, data, meUserId, onJoinBlocked }: CallSessionProps) {
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

  const [mediaMode, setMediaMode] = useState<MediaMode>("video");
  const [activeTab, setActiveTab] = useState<SidePanelTab>("whiteboard");
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [conn, setConn] = useState<ConnSnapshot>({});
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [socketState, setSocketState] = useState(getWebrtcSocketState());
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [countdownMs, setCountdownMs] = useState<number | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const reconnectAttempts = useRef(0);
  const lastTurnLogged = useRef<boolean | null>(null);
  const sessionClosedRef = useRef(false);
  const isInitiatorRef = useRef(false);
  const peerJoinedRef = useRef(false);
  const offerSentRef = useRef(false);
  const localMediaReadyRef = useRef(false);

  const me = useMemo(() => ({ userId: meUserId }), [meUserId]);

  const handleJoinBlocked = (reason: string) => {
    if (blockedMessage) return;
    const friendly = joinReasonMessage(reason);
    setBlockedMessage(friendly);
    showError(friendly);
    teardown();
    disconnectWebrtc();
    setMediaMode("whiteboard");
    setActiveTab("whiteboard");
    setConn({ connectionState: "failed" });
    onJoinBlocked?.(reason);
  };

  const handlers = useMemo(
    () => ({
      onGatewayError: (payload: { code: string; reason?: string }) => {
        handleJoinBlocked(payload?.reason || "JOIN_DENIED");
      },
      onJoinFailed: (reason?: string) => {
        handleJoinBlocked(reason || "JOIN_DENIED");
      },
      onCallReady: (payload: { bookingId: string; initiatorId: string }) => {
        if (!bookingId || payload.bookingId !== bookingId) return;
        const isInitiator = !!me.userId && payload.initiatorId === me.userId;
        isInitiatorRef.current = isInitiator;
        if (isDebugEnabled()) {
          console.debug("[webrtc] call-ready", { isInitiator, payload });
          logClient("call-ready", { isInitiator, initiatorId: payload.initiatorId });
        }
        ensurePeerConnection().catch((e) => {
          showError(e?.message || "Failed to start call");
        });
      },
      onOffer: async (payload: any) => {
        if (!bookingId || payload?.bookingId !== bookingId) return;
        const pc = await ensurePeerConnection();
        if (isDebugEnabled()) logClient("received-offer");
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signalAnswer(answer);
        if (isDebugEnabled()) logClient("sent-answer");
      },
      onAnswer: async (payload: any) => {
        if (!bookingId || payload?.bookingId !== bookingId) return;
        const pc = pcRef.current;
        if (!pc) return;
        if (isDebugEnabled()) logClient("received-answer");
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      },
      onIceCandidate: async (payload: any) => {
        if (!bookingId || payload?.bookingId !== bookingId) return;
        const pc = pcRef.current;
        if (!pc || !payload?.candidate) return;
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch (err) {
          if (isDebugEnabled()) console.debug("[webrtc] addIceCandidate failed", err);
        }
      },
      onPeerLeft: () => {
        showError("Peer left the call");
        setParticipants((prev) => (me.userId ? prev.filter((p) => p.userId === me.userId) : []));
        teardownPeer();
      },
      onParticipants: (payload: { bookingId: string; participants: Participant[] }) => {
        if (!bookingId || payload.bookingId !== bookingId) return;
        const list = Array.isArray(payload.participants) ? payload.participants : [];
        setParticipants(() => {
          const merged = new Map<string, Participant>();
          list.forEach((p) => {
            if (p?.userId) merged.set(p.userId, p);
          });
          if (me.userId && !merged.has(me.userId)) merged.set(me.userId, { userId: me.userId, role: "unknown" });
          return Array.from(merged.values());
        });
      },
      onPeerJoined: (payload: { userId: string; role: string }) => {
        if (!payload?.userId) return;
        peerJoinedRef.current = true;
        setParticipants((prev) => {
          const merged = new Map(prev.map((p) => [p.userId, p] as const));
          merged.set(payload.userId, { userId: payload.userId, role: payload.role });
          return Array.from(merged.values());
        });
        // If we're the initiator and local media is ready, start negotiation only after peer joins
        maybeStartNegotiation().catch(() => {});
      },
      onSessionFailed: (p: { reason: string }) => {
        showError(`Session failed: ${p.reason}`);
        teardownPeer();
        setActiveTab("whiteboard");
      },
      onError: (message: string) => {
        handleJoinBlocked(message || "JOIN_DENIED");
      },
      onChatMessage: (msg: ChatMessage) => {
        if (!bookingId || msg?.bookingId !== bookingId) return;
        if (!msg?.id || !msg?.text) return;
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg].slice(-200);
        });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookingId, me.userId, handleJoinBlocked],
  );

  const {
    socket,
    joinState,
    iceConfig,
    join,
    signalOffer,
    signalAnswer,
    signalIce,
    markConnected,
    markFailed,
    logClient,
    sendChat,
  } = useWebrtcCall(bookingId, data?.startTime ?? undefined, data?.endTime ?? undefined, handlers);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // Booking is validated in the parent before this component mounts.

  useEffect(() => {
    const unsubscribe = onWebrtcSocketStateChange(setSocketState);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (blockedMessage) return;
    if (socketState === "connecting" || socketState === "connected") {
      const timer = window.setTimeout(() => {
        if (getWebrtcSocketState() !== "joined" && !blockedMessage) {
          handleJoinBlocked("JOIN_TIMEOUT");
        }
      }, 15_000);
      return () => window.clearTimeout(timer);
    }
  }, [socketState, blockedMessage]);

  useEffect(() => {
    if (blockedMessage) return;
    if (socketState === "disconnected" && getWebrtcSocketState() !== "joined") {
      handleJoinBlocked("SOCKET_DISCONNECTED");
    }
  }, [socketState, blockedMessage]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (joinState.status === "waiting") {
        sessionClosedRef.current = false;
        setCountdownMs(joinState.startsAt - Date.now());
      } else if (joinState.status === "open") {
        const remaining = joinState.endsAt - Date.now();
        setCountdownMs(remaining);
        if (remaining <= 0 && !sessionClosedRef.current) {
          sessionClosedRef.current = true;
          setMediaMode("whiteboard");
          teardownPeer();
          showError("Class time is over.");
        }
      } else {
        sessionClosedRef.current = false;
        setCountdownMs(null);
      }
    };

    tick();
    if (joinState.status === "waiting" || joinState.status === "open") {
      timer = setInterval(tick, 1_000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [joinState, showError]);

  useEffect(() => {
    if (joinState.status === "open") {
      join();
    }
  }, [joinState.status]);

  useEffect(() => {
    return () => teardown();
  }, []);

  async function getLocalMedia(preferVideo: boolean): Promise<{ stream: MediaStream; mode: MediaMode }> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: preferVideo,
        audio: true,
      });
      return { stream, mode: preferVideo ? "video" : "audio" };
    } catch (err) {
      if (preferVideo) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          return { stream, mode: "audio" };
        } catch {
          return { stream: new MediaStream(), mode: "whiteboard" };
        }
      }
      return { stream: new MediaStream(), mode: "whiteboard" };
    }
  }

  async function ensurePeerConnection(): Promise<RTCPeerConnection> {
    if (!bookingId) throw new Error("Missing bookingId");

    if (pcRef.current) return pcRef.current;

    // Acquire local media first (must be ready before creating PeerConnection)
    const local = await getLocalMedia(false);
    localMediaReadyRef.current = true;
    setMediaMode(local.mode);
    if (local.mode === "whiteboard") {
      setActiveTab("whiteboard");
    }
    localStreamRef.current = local.stream;
    cameraVideoTrackRef.current = local.stream.getVideoTracks()[0] ?? null;

    if (isDebugEnabled()) {
      logClient("local-media", {
        mode: local.mode,
        audioTracks: local.stream.getAudioTracks().length,
        videoTracks: local.stream.getVideoTracks().length,
      });
    }

    const iceServers = iceConfig?.iceServers || [{ urls: "stun:stun.l.google.com:19302" }];
    const cfg: RTCConfiguration = { iceServers, iceCandidatePoolSize: 2 };

    const pc = new RTCPeerConnection(cfg);
    pcRef.current = pc;

    remoteStreamRef.current = new MediaStream();

    pc.ontrack = (evt) => {
      if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
      evt.streams[0]?.getTracks()?.forEach((t) => remoteStreamRef.current?.addTrack(t));
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
    };

    pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        signalIce(evt.candidate);
      }
    };

    pc.oniceconnectionstatechange = () => {
      setConn((c) => ({ ...c, iceConnectionState: pc.iceConnectionState }));
      if (isDebugEnabled()) {
        console.debug("[webrtc] iceConnectionState", pc.iceConnectionState);
        logClient("iceConnectionState", { state: pc.iceConnectionState });
      }

      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        markConnected();
      }

      if (pc.iceConnectionState === "failed") {
        handleIceFailure("ice_failed");
      }
    };

    pc.onconnectionstatechange = () => {
      setConn((c) => ({ ...c, connectionState: pc.connectionState }));
      if (isDebugEnabled()) {
        console.debug("[webrtc] connectionState", pc.connectionState);
        logClient("connectionState", { state: pc.connectionState });
      }
      if (pc.connectionState === "failed") {
        handleIceFailure("connection_failed");
      }
    };

    pc.onsignalingstatechange = () => setConn((c) => ({ ...c, signalingState: pc.signalingState }));
    pc.onicegatheringstatechange = () => setConn((c) => ({ ...c, iceGatheringState: pc.iceGatheringState }));

    // Attach local preview
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = local.stream;
    }

    local.stream.getTracks().forEach((track) => pc.addTrack(track, local.stream));

    // TURN detection (debug-level)
    if (isDebugEnabled()) {
      const interval = window.setInterval(async () => {
        if (!pcRef.current) {
          window.clearInterval(interval);
          return;
        }
        const summary = await getStatsSummary(pc);
        if (!summary) return;
        setConn((c) => ({ ...c, turnInUse: summary.turnInUse, selectedCandidateType: summary.selectedCandidateType }));

        if (lastTurnLogged.current !== summary.turnInUse) {
          lastTurnLogged.current = summary.turnInUse;
          console.debug("[webrtc] candidateType", summary.selectedCandidateType, "turnInUse", summary.turnInUse);
          logClient("selected-candidate", { candidateType: summary.selectedCandidateType, turnInUse: summary.turnInUse });
        }
      }, 4000);
    }

    // Attempt negotiation if we already know the peer is present
    maybeStartNegotiation().catch(() => {});
    return pc;
  }

  async function maybeStartNegotiation() {
    if (blockedMessage) return;
    if (!bookingId) return;
    if (!isInitiatorRef.current) return;
    if (!peerJoinedRef.current) return;
    if (offerSentRef.current) return;
    if (!localMediaReadyRef.current) return;

    // Ensure we have joined the booking before negotiating
    join();

    const pc = await ensurePeerConnection();
    // Audio-only by default (camera video disabled)
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
    await pc.setLocalDescription(offer);
    signalOffer(offer);
    offerSentRef.current = true;
    showSuccess("Calling...");
    if (isDebugEnabled()) logClient("sent-offer");
  }

  async function startScreenShare() {
    // Only tutors can share screen
    const userIsTutor = data?.tutor?.id === me.userId;
    if (!userIsTutor) {
      showError("Only tutors can share their screen");
      return;
    }

    try {
      const pc = pcRef.current;
      if (!pc) throw new Error("Call is not started yet");

      // Add bitrate and FPS limits for screen sharing
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { max: 30 },
        },
        audio: false,
      });
      const displayTrack = displayStream.getVideoTracks()[0];
      if (!displayTrack) throw new Error("No screen track available");

      screenStreamRef.current = displayStream;
      setSharingScreen(true);

      // When user stops sharing from browser UI, revert.
      displayTrack.onended = () => {
        stopScreenShare().catch(() => {});
      };

      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(displayTrack);
        // Apply bitrate constraints for screen share (max 2Mbps)
        try {
          const params = sender.getParameters();
          if (params.encodings && params.encodings[0]) {
            params.encodings[0].maxBitrate = 2000000; // 2 Mbps
          }
          await sender.setParameters(params);
        } catch (err) {
          // Bitrate constraints not supported in all browsers, continue anyway
          if (isDebugEnabled()) console.debug("[webrtc] failed to set bitrate constraints", err);
        }
      } else {
        const addedSender = pc.addTrack(displayTrack, displayStream);
        // Apply bitrate constraints for screen share (max 2Mbps)
        try {
          const params = addedSender.getParameters();
          if (params.encodings && params.encodings[0]) {
            params.encodings[0].maxBitrate = 2000000; // 2 Mbps
          }
          await addedSender.setParameters(params);
        } catch (err) {
          // Bitrate constraints not supported in all browsers, continue anyway
          if (isDebugEnabled()) console.debug("[webrtc] failed to set bitrate constraints", err);
        }
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = displayStream;
      }

      if (isDebugEnabled()) logClient("screen-share-started");
    } catch (e: any) {
      showError(e?.message || "Failed to start screen sharing");
      setSharingScreen(false);
    }
  }

  async function stopScreenShare() {
    const pc = pcRef.current;
    const screen = screenStreamRef.current;
    screenStreamRef.current = null;

    try {
      screen?.getTracks().forEach((t) => t.stop());
    } catch {}

    setSharingScreen(false);

    try {
      if (!pc) return;
      const cameraTrack = cameraVideoTrackRef.current;
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(cameraTrack);
      }

      // Restore local preview to camera stream (if present)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      if (isDebugEnabled()) logClient("screen-share-stopped");
    } catch {
      // ignore
    }
  }

  async function handleIceFailure(reason: string) {
    if (reconnectAttempts.current >= 3) {
      markFailed(reason);
      setMediaMode("whiteboard");
      teardownPeer();
      if (isDebugEnabled()) logClient("ice-failure-fallback", { reason, attempts: reconnectAttempts.current }, "warn");
      return;
    }

    reconnectAttempts.current += 1;
    if (isDebugEnabled()) {
      console.debug("[webrtc] attempting ICE restart", reconnectAttempts.current);
      logClient("ice-restart", { reason, attempt: reconnectAttempts.current }, "warn");
    }

    try {
      const pc = pcRef.current;
      if (!pc) return;
      pc.restartIce();
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      signalOffer(offer);
    } catch {
      // If restart fails, fall back
      markFailed(reason);
      setMediaMode("whiteboard");
      teardownPeer();
      if (isDebugEnabled()) logClient("ice-restart-failed", { reason }, "error");
    }
  }

  function teardownPeer() {
    try {
      try {
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}
      screenStreamRef.current = null;
      setSharingScreen(false);

      pcRef.current?.getSenders().forEach((s) => {
        try {
          s.track?.stop();
        } catch {}
      });
      pcRef.current?.close();
    } catch {}

    pcRef.current = null;

    try {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}

    localStreamRef.current = null;
    remoteStreamRef.current = null;
  }

  function teardown() {
    teardownPeer();
  }

  function onSendChat() {
    const text = chatDraft.trim();
    if (!text) return;
    try {
      const clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sendChat(text, clientId);
      setChatDraft("");
      setActiveTab("chat");
      if (isDebugEnabled()) logClient("chat-send", { clientId, textLen: text.length });
    } catch {
      showError("Failed to send message");
    }
  }

  function toggleMute() {
    const pc = pcRef.current;
    const senderTrack = pc?.getSenders().find((s) => s.track?.kind === "audio")?.track;
    const stream = localStreamRef.current;
    const tracks = senderTrack ? [senderTrack] : stream?.getAudioTracks() || [];
    if (!tracks.length) return;
    tracks.forEach((t) => (t.enabled = muted));
    setMuted((m) => !m);
  }

  function toggleCam() {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => (t.enabled = camOff));
    setCamOff((v) => !v);
  }

  if (!bookingId) {
    return <div className="p-6">Invalid booking</div>;
  }

  // Determine if current user is tutor or student to show other participant's name
  const isTutor = data?.tutor?.id === me.userId;
  const otherPersonName = isTutor ? (data as any)?.student?.name : data?.tutor?.name;
  const title = otherPersonName ? `Call with ${otherPersonName}` : "Call";
  const waiting = joinState.status === "waiting";
  const sessionEnded = joinState.status === "after" || !!blockedMessage;
  const controlsDisabled = waiting || sessionEnded || !!blockedMessage;
  const countdownLabel = formatCountdown(countdownMs);
  const startLabel = data?.startTime ? new Date(data.startTime).toLocaleString() : "—";
  const endLabel = joinState.status === "after"
    ? new Date(joinState.endedAt).toLocaleString()
    : joinState.status === "waiting" || joinState.status === "open"
      ? new Date(joinState.endsAt).toLocaleString()
      : data?.endTime
        ? new Date(data.endTime).toLocaleString()
        : "—";
  const socketConnected = !!socket?.connected;
  const uiPhase: UiPhase = deriveUiPhase({ waiting, sessionEnded, socketConnected, conn });
  const networkBadge = uiPhase === "live" ? "Good" : uiPhase === "weak" ? "Poor" : uiPhase === "reconnecting" ? "Reconnecting" : "Connecting";
  const networkTone = uiPhase === "live" ? "text-emerald-700 bg-emerald-100" : uiPhase === "weak" ? "text-amber-700 bg-amber-100" : uiPhase === "reconnecting" ? "text-red-700 bg-red-100" : "text-slate-700 bg-slate-100";
  const connectionState: ConnectionState = uiPhase === "weak" ? "weak-network" : uiPhase === "reconnecting" ? "reconnecting" : uiPhase === "waiting" ? "waiting" : uiPhase === "live" ? "live" : "connecting";
  const statusLabel: Record<ConnectionState, string> = {
    connecting: "Connecting securely…",
    waiting: "Waiting for participant",
    live: "Live",
    "weak-network": "Weak network",
    reconnecting: "Reconnecting…",
  };
  const statusCopy: Record<ConnectionState, string> = {
    connecting: "Setting up a secure classroom.",
    waiting: "We’ll start as soon as everyone joins.",
    live: "You’re live. Whiteboard is primary, video is secondary.",
    "weak-network": "Network is unstable. We’re keeping audio/board active.",
    reconnecting: "Restoring the call. Stay on this page.",
  };
  const statusLabelDisplay = blockedMessage
    ? "Call blocked"
    : sessionEnded
      ? "Class ended"
      : statusLabel[connectionState];
  const statusCopyDisplay = blockedMessage
    ? blockedMessage
    : sessionEnded
      ? "This class has ended. Whiteboard stays available."
      : statusCopy[connectionState];

  const hasLocalAudio = !!localStreamRef.current?.getAudioTracks().length;
  const hasLocalVideo = !!localStreamRef.current?.getVideoTracks().length && !camOff;
  const hasRemoteVideo = !!remoteStreamRef.current?.getVideoTracks().length;
  const stageMode: "whiteboard" | "screen" | "audio-only" = sharingScreen ? "screen" : hasLocalVideo ? "whiteboard" : mediaMode === "audio" ? "audio-only" : "whiteboard";
  const showVideoStrip = hasLocalVideo || hasRemoteVideo || mediaMode !== "whiteboard";
  const remoteParticipant = participants.find((p) => p.userId !== me.userId);
  const remoteName = remoteParticipant ? remoteParticipant.role || "Participant" : "Participant";
  const mobileDrawerLabel = activeTab === "chat" ? "Chat" : activeTab === "participants" ? "Participants" : "Board tools";

  const exitClass = () => {
    teardown();
    navigate(`/class/${bookingId}`);
  };

  return (
    <div className="h-screen grid grid-rows-[56px_1fr_64px] bg-slate-50 sm:grid-rows-[48px_1fr_56px]">
      <TopBar title={title} status={connectionState} statusLabel={statusLabelDisplay} elapsedTime={countdownLabel} networkBadge={networkBadge} onExit={exitClass} sessionEnded={sessionEnded} />

      <div className="grid grid-cols-1 overflow-hidden md:grid-cols-1 md:grid-rows-[1fr_auto] lg:grid-cols-[1fr_320px]">
        <LearningStage
          mode={stageMode}
          connectionState={connectionState}
          statusLabel={statusLabelDisplay}
          statusCopy={statusCopyDisplay}
          startLabel={startLabel}
          endLabel={endLabel}
          countdownLabel={countdownLabel}
          networkTone={networkTone}
          sessionEnded={sessionEnded}
          whiteboardSlot={<Whiteboard bookingId={bookingId} realtime className="h-full w-full" />}
          videoStrip={
            <VideoStrip
              participants={[
                { id: me.userId || "you", name: "You", hasVideo: hasLocalVideo, hasAudio: hasLocalAudio },
                { id: remoteParticipant?.userId || "remote", name: remoteName, hasVideo: hasRemoteVideo, hasAudio: true },
              ]}
              show={showVideoStrip}
              localVideoRef={localVideoRef}
              remoteVideoRef={remoteVideoRef}
            />
          }
        />

        <RightPanel
          variant="sidebar"
          className="hidden lg:block"
          activeTab={activeTab}
          onTabChange={setActiveTab}
          participants={participants}
          meId={me.userId}
          chatMessages={chatMessages}
          chatDraft={chatDraft}
          onChatDraft={setChatDraft}
          onSendChat={onSendChat}
          sessionEnded={sessionEnded}
          isTutor={!!isTutor}
        />

        <RightPanel
          variant="drawer"
          className="hidden md:block lg:hidden md:border-t"
          activeTab={activeTab}
          onTabChange={setActiveTab}
          participants={participants}
          meId={me.userId}
          chatMessages={chatMessages}
          chatDraft={chatDraft}
          onChatDraft={setChatDraft}
          onSendChat={onSendChat}
          sessionEnded={sessionEnded}
          isTutor={!!isTutor}
        />

        {isMobilePanelOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/30">
            <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="text-sm font-semibold text-slate-900">{mobileDrawerLabel}</div>
                <button className="text-sm text-slate-600" onClick={() => setIsMobilePanelOpen(false)}>Close</button>
              </div>
              <RightPanel
                variant="modal"
                className="md:hidden"
                activeTab={activeTab}
                onTabChange={setActiveTab}
                participants={participants}
                meId={me.userId}
                chatMessages={chatMessages}
                chatDraft={chatDraft}
                onChatDraft={setChatDraft}
                onSendChat={onSendChat}
                sessionEnded={sessionEnded}
                isTutor={!!isTutor}
              />
            </div>
          </div>
        )}
      </div>

      <ControlBar
        canUseAudio={hasLocalAudio}
        canUseVideo={hasLocalVideo}
        camOff={camOff}
        muted={muted}
        sharingScreen={sharingScreen}
        controlsDisabled={controlsDisabled}
        canShareScreen={isTutor}
        onToggleMic={toggleMute}
        onToggleCam={toggleCam}
        onShareScreen={() => {
          if (sharingScreen) stopScreenShare();
          else startScreenShare();
        }}
        onReconnect={() => {
          teardownPeer();
          reconnectAttempts.current = 0;
          lastTurnLogged.current = null;
        }}
        onOpenPanel={() => setIsMobilePanelOpen(true)}
      />
    </div>
  );
}

interface TopBarProps {
  title: string;
  status: ConnectionState;
  statusLabel: string;
  elapsedTime: string;
  networkBadge: string;
  onExit: () => void;
  sessionEnded?: boolean;
}

function TopBar({ title, status, statusLabel, elapsedTime, networkBadge, onExit, sessionEnded }: TopBarProps) {
  const pillTone = sessionEnded
    ? "bg-slate-200 text-slate-700"
    : status === "live"
      ? "bg-emerald-100 text-emerald-800"
      : status === "weak-network"
        ? "bg-amber-100 text-amber-800"
        : status === "reconnecting"
          ? "bg-red-100 text-red-800"
          : "bg-blue-100 text-blue-800";

  return (
    <div className="h-full flex items-center justify-between px-4 border-b bg-white shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className="text-base font-semibold text-slate-900 truncate">{title}</div>
        <span className={`text-xs px-2 py-1 rounded-full ${pillTone}`}>{statusLabel}</span>
        <span className={`text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700`}>Network: {networkBadge}</span>
      </div>
      <div className="flex items-center gap-3 text-sm text-slate-700">
        <span className="font-mono text-xs">Time: {elapsedTime}</span>
        <button className="px-3 py-2 rounded-lg border text-slate-800 hover:bg-slate-50" onClick={onExit}>
          Exit
        </button>
      </div>
    </div>
  );
}

interface LearningStageProps {
  mode: "whiteboard" | "screen" | "audio-only";
  connectionState: ConnectionState;
  statusLabel: string;
  statusCopy: string;
  startLabel: string;
  endLabel: string;
  countdownLabel: string;
  networkTone: string;
  sessionEnded: boolean;
  whiteboardSlot: ReactNode;
  videoStrip: ReactNode;
}

function LearningStage({ mode, connectionState, statusLabel, statusCopy, startLabel, endLabel, countdownLabel, networkTone, sessionEnded, whiteboardSlot, videoStrip }: LearningStageProps) {
  const overlayIcon = connectionState === "live" ? null : connectionState === "reconnecting" ? "animate-spin" : "animate-pulse";

  return (
    <div className="relative h-full bg-white">
      <div className="absolute inset-0">
        {whiteboardSlot}
      </div>

      <div className="absolute top-4 left-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-1 rounded-full bg-slate-900 text-white uppercase tracking-wide">{mode === "screen" ? "Screen" : mode === "audio-only" ? "Audio + Board" : "Whiteboard"}</span>
        <span className={`px-2 py-1 rounded-full ${networkTone}`}>{statusLabel}</span>
        <span className="px-2 py-1 rounded-full bg-white text-slate-700 border">Starts: {startLabel}</span>
        <span className="px-2 py-1 rounded-full bg-white text-slate-700 border">Ends: {endLabel}</span>
        <span className="px-2 py-1 rounded-full bg-white text-slate-700 border">Time left: {countdownLabel}</span>
      </div>

      {videoStrip}

      {!sessionEnded && connectionState !== "live" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/40 text-white backdrop-blur-sm">
          <div className={`h-12 w-12 rounded-full border-4 border-white/40 border-t-white ${overlayIcon || ""}`} aria-hidden />
          <div className="text-lg font-semibold">{statusLabel}</div>
          <div className="text-sm text-white/80">{statusCopy}</div>
        </div>
      )}

      {sessionEnded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/40 text-white backdrop-blur-sm">
          <div className="text-lg font-semibold">Class ended</div>
          <div className="text-sm text-white/80">You can still view the whiteboard content.</div>
        </div>
      )}

      {connectionState === "weak-network" && !sessionEnded && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 px-3 py-2 rounded bg-amber-500/90 text-white text-xs shadow-lg">
          Network unstable. Staying in board/audio mode.
        </div>
      )}
    </div>
  );
}

interface VideoStripProps {
  participants: Array<{ id: string; name: string; hasVideo: boolean; hasAudio: boolean }>;
  show: boolean;
  localVideoRef: RefObject<HTMLVideoElement | null>;
  remoteVideoRef: RefObject<HTMLVideoElement | null>;
}

function VideoStrip({ participants, show, localVideoRef, remoteVideoRef }: VideoStripProps) {
  if (!show) return null;

  const local = participants[0];
  const remote = participants[1];

  return (
    <div className="absolute bottom-4 left-4 md:top-4 md:right-4 md:bottom-auto md:left-auto flex gap-2 bg-white/90 rounded-lg shadow-lg p-2 max-w-full overflow-x-auto">
      <div className="flex items-center gap-2">
        <Tile refProp={localVideoRef} label={local?.name || "You"} hasVideo={!!local?.hasVideo} />
        <div className="hidden md:block">
          <Tile refProp={remoteVideoRef} label={remote?.name || "Guest"} hasVideo={!!remote?.hasVideo} />
        </div>
      </div>
    </div>
  );
}

interface TileProps {
  refProp: RefObject<HTMLVideoElement | null>;
  label: string;
  hasVideo: boolean;
}

function Tile({ refProp, label, hasVideo }: TileProps) {
  return (
    <div className="w-28 h-20 rounded-lg overflow-hidden border bg-slate-100 relative flex items-center justify-center">
      {hasVideo ? (
        <video ref={refProp} autoPlay playsInline muted={label === "You"} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-slate-600 bg-gradient-to-br from-slate-100 to-slate-200">{label}</div>
      )}
      <div className="absolute bottom-1 left-1 text-[10px] px-2 py-0.5 rounded bg-black/60 text-white">{label}</div>
    </div>
  );
}

interface RightPanelProps {
  variant: "sidebar" | "drawer" | "modal";
  className?: string;
  activeTab: SidePanelTab;
  onTabChange: (tab: SidePanelTab) => void;
  participants: Participant[];
  meId?: string;
  chatMessages: ChatMessage[];
  chatDraft: string;
  onChatDraft: (v: string) => void;
  onSendChat: () => void;
  sessionEnded: boolean;
  isTutor: boolean;
}

function RightPanel({ variant, className, activeTab, onTabChange, participants, meId, chatMessages, chatDraft, onChatDraft, onSendChat, sessionEnded, isTutor }: RightPanelProps) {
  const containerClasses =
    variant === "sidebar"
      ? "h-full border-l bg-white"
      : variant === "drawer"
        ? "h-72 bg-white"
        : "max-h-[70vh] bg-white";

  return (
    <div className={`${containerClasses} ${className || ""}`}>
      <div className="flex items-center gap-2 p-3 border-b bg-slate-50">
        <button
          className={`px-3 py-2 rounded-lg text-sm border ${activeTab === "whiteboard" ? "bg-white shadow-sm" : "bg-transparent"}`}
          onClick={() => onTabChange("whiteboard")}
        >
          Board tools
        </button>
        <button
          className={`px-3 py-2 rounded-lg text-sm border ${activeTab === "participants" ? "bg-white shadow-sm" : "bg-transparent"}`}
          onClick={() => onTabChange("participants")}
        >
          Participants ({participants.length || 0})
        </button>
        <button
          className={`px-3 py-2 rounded-lg text-sm border ${activeTab === "chat" ? "bg-white shadow-sm" : "bg-transparent"}`}
          onClick={() => onTabChange("chat")}
        >
          Chat
        </button>
      </div>

      <div className="h-full overflow-hidden">
        {activeTab === "whiteboard" && (
          <div className="h-full p-4 space-y-3 text-sm text-slate-700 overflow-auto">
            <div className="font-semibold text-slate-900">Whiteboard controls</div>
            <p>Use the toolbar inside the canvas to draw, annotate, and highlight. The board is always live and synced.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Double-tap tools to lock drawing mode.</li>
              <li>Use arrows/text for quick feedback.</li>
              <li>{isTutor ? "You can" : "Tutor can"} clear or export from the board menu.</li>
            </ul>
            <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-600">Whiteboard stays primary even if video is unavailable.</div>
          </div>
        )}

        {activeTab === "participants" && (
          <div className="h-full p-4 overflow-auto space-y-2">
            {participants.length === 0 ? (
              <div className="text-sm text-slate-600">Waiting for participants…</div>
            ) : (
              participants
                .slice()
                .sort((a, b) => (a.userId === meId ? -1 : b.userId === meId ? 1 : a.userId.localeCompare(b.userId)))
                .map((p) => (
                  <div key={p.userId} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div className="text-sm text-slate-900">
                      {p.userId === meId ? "You" : "Participant"}
                      <span className="ml-2 text-xs text-slate-500">{p.userId}</span>
                    </div>
                    <div className="text-xs text-slate-600">{p.role}</div>
                  </div>
                ))
            )}
          </div>
        )}

        {activeTab === "chat" && (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-auto p-4 space-y-2">
              {chatMessages.length === 0 ? (
                <div className="text-sm text-slate-600">No messages yet.</div>
              ) : (
                chatMessages.map((m) => {
                  const mine = !!meId && m.userId === meId;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm border ${mine ? "bg-slate-900 text-white" : "bg-white text-slate-900"}`}>
                        <div className={`text-[11px] ${mine ? "text-white/70" : "text-slate-500"}`}>
                          {mine ? "You" : m.role}
                          <span className="ml-2">{new Date(m.ts).toLocaleTimeString()}</span>
                        </div>
                        <div className="whitespace-pre-wrap break-words">{m.text}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="border-t p-3 flex items-center gap-2">
              <input
                className="flex-1 px-3 py-2 rounded-lg border text-sm"
                placeholder="Send a class message…"
                value={chatDraft}
                onChange={(e) => onChatDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSendChat();
                  }
                }}
                disabled={sessionEnded}
              />
              <button className={`px-3 py-2 rounded-lg border ${sessionEnded ? "opacity-60 cursor-not-allowed" : ""}`} onClick={onSendChat} disabled={sessionEnded}>
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ControlBarProps {
  canUseVideo: boolean;
  canUseAudio: boolean;
  camOff: boolean;
  muted: boolean;
  sharingScreen: boolean;
  controlsDisabled: boolean;
  canShareScreen: boolean; // Only tutors can share screen
  onToggleMic: () => void;
  onToggleCam: () => void;
  onShareScreen: () => void;
  onReconnect: () => void;
  onOpenPanel: () => void;
}

function ControlBar({ canUseVideo, canUseAudio, camOff, muted, sharingScreen, controlsDisabled, canShareScreen, onToggleMic, onToggleCam, onShareScreen, onReconnect, onOpenPanel }: ControlBarProps) {
  const disabledReason = controlsDisabled ? "Controls available when class is live." : undefined;

  return (
    <div className="h-full border-t bg-white px-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 md:hidden">
        <button className="px-3 py-2 rounded-lg border shadow-sm" onClick={onOpenPanel}>Open panel</button>
      </div>
      <div className="flex items-center gap-2">
        <button
          className={`h-11 w-11 rounded-full border shadow-sm flex items-center justify-center transition ${muted ? "bg-white text-slate-700" : "bg-slate-900 text-white"} ${controlsDisabled || !canUseAudio ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-800"}`}
          onClick={onToggleMic}
          disabled={controlsDisabled || !canUseAudio}
          title={disabledReason || (!canUseAudio ? "Microphone unavailable" : "Toggle microphone")}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button
          className={`h-11 w-11 rounded-full border shadow-sm flex items-center justify-center transition ${camOff ? "bg-white text-slate-700" : "bg-slate-900 text-white"} ${controlsDisabled || !canUseVideo ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-800"}`}
          onClick={onToggleCam}
          disabled={controlsDisabled || !canUseVideo}
          title={disabledReason || (!canUseVideo ? "Camera unavailable" : "Toggle camera")}
          aria-label={camOff ? "Camera on" : "Camera off"}
        >
          {camOff ? <VideoOff size={18} /> : <Video size={18} />}
        </button>
        {canShareScreen && (
          <button
            className={`h-11 w-11 rounded-full border shadow-sm flex items-center justify-center transition ${sharingScreen ? "bg-slate-900 text-white" : "bg-white text-slate-700"} ${controlsDisabled ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-100"}`}
            onClick={onShareScreen}
            disabled={controlsDisabled}
            title={disabledReason || "Share your screen"}
            aria-label={sharingScreen ? "Stop sharing screen" : "Share screen"}
          >
            <MonitorUp size={18} />
          </button>
        )}
        <button
          className={`h-11 w-11 rounded-full border shadow-sm flex items-center justify-center transition bg-white text-slate-700 ${controlsDisabled ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-100"}`}
          onClick={onReconnect}
          disabled={controlsDisabled}
          title={disabledReason || "Refresh the connection"}
          aria-label="Reconnect"
        >
          <RotateCcw size={18} />
        </button>
      </div>
    </div>
  );
}

export default function CallPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { showError } = useToast();
  const [data, setData] = useState<BookingDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinBlocked, setJoinBlocked] = useState(false);
  const [joinBlockedMessage, setJoinBlockedMessage] = useState<string | null>(null);

  const meUserId = useMemo(() => {
    const p = getTokenPayload();
    return (p?.sub as string | undefined) ?? (p?.userId as string | undefined);
  }, []);

  useEffect(() => {
    if (!bookingId) return;
    (async () => {
      try {
        setLoading(true);
        const res = await getBookingDetails(bookingId);
        setData(res);
      } catch (err: any) {
        showError(err?.response?.data?.message || "Failed to load class details");
      } finally {
        setLoading(false);
      }
    })();
  }, [bookingId, showError]);

  useEffect(() => {
    if (!bookingId || !data || !meUserId || joinBlocked) return;
    if (!(data.tutor?.id === meUserId || data.studentId === meUserId)) {
      const message = joinReasonMessage("NOT_PART_OF_BOOKING");
      setJoinBlocked(true);
      setJoinBlockedMessage(message);
      disconnectWebrtc();
    }
  }, [bookingId, data, meUserId, joinBlocked]);

  if (!bookingId) {
    return <div className="p-6">Invalid booking</div>;
  }

  if (loading) {
    return <div className="p-6">Loading call…</div>;
  }

  const isParticipant = Boolean(data && meUserId && (data.tutor?.id === meUserId || data.studentId === meUserId));

  if (joinBlocked || (data && meUserId && !isParticipant)) {
    return (
      <div className="p-6">
        <div className="text-lg font-semibold text-slate-900">Access denied</div>
        <div className="mt-2 text-sm text-slate-700">{joinBlockedMessage || "You are not part of this booking."}</div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6">Failed to load class details.</div>;
  }

  const canStartCall = !!meUserId && isParticipant;
  if (!canStartCall) {
    return <div className="p-6">Unable to start call.</div>;
  }

  return (
    <CallSession
      bookingId={bookingId}
      data={data}
      meUserId={meUserId}
      onJoinBlocked={(reason) => {
        const message = joinReasonMessage(reason);
        setJoinBlocked(true);
        setJoinBlockedMessage(message);
      }}
    />
  );
}
