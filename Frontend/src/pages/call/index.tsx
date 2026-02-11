import { useEffect, useMemo, useState } from "react";
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
import { Track, type Participant, DisconnectReason } from "livekit-client";
import { getBookingDetails, type BookingDetailsDto } from "../../services/bookingsService";
import { useToast } from "../../contexts/ToastContext";
import { getTokenPayload } from "../../lib/apiClient";
import { fetchLivekitToken } from "../../services/livekit";
import { getBookingPerspective } from "../../utils/bookingPerspective";
import { useAuth } from "../../contexts/AuthContext";
import Whiteboard from "../../components/Whiteboard/Whiteboard";
import "@livekit/components-styles";

function ParticipantList() {
  const participants = useParticipants() as Participant[];
  return (
    <div className="space-y-2 text-sm text-slate-700">
      {participants.length === 0 ? (
        <div className="text-slate-500">Waiting for participants…</div>
      ) : (
        participants.map((p) => (
          <div key={p.identity} className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="truncate">{p.name || p.identity}</span>
            <span className="text-xs text-slate-500">{p.isLocal ? "You" : "Participant"}</span>
          </div>
        ))
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
    <div className="flex h-full flex-col gap-4">
      {screenTracks.length > 0 && (
        <div className="flex-1 min-h-[240px] rounded-2xl border bg-white p-2">
          <TrackLoop tracks={screenTracks}>
            <ParticipantTile />
          </TrackLoop>
        </div>
      )}
      <div className="flex-1 min-h-[320px] rounded-2xl border bg-white p-2">
        <GridLayout tracks={cameraTracks}>
          <ParticipantTile />
        </GridLayout>
      </div>
      <RoomAudioRenderer />
    </div>
  );
}

function CallRoomContent({ bookingId }: { bookingId: string }) {
  const participants = useParticipants() as Participant[];
  const room = useRoomContext();
  const [callStartedAt, setCallStartedAt] = useState<Date | null>(null);
  const [sideTab, setSideTab] = useState<"participants" | "whiteboard">("participants");

  const hasBothJoined = participants.length >= 2;

  useEffect(() => {
    if (!callStartedAt && hasBothJoined) {
      setCallStartedAt(new Date());
    }
  }, [callStartedAt, hasBothJoined]);

  useEffect(() => {
    if (!callStartedAt) return;
    const timer = globalThis.setTimeout(() => {
      room.disconnect();
    }, 60 * 60 * 1000);
    return () => globalThis.clearTimeout(timer);
  }, [callStartedAt, room]);

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col gap-4 p-4">
      <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="relative min-h-0">
          {!hasBothJoined && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/90 text-sm text-slate-700">
              Waiting room: the class will start when both participants join.
            </div>
          )}
          <LivekitStage />
        </div>
        <div className="rounded-2xl border bg-white p-4 flex flex-col min-h-0">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <button
              type="button"
              onClick={() => setSideTab("participants")}
              className={
                sideTab === "participants"
                  ? "rounded-lg bg-slate-900 px-3 py-1 text-white"
                  : "rounded-lg px-3 py-1 text-slate-600 hover:bg-slate-100"
              }
            >
              Participants
            </button>
            <button
              type="button"
              onClick={() => setSideTab("whiteboard")}
              className={
                sideTab === "whiteboard"
                  ? "rounded-lg bg-slate-900 px-3 py-1 text-white"
                  : "rounded-lg px-3 py-1 text-slate-600 hover:bg-slate-100"
              }
            >
              Whiteboard
            </button>
          </div>
          <div className="flex-1 min-h-0">
            {sideTab === "participants" ? (
              <ParticipantList />
            ) : (
              <div className="h-full rounded-xl border">
                <Whiteboard bookingId={bookingId} className="h-full min-h-[360px]" />
              </div>
            )}
          </div>
        </div>
      </div>
      {hasBothJoined ? (
        <div className="sticky bottom-0 z-20 rounded-2xl border bg-white/95 p-2 shadow-sm backdrop-blur">
          <ControlBar />
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
    const studentId = (me as any).studentId;
    const tutorId = (me as any).tutorId;
    
    let perspective = null;
    if (studentId && data.studentId === studentId) {
      // User is the student
      perspective = {
        isTutor: false,
        isStudent: true,
        self: { id: data.studentId, name: data.student?.name || "Student", email: data.student?.email },
        other: { id: data.tutorId, name: data.tutor?.name || "Tutor", email: data.tutor?.email },
      };
    } else if (tutorId && data.tutorId === tutorId) {
      // User is the tutor
      perspective = {
        isTutor: true,
        isStudent: false,
        self: { id: data.tutorId, name: data.tutor?.name || "Tutor", email: data.tutor?.email },
        other: { id: data.studentId, name: data.student?.name || "Student", email: data.student?.email },
      };
    } else {
      // Fallback to original function (handles encrypted emails)
      perspective = getBookingPerspective({ id: me.id, email: me.email, name: me.name }, data);
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

  const serverUrl = import.meta.env.VITE_LIVEKIT_HOST as string | undefined;
  if (!serverUrl) {
    return <div className="p-6">LiveKit is not configured.</div>;
  }

  if (!token) {
    return <div className="p-6">Preparing your room…</div>;
  }

  return (
    <div className="h-screen bg-slate-50">
      <div className="flex items-center justify-between border-b bg-white px-4 py-3">
        <div className="font-semibold text-slate-900">Live class</div>
        <button
          className="rounded-lg border px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          onClick={() => navigate(`/class/${bookingId}`)}
        >
          Leave
        </button>
      </div>

      {disconnected ? (
        <div className="p-6 text-slate-700">Call ended.</div>
      ) : (
        <LiveKitRoom
          token={token!}
          serverUrl={serverUrl!}
          connect={true}
          onDisconnected={(reason) => {
            console.log('LiveKit disconnected:', reason);
            // Only show "Call ended" if it was a normal disconnection, not a connection failure
            // Check if it's a user-initiated disconnect or if the session actually ended
            if (reason === DisconnectReason.CLIENT_INITIATED || reason === DisconnectReason.SERVER_SHUTDOWN) {
              setDisconnected(true);
            } else {
              // Connection error - show error message instead of "Call ended"
              const errorMsg = reason !== undefined
                ? `Connection lost: ${DisconnectReason[reason] || reason}` 
                : 'Unable to connect to LiveKit server. Please check your network connection and ensure the LiveKit server is accessible.';
              setAccessDenied(errorMsg);
            }
          }}
          onError={(error) => {
            console.error('LiveKit error:', error);
            setAccessDenied(`Connection error: ${error.message || 'Failed to connect to LiveKit server. Please check your network connection.'}`);
          }}
          className="h-full"
        >
          <CallRoomContent bookingId={bookingId} />
        </LiveKitRoom>
      )}
    </div>
  );
}
