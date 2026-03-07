import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  TrackLoop,
  useParticipants,
  useTracks,
  useRoomContext,
} from "@livekit/components-react";
import { Track, type Participant, DisconnectReason, RoomEvent } from "livekit-client";
import { Clock, FileText, PanelRightOpen, Users, PenTool, X, AlertTriangle, BookOpen } from "lucide-react";
import { getBookingDetails, type BookingDetailsDto } from "../../services/bookingsService";
import { useToast } from "../../contexts/ToastContext";
import api, { getTokenPayload } from "../../lib/apiClient";
import { fetchLivekitToken } from "../../services/livekit";
import { getBookingPerspective } from "../../utils/bookingPerspective";
import { useAuth } from "../../contexts/AuthContext";
import Whiteboard, { type WhiteboardHandle } from "../../components/Whiteboard/Whiteboard";
import { whiteboardService } from "../../services/whiteboardService";
import CallMaterials from "../../components/CallMaterials";
import "@livekit/components-styles";

function getParticipantRole(p: Participant): string {
  try {
    const meta = p.metadata ? JSON.parse(p.metadata) : null;
    if (meta?.role === 'tutor') return 'Tutor';
    if (meta?.role === 'student') return 'Student';
  } catch { /* ignore parse errors */ }
  return 'Participant';
}

function ParticipantList() {
  const participants = useParticipants() as Participant[];
  return (
    <div className="space-y-2 text-sm text-slate-700">
      {participants.length === 0 ? (
        <div className="text-slate-500">Waiting for participants…</div>
      ) : (
        participants.map((p) => {
          const role = getParticipantRole(p);
          return (
            <div key={p.identity} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="truncate">{p.name || role}</span>
              <span className="text-xs text-slate-500">{p.isLocal ? "You" : role}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

function LivekitStage() {
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false }
  );
  const screenTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false }
  );

  return (
    <div className="flex h-full flex-col gap-2 sm:gap-4 overflow-hidden">
      {screenTracks.length > 0 && (
        <div className="flex-1 min-h-0 max-h-[50%] rounded-xl sm:rounded-2xl border bg-white p-1 sm:p-2 overflow-hidden">
          <TrackLoop tracks={screenTracks}>
            <ParticipantTile />
          </TrackLoop>
        </div>
      )}
      <div className="flex-1 min-h-0 rounded-xl sm:rounded-2xl border bg-white p-1 sm:p-2 overflow-hidden">
        <GridLayout tracks={cameraTracks}>
          <ParticipantTile />
        </GridLayout>
      </div>
      <RoomAudioRenderer />
    </div>
  );
}

function CallRoomContent({ bookingId, endTime, isTutor, counterpartName, classDate, tutorAlreadyJoined, studentId, onNoShow, onClassEnded, isDemo }: {
  bookingId: string;
  endTime?: string | null;
  isTutor?: boolean;
  counterpartName?: string;
  classDate?: string;
  tutorAlreadyJoined?: boolean;
  studentId?: string;
  onNoShow?: () => void;
  onClassEnded?: () => void;
  isDemo?: boolean;
}) {
  const participants = useParticipants() as Participant[];
  const room = useRoomContext();
  const navigate = useNavigate();
  const [callStartedAt, setCallStartedAt] = useState<Date | null>(null);
  const [sideTab, setSideTab] = useState<"participants" | "whiteboard" | "materials">("participants");
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isOvertime, setIsOvertime] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [noShowCountdown, setNoShowCountdown] = useState<string | null>(null);
  const [showNoShowModal, setShowNoShowModal] = useState(false);
  const { showError: showToastError, showSuccess: showToastSuccess } = useToast();
  const whiteboardRef = useRef<WhiteboardHandle>(null);
  const whiteboardSceneRef = useRef<{ elements: any[]; appState: any } | null>(null);
  const [openMaterialUrl, setOpenMaterialUrl] = useState<string | null>(null);
  const [openMaterialTitle, setOpenMaterialTitle] = useState<string>('Class Material');
  const [openingMaterial, setOpeningMaterial] = useState(false);

  const closeMaterialViewer = useCallback(() => {
    setOpenMaterialUrl((current) => {
      if (current?.startsWith('blob:')) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (openMaterialUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(openMaterialUrl);
      }
    };
  }, [openMaterialUrl]);

  const hasBothJoined = participants.length >= 2;

  // Record DB-backed attendance based on actual LiveKit connection state
  useEffect(() => {
    if (!bookingId) return;

    const postAttendance = async (event: "JOIN" | "LEAVE", reason?: string) => {
      try {
        await api.post(`/bookings/${bookingId}/attendance`, { event, reason });
      } catch (err: any) {
        // Best-effort only; never block the call UX on telemetry
        console.warn(
          "Failed to record attendance event:",
          event,
          err?.response?.data?.message || err?.message,
        );
      }
    };

    const onConnected = () => postAttendance("JOIN");
    const onDisconnected = (reason?: DisconnectReason) =>
      postAttendance("LEAVE", reason !== undefined ? String(reason) : undefined);

    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Disconnected, onDisconnected as any);

    return () => {
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Disconnected, onDisconnected as any);
    };
  }, [room, bookingId]);

  useEffect(() => {
    if (!callStartedAt && hasBothJoined) {
      setCallStartedAt(new Date());
    }
  }, [callStartedAt, hasBothJoined]);

  // 10-minute no-show timer: ONLY for students waiting for tutor
  // Tutors stay in class until class ends regardless of student joining
  // If tutor already joined before (attendance data), skip the no-show timer entirely
  // Add a 15s grace period after mount to let LiveKit connect before evaluating
  const [livekitReady, setLivekitReady] = useState(false);

  useEffect(() => {
    // Give LiveKit time to connect and populate participants before evaluating no-show
    const grace = setTimeout(() => setLivekitReady(true), 15000);
    // If both join before the grace period, mark ready immediately
    if (hasBothJoined) {
      clearTimeout(grace);
      setLivekitReady(true);
    }
    return () => clearTimeout(grace);
  }, [hasBothJoined]);

  useEffect(() => {
    if (isTutor) return; // tutors don't get a countdown — they stay until class ends
    if (hasBothJoined || showNoShowModal) return; // both joined or already showing modal
    if (!classDate) return;
    if (tutorAlreadyJoined) return; // tutor previously joined — don't trigger no-show

    const startTime = new Date(classDate).getTime();
    const noShowDeadline = startTime + 10 * 60 * 1000; // 10 min after start

    const tick = () => {
      const now = Date.now();
      const diff = noShowDeadline - now;
      if (diff <= 0) {
        // Deadline passed — but only trigger modal if LiveKit has had time to connect
        if (!livekitReady) {
          // Still waiting for LiveKit — keep the countdown at 00:00 but don't fire yet
          setNoShowCountdown("00:00");
          return;
        }
        setNoShowCountdown(null);
        setShowNoShowModal(true);
        // Immediately call the backend to process the no-show refund
        api.post(`/bookings/${bookingId}/tutor-no-show`).catch((err: any) => {
          console.warn("Failed to process tutor no-show:", err?.response?.data?.message || err?.message);
        });
        // Time's up — notify parent to show no-show modal (renders above LiveKitRoom)
        if (onNoShow) {
          onNoShow();
        }
        room.disconnect().catch(() => { /* already disconnecting */ });
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setNoShowCountdown(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [classDate, hasBothJoined, showNoShowModal, room, isTutor, tutorAlreadyJoined, livekitReady]);

  // Class end timer
  useEffect(() => {
    if (!endTime) return;
    const end = new Date(endTime).getTime();
    const tick = () => {
      const now = Date.now();
      const diff = end - now;
      if (diff <= 0) {
        setTimeLeft("00:00");
        setIsOvertime(true);
        return;
      }
      setIsOvertime(false);
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [endTime]);

  // Auto-disconnect 5 min after end time
  useEffect(() => {
    if (!endTime) return;
    const end = new Date(endTime).getTime();
    const gracePeriod = 5 * 60 * 1000; // 5 min grace
    const disconnectAt = end + gracePeriod - Date.now();
    if (disconnectAt <= 0) {
      if (onClassEnded) onClassEnded();
      room.disconnect();
      return;
    }
    const timer = globalThis.setTimeout(() => {
      if (onClassEnded) onClassEnded();
      room.disconnect();
    }, disconnectAt);
    return () => globalThis.clearTimeout(timer);
  }, [endTime, room, onClassEnded]);

  // Save whiteboard as notes
  const handleSaveWhiteboardNotes = useCallback(async () => {
    try {
      if (isDemo) {
        showToastError("Notes sharing is not available for demo classes");
        return;
      }
      setSavingNotes(true);
      // Flush the latest data to the backend first to ensure it's up to date
      await whiteboardRef.current?.flushSave();
      // Get live scene data directly from Excalidraw (avoids stale backend data)
      let liveData = whiteboardRef.current?.getSceneData();
      // If excalidrawAPI wasn't ready, wait briefly and retry once
      if (!liveData) {
        await new Promise(r => setTimeout(r, 200));
        liveData = whiteboardRef.current?.getSceneData();
      }
      const snapshot = whiteboardSceneRef.current;
      const hasVisibleElements = (data: any) => {
        const arr = Array.isArray(data?.elements) ? data.elements : [];
        return arr.some((el: any) => el && !el.isDeleted);
      };

      let wbData = hasVisibleElements(liveData)
        ? liveData
        : hasVisibleElements(snapshot)
          ? snapshot
          : await whiteboardService.getWhiteboardData(bookingId);

      // Only fail if no scene is available at all; avoid false-empty due transient API state.
      if (!wbData) {
        showToastError("Whiteboard data is unavailable. Please try again.");
        return;
      }
      // Format the date for the filename
      const dateStr = classDate
        ? new Date(classDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")
        : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
      const noteName = `ClassWhiteBoardNotes-${counterpartName || "Participant"}_${dateStr}`;

      // Export to S3 and save as session note
      await whiteboardService.saveWhiteboardNotes(bookingId, noteName, wbData);
      setNotesSaved(true);
      showToastSuccess("Whiteboard notes saved and shared!");
    } catch (err: any) {
      console.error("Failed to save whiteboard notes:", err);
      showToastError(err?.response?.data?.message || "Failed to save whiteboard notes");
    } finally {
      setSavingNotes(false);
    }
  }, [bookingId, counterpartName, classDate, isDemo, showToastError, showToastSuccess]);

  const isWhiteboardActive = sideTab === "whiteboard";
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  // No-show modal — shown for STUDENT when tutor didn't join within 10 min
  if (showNoShowModal && !isTutor) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 sm:p-8 text-center space-y-5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
            <AlertTriangle className="h-8 w-8 text-orange-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Tutor didn&rsquo;t join the class
          </h2>
          <p className="text-sm text-slate-600">
            The tutor did not join within 10 minutes of the scheduled start time. Your 1 token has been refunded automatically.
          </p>
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
            <p className="text-sm font-semibold text-green-700">+1 Token refunded to your balance</p>
          </div>
          <button
            onClick={() => navigate('/student/sessions')}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Go to My Sessions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-44px)] sm:h-[calc(100dvh-52px)] flex-col p-1.5 sm:p-3 lg:p-4 gap-1.5 sm:gap-3 lg:gap-4 overflow-hidden">
      {/* ── Timer bar ── */}
      {timeLeft !== null && (
        <div className={`shrink-0 flex items-center justify-center gap-2 rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold shadow-sm ${
          isOvertime
            ? "bg-red-100 text-red-700 border border-red-300"
            : timeLeft <= "05:00"
              ? "bg-amber-100 text-amber-800 border border-amber-300"
              : "bg-slate-100 text-slate-700 border border-slate-200"
        }`}>
          <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          {isOvertime ? "Time ended — wrap up" : `Time remaining: ${timeLeft}`}
        </div>
      )}

      {/* ── No-show countdown bar (student waiting for tutor only) ── */}
      {!isTutor && !hasBothJoined && noShowCountdown !== null && (
        <div className="shrink-0 flex items-center justify-center gap-2 rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold shadow-sm bg-orange-50 text-orange-700 border border-orange-200">
          <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Waiting for tutor to join: {noShowCountdown}
        </div>
      )}

      <div className="flex-1 min-h-0 relative grid grid-cols-1 lg:grid-cols-[1fr_240px] xl:grid-cols-[1fr_300px] 2xl:grid-cols-[1fr_320px] gap-1.5 sm:gap-3 lg:gap-4">
        {/* ── Main area ── */}
        <div className="relative min-h-0 h-full overflow-hidden">
          {!hasBothJoined && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/90 text-sm text-slate-700 px-4 text-center">
              Waiting room: the class will start when both participants join.
            </div>
          )}

          {/* Keep both Whiteboard and LivekitStage mounted to prevent data loss on tab switch */}
          <div
            className="absolute inset-0 rounded-2xl border bg-white overflow-hidden"
            style={{ display: isWhiteboardActive ? 'block' : 'none' }}
          >
            <Whiteboard ref={whiteboardRef} bookingId={bookingId} realtime className="w-full h-full" />
          </div>
          {openMaterialUrl ? (
            <div className="absolute inset-0 rounded-2xl border bg-white overflow-hidden">
              <div className="h-10 px-3 border-b bg-slate-50 flex items-center justify-between">
                <span className="text-xs sm:text-sm font-medium text-slate-700 truncate">{openMaterialTitle}</span>
                <button
                  type="button"
                  onClick={closeMaterialViewer}
                  className="text-xs rounded-md border px-2 py-1 bg-white hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
              {openingMaterial ? (
                <div className="h-[calc(100%-2.5rem)] flex items-center justify-center text-sm text-slate-500">
                  Opening material...
                </div>
              ) : (
                <iframe
                  title={openMaterialTitle}
                  src={openMaterialUrl}
                  className="w-full h-[calc(100%-2.5rem)]"
                />
              )}
            </div>
          ) : (
            <div style={{ display: isWhiteboardActive ? 'none' : 'contents' }}>
              <LivekitStage />
            </div>
          )}
        </div>

        {/* ── Mobile toggle button (visible only on small screens) ── */}
        <button
          type="button"
          onClick={() => setSidePanelOpen(!sidePanelOpen)}
          className="lg:hidden fixed bottom-20 right-3 z-40 flex items-center justify-center h-12 w-12 rounded-full bg-slate-900 text-white shadow-lg active:scale-95 transition-transform"
          aria-label={sidePanelOpen ? "Close panel" : "Open panel"}
        >
          {sidePanelOpen ? <X className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
        </button>

        {/* ── Side panel backdrop (mobile only) ── */}
        {sidePanelOpen && (
          <button
            type="button"
            aria-label="Close panel"
            className="lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm border-0 cursor-default"
            onClick={() => setSidePanelOpen(false)}
          />
        )}

        {/* ── Side panel ── */}
        <div className={`
          /* Mobile: slide-over drawer from right */
          fixed inset-y-0 right-0 z-30 w-[85vw] max-w-[340px] transition-transform duration-300 ease-in-out
          ${sidePanelOpen ? "translate-x-0" : "translate-x-full"}
          /* Desktop: static in grid */
          lg:static lg:w-auto lg:max-w-none lg:translate-x-0 lg:transition-none
          rounded-l-2xl lg:rounded-2xl border bg-white p-2.5 lg:p-3 xl:p-4 flex flex-col min-h-0 overflow-hidden shadow-xl lg:shadow-none
        `}>
          {/* Mobile panel header */}
          <div className="lg:hidden flex items-center justify-between mb-3 pb-2 border-b shrink-0">
            <span className="text-sm font-bold text-slate-900">Panel</span>
            <button
              type="button"
              onClick={() => setSidePanelOpen(false)}
              className="rounded-lg p-1.5 hover:bg-slate-100"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>

          <div className="mb-2 grid grid-cols-3 gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                closeMaterialViewer();
                setSideTab("participants");
              }}
              className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1 transition-colors min-w-0 text-[11px] font-medium ${
                sideTab === "participants"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Users className="h-3 w-3 shrink-0" />
              <span className="truncate">People</span>
            </button>
            <button
              type="button"
              onClick={() => {
                closeMaterialViewer();
                setSideTab("whiteboard");
              }}
              className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1 transition-colors min-w-0 text-[11px] font-medium ${
                sideTab === "whiteboard"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <PenTool className="h-3 w-3 shrink-0" />
              <span className="truncate">Board</span>
            </button>
            {isTutor && (
              <button
                type="button"
                onClick={() => {
                  closeMaterialViewer();
                  setSideTab("materials");
                }}
                className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1 transition-colors min-w-0 text-[11px] font-medium ${
                  sideTab === "materials"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <BookOpen className="h-3 w-3 shrink-0" />
                <span className="truncate">Materials</span>
              </button>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {sideTab === "materials" && isTutor ? (
              <CallMaterials
                studentId={studentId || ''}
                isDemo={isDemo}
                onOpenInClass={async (pdfUrl, title) => {
                  try {
                    setOpeningMaterial(true);
                    setOpenMaterialTitle(title || 'Class Material');
                    closeMaterialViewer();
                    const resp = await fetch(pdfUrl);
                    if (!resp.ok) throw new Error('Failed to fetch PDF');
                    const blob = await resp.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    setOpenMaterialUrl(blobUrl);
                    setSideTab('materials');
                  } catch (err) {
                    console.error('Failed to open material in class:', err);
                    showToastError('Failed to open material in class.');
                  } finally {
                    setOpeningMaterial(false);
                  }
                }}
              />
            ) : sideTab === "whiteboard" ? (
              /* Video + participants in sidebar when whiteboard is main */
              <div className="flex flex-col gap-2">
                <div className="h-[140px] lg:h-[150px] xl:h-[180px] rounded-lg overflow-hidden border">
                  <LivekitStage />
                </div>
                <ParticipantList />
              </div>
            ) : (
              /* People tab – participant list */
              <ParticipantList />
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom control bar ── */}
      {hasBothJoined ? (
        <div className="shrink-0 flex items-center justify-between rounded-2xl border bg-white/95 px-2 py-1.5 sm:p-2 shadow-sm backdrop-blur gap-2 overflow-x-auto">
          <div className="flex-1 min-w-0 [&_.lk-control-bar]:flex [&_.lk-control-bar]:gap-1 [&_.lk-control-bar]:flex-wrap [&_.lk-button]:!px-2 [&_.lk-button]:!py-1.5 [&_.lk-button]:!text-xs sm:[&_.lk-button]:!px-3 sm:[&_.lk-button]:!py-2 sm:[&_.lk-button]:!text-sm">
            <ControlBar controls={{ leave: false }} />
          </div>
          {isTutor && (
            <button
              type="button"
              disabled={savingNotes || notesSaved}
              onClick={handleSaveWhiteboardNotes}
              className="shrink-0 rounded-lg bg-emerald-600 px-2 py-1.5 sm:px-3 sm:py-2 text-[10px] sm:text-xs font-medium text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 whitespace-nowrap"
            >
              {notesSaved ? "✓ Shared" : savingNotes ? "Saving…" : "Share Notes"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function CallPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { showError } = useToast();
  const { user } = useAuth();
  const [data, setData] = useState<BookingDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [connectionLost, setConnectionLost] = useState<string | null>(null);
  const [rejoining, setRejoining] = useState(false);
  const [isTutor, setIsTutor] = useState(false);
  const [counterpartName, setCounterpartName] = useState("");
  const [noShowTriggered, setNoShowTriggered] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Use auth context user which has student/tutor profile IDs
  // Fallback to JWT payload if auth context not available
  const me = useMemo(() => {
    if (user) {
      // Prefer student/tutor profile IDs from auth context (these match booking IDs)
      const studentId = user.student?.id;
      const tutorId = user.tutor?.id;
      return {
        id: studentId || tutorId || user.id, // Use profile ID if available, else user ID
        email: user.email,
        name: user.name,
        studentId,
        tutorId,
      };
    }
    // Fallback to JWT payload
    const p = getTokenPayload();
    const id = (p?.sub as string | undefined) ?? (p?.userId as string | undefined);
    const email = (p?.email as string | undefined) ?? (p?.user?.email as string | undefined);
    const name = (p?.name as string | undefined) ?? (p?.user?.name as string | undefined);
    return { id, email, name };
  }, [user]);

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
    if (!bookingId || !data || !me.id) return;

    if (data.startTime) {
      const start = new Date(data.startTime);
      const openAt = new Date(start.getTime() - 5 * 60 * 1000);
      if (new Date() < openAt) {
        setAccessDenied('Classroom opens 5 minutes before start time.');
        return;
      }
    }
    
    // Try matching by profile IDs first (most reliable)
    // Backend returns student.id / tutor.id (nested), NOT top-level studentId/tutorId
    const studentId = (me as any).studentId;
    const tutorId = (me as any).tutorId;
    const bookingStudentId = data.student?.id || data.studentId;
    const bookingTutorId = data.tutor?.id || data.tutorId;
    
    let perspective = null;
    if (studentId && bookingStudentId === studentId) {
      // User is the student
      perspective = {
        isTutor: false,
        isStudent: true,
        self: { id: bookingStudentId, name: data.student?.name || "Student", email: data.student?.email },
        other: { id: bookingTutorId, name: data.tutor?.name || "Tutor", email: data.tutor?.email },
      };
      setIsTutor(false);
      setCounterpartName(data.tutor?.name || "Tutor");
    } else if (tutorId && bookingTutorId === tutorId) {
      // User is the tutor
      perspective = {
        isTutor: true,
        isStudent: false,
        self: { id: bookingTutorId, name: data.tutor?.name || "Tutor", email: data.tutor?.email },
        other: { id: bookingStudentId, name: data.student?.name || "Student", email: data.student?.email },
      };
      setIsTutor(true);
      setCounterpartName(data.student?.name || "Student");
    } else {
      // Fallback to original function (handles encrypted emails)
      perspective = getBookingPerspective({ id: me.id, email: me.email, name: me.name }, data);
      if (perspective) {
        setIsTutor(!!perspective.isTutor);
        setCounterpartName(perspective.other?.name || "Participant");
      }
    }
    
    if (!perspective) {
      setAccessDenied("Access denied");
      return;
    }
    fetchLivekitToken(bookingId)
      .then((res) => {
        console.log('LiveKit token response:', res);
        // Handle different response structures
        let tokenString: string | undefined;
        
        // Check if token is directly a string
        if (typeof res.token === 'string') {
          tokenString = res.token;
        }
        // Check if token is nested in data
        else if ((res as any).data?.token && typeof (res as any).data.token === 'string') {
          tokenString = (res as any).data.token;
        }
        // Check if the entire response is the token string
        else if (typeof res === 'string') {
          tokenString = res;
        }
        // Check if token object has a value property (AccessToken serialization issue)
        else if (res.token && typeof res.token === 'object') {
          console.warn('Token is an object, attempting to extract:', res.token);
          // Try common properties that might contain the JWT string
          const tokenObj = res.token as any;
          tokenString = tokenObj.value || tokenObj.jwt || tokenObj.token || tokenObj.toString?.() || tokenObj.toJwt?.();
          
          // If still not a string, try to find any string property
          if (!tokenString || typeof tokenString !== 'string') {
            for (const key in tokenObj) {
              if (typeof tokenObj[key] === 'string' && tokenObj[key].length > 50) {
                tokenString = tokenObj[key];
                break;
              }
            }
          }
        }
        
        if (!tokenString || typeof tokenString !== 'string' || tokenString.length < 10) {
          console.error('Invalid token format - received:', res);
          setAccessDenied('Failed to get valid token. Please try again.');
          return;
        }
        
        setToken(tokenString);
      })
      .catch((err: any) => {
        console.error('Failed to fetch LiveKit token:', err);
        const message = err?.response?.data?.message || err?.message || "Access denied";
        setAccessDenied(message);
      });
  }, [bookingId, data, me]);

  // Handler to rejoin after connection loss
  const handleRejoin = useCallback(async () => {
    if (!bookingId) return;
    setRejoining(true);
    try {
      // Re-fetch booking details to get latest attendance & status
      const freshData = await getBookingDetails(bookingId);
      setData(freshData);

      // Check if class was cancelled/ended while we were disconnected
      if (
        freshData.status === "CANCELED" ||
        freshData.status === "AUTO_CANCELLED_TUTOR_NO_SHOW" ||
        freshData.status === "AUTO_CANCELLED_STUDENT_NO_SHOW" ||
        freshData.status === "COMPLETED"
      ) {
        setConnectionLost(null);
        setDisconnected(true);
        return;
      }

      // Get a fresh LiveKit token
      const res = await fetchLivekitToken(bookingId);
      let tokenString: string | undefined;
      if (typeof res.token === 'string') tokenString = res.token;
      else if ((res as any).data?.token) tokenString = (res as any).data.token;
      else if (typeof res === 'string') tokenString = res;
      else if (res.token && typeof res.token === 'object') {
        const tokenObj = res.token as any;
        tokenString = tokenObj.value || tokenObj.jwt || tokenObj.token;
      }

      if (!tokenString || typeof tokenString !== 'string' || tokenString.length < 10) {
        showError('Failed to get valid token. Please try again.');
        return;
      }

      // Clear error states and reconnect
      setConnectionLost(null);
      setDisconnected(false);
      setToken(tokenString);
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to rejoin. Please try again.');
    } finally {
      setRejoining(false);
    }
  }, [bookingId, showError]);

  if (!bookingId) {
    return <div className="p-6">Invalid booking</div>;
  }

  if (loading) {
    return <div className="p-6">Loading call…</div>;
  }

  if (!data) {
    return <div className="p-6">Failed to load class details.</div>;
  }

  if (
    data.status === "CANCELED" ||
    data.status === "AUTO_CANCELLED_TUTOR_NO_SHOW" ||
    data.status === "AUTO_CANCELLED_STUDENT_NO_SHOW"
  ) {
    return (
      <div className="p-6">
        <div className="text-lg font-semibold text-slate-900">Class not available</div>
        <div className="mt-2 text-sm text-slate-700">This class has been closed due to a no-show or cancellation.</div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="p-6">
        <div className="text-lg font-semibold text-slate-900">Access denied</div>
        <div className="mt-2 text-sm text-slate-700">{accessDenied}</div>
      </div>
    );
  }

  // Tutor no-show — student gets refund modal at CallPage level
  // This must render ABOVE LiveKitRoom so it's not unmounted on disconnect
  if (noShowTriggered && !isTutor) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 sm:p-8 text-center space-y-5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
            <AlertTriangle className="h-8 w-8 text-orange-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Tutor didn&rsquo;t join the class
          </h2>
          <p className="text-sm text-slate-600">
            The tutor did not join within 10 minutes of the scheduled start time.
            {data && !data.isDemo && (
              <> Your 1 token has been refunded automatically.</>
            )}
          </p>
          {data && !data.isDemo && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
              <p className="text-sm font-semibold text-green-700">+1 Token refunded to your balance</p>
            </div>
          )}
          <button
            onClick={() => navigate('/student/sessions')}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Go to My Sessions
          </button>
        </div>
      </div>
    );
  }

  // Connection lost — show reconnect UI instead of permanent error
  if (connectionLost) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 sm:p-8 text-center space-y-5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Connection Lost</h2>
          <p className="text-sm text-slate-600">
            {connectionLost}
          </p>
          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={handleRejoin}
              disabled={rejoining}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:bg-slate-400"
            >
              {rejoining ? 'Rejoining…' : 'Rejoin Class'}
            </button>
            <button
              onClick={() => navigate(`/class/${bookingId}`)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to Class Details
            </button>
          </div>
        </div>
      </div>
    );
  }

  const serverUrl = import.meta.env.VITE_LIVEKIT_HOST as string | undefined;
  if (!serverUrl) {
    return <div className="p-6">LiveKit is not configured.</div>;
  }

  if (!token) {
    return <div className="p-6">Preparing your room…</div>;
  }

  return (
    <div className="h-screen bg-slate-50">
      <div className="flex items-center justify-between border-b bg-white px-3 sm:px-4 py-2.5 sm:py-3">
        <div className="font-semibold text-sm sm:text-base text-slate-900">Live class</div>
        <button
          className="rounded-lg border px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm text-slate-700 hover:bg-slate-50"
          onClick={() => setShowLeaveConfirm(true)}
        >
          Leave
        </button>
      </div>

      {/* Leave confirmation modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Leave class?</h2>
            <p className="text-sm text-slate-600">Are you sure you want to leave the class?</p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                No, Stay
              </button>
              <button
                onClick={() => navigate(`/class/${bookingId}`)}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 transition"
              >
                Yes, Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {disconnected ? (
        <div className="max-w-lg mx-auto mt-8 sm:mt-16 rounded-2xl border bg-white p-6 sm:p-8 shadow-sm text-center space-y-4 mx-3 sm:mx-auto">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Class Ended</h2>
          <p className="text-sm text-slate-600">Your live class session has ended.</p>
          <div className="flex flex-col gap-3 pt-2">
            {isTutor && data && (
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                onClick={() => navigate(`/tutor/performance-tracking?bookingId=${bookingId}&studentId=${data.student?.id || data.studentId}`)}
              >
                <FileText className="h-5 w-5" />
                Create Performance Report
              </button>
            )}
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => navigate(`/class/${bookingId}`)}
            >
              Back to Class Details
            </button>
          </div>
        </div>
      ) : (
        <LiveKitRoom
          token={token!}
          serverUrl={serverUrl!}
          connect={true}
          onDisconnected={(reason) => {
            console.log('LiveKit disconnected:', reason);
            // If no-show was triggered, don't show the Class Ended screen
            if (noShowTriggered) return;
            // Normal disconnect: user clicked Leave or server ended the session
            if (reason === DisconnectReason.CLIENT_INITIATED || reason === DisconnectReason.SERVER_SHUTDOWN) {
              setDisconnected(true);
            } else {
              // Connection lost (network issue, etc.) — show rejoin UI instead of permanent error
              const errorMsg = reason !== undefined
                ? `Your connection was interrupted (${DisconnectReason[reason] || reason}). You can rejoin the class.` 
                : 'Your connection was interrupted. Please check your network and rejoin.';
              setConnectionLost(errorMsg);
              // Clear the token so a fresh one is fetched on rejoin
              setToken(null);
            }
          }}
          onError={(error) => {
            console.error('LiveKit error:', error);
            // Show as connection lost (rejoinable) rather than permanent access denied
            setConnectionLost(`Connection error: ${error.message || 'Failed to connect to LiveKit server. Please check your network connection.'}`);
            setToken(null);
          }}
          className="h-full"
        >
          <CallRoomContent
            bookingId={bookingId}
            endTime={data?.endTime}
            isTutor={isTutor}
            counterpartName={counterpartName}
            classDate={data?.startTime || undefined}
            tutorAlreadyJoined={!!data?.attendance?.tutorJoinedAt}
            studentId={data?.student?.id || data?.studentId}
            isDemo={!!data?.isDemo}
            onNoShow={() => setNoShowTriggered(true)}
            onClassEnded={() => {
              // Trigger booking completion when class ends naturally
              if (bookingId) {
                api.post(`/bookings/${bookingId}/complete`).catch((err: any) => {
                  console.warn('Auto-complete failed (may already be completed):', err?.response?.data?.message || err?.message);
                });
              }
            }}
          />
        </LiveKitRoom>
      )}
    </div>
  );
}
