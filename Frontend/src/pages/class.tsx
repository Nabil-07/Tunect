import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Calendar, Clock, Copy, Download, ExternalLink, FileText, RefreshCcw, TrendingUp, Video } from "lucide-react";
import { getBookingDetails, type BookingDetailsDto } from "../services/bookingsService";
import { whiteboardService } from "../services/whiteboardService";
import { useToast } from "../contexts/ToastContext";
import { loadUser } from "../utils/authStorage";
import { exportToBlob } from "@excalidraw/excalidraw";
import { jsPDF } from "jspdf";

export default function ClassPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const [data, setData] = useState<BookingDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [wbNotes, setWbNotes] = useState<{ noteName: string; data: any; sharedAt: string } | null>(null);
  const currentUser = loadUser();

  useEffect(() => {
    if (!bookingId) return;
    refresh();
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  async function refresh() {
    if (!bookingId) return;
    try {
      setLoading(true);
      const res = await getBookingDetails(bookingId);
      setData(res);
    } catch (err: any) {
      console.error("Failed to load booking details", err);
      showError(err?.response?.data?.message || "Failed to load class details");
    } finally {
      setLoading(false);
    }
  }

  async function loadNotes() {
    if (!bookingId) return;
    try {
      const notes = await whiteboardService.getWhiteboardNotes(bookingId);
      if (notes) setWbNotes(notes);
    } catch {
      // No notes or not authorized — ignore
    }
  }

  const [downloadingPdf, setDownloadingPdf] = useState(false);

  async function downloadNotes() {
    if (!wbNotes?.data) return;
    try {
      setDownloadingPdf(true);

      const elements = wbNotes.data.elements || [];
      const appState = wbNotes.data.appState || {};
      const files = wbNotes.data.files || null;

      if (!elements.length) {
        showError("Whiteboard is empty — nothing to export.");
        return;
      }

      // Render whiteboard elements as a PNG blob using Excalidraw's export
      const blob = await exportToBlob({
        elements,
        appState: {
          ...appState,
          exportWithDarkMode: false,
          exportBackground: true,
          viewBackgroundColor: "#ffffff",
        },
        files,
        mimeType: "image/png",
        getDimensions: (width: number, height: number) => ({
          width: Math.min(width * 2, 4096),
          height: Math.min(height * 2, 4096),
          scale: 2,
        }),
      });

      // Convert blob to data URL for embedding in PDF
      const imgDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Load image to get dimensions
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imgDataUrl;
      });

      // Create PDF with proper orientation based on image aspect ratio
      const isLandscape = img.width > img.height;
      const pdf = new jsPDF({
        orientation: isLandscape ? "landscape" : "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      // Add title header
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text(displayNoteName, margin, margin + 6);

      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(100, 100, 100);
      const sharedDate = wbNotes.sharedAt
        ? new Date(wbNotes.sharedAt).toLocaleString()
        : new Date().toLocaleString();
      pdf.text(`Shared: ${sharedDate}`, margin, margin + 12);
      pdf.setTextColor(0, 0, 0);

      // Fit the image into remaining page area
      const headerHeight = 18;
      const availableW = pageWidth - margin * 2;
      const availableH = pageHeight - margin * 2 - headerHeight;
      const imgAspect = img.width / img.height;
      const areaAspect = availableW / availableH;

      let imgW: number, imgH: number;
      if (imgAspect > areaAspect) {
        imgW = availableW;
        imgH = availableW / imgAspect;
      } else {
        imgH = availableH;
        imgW = availableH * imgAspect;
      }

      const imgX = margin + (availableW - imgW) / 2;
      const imgY = margin + headerHeight;

      pdf.addImage(imgDataUrl, "PNG", imgX, imgY, imgW, imgH);

      // Save file
      const fileName = `${displayNoteName}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      showError("Failed to generate PDF. Downloading as image instead.");
      // Fallback: try direct image download
      try {
        const elements = wbNotes.data.elements || [];
        const appState = wbNotes.data.appState || {};
        const files = wbNotes.data.files || null;
        const fallbackBlob = await exportToBlob({
          elements,
          appState: { ...appState, exportBackground: true },
          files,
          mimeType: "image/png",
        });
        const url = URL.createObjectURL(fallbackBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${displayNoteName}.png`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        showError("Failed to export whiteboard notes.");
      }
    } finally {
      setDownloadingPdf(false);
    }
  }

  const meetingUrl = data?.meetingUrl;
  const isLivekit = !!meetingUrl && (meetingUrl.startsWith("livekit:") || meetingUrl.startsWith("webrtc:"));
  const startTime = data?.startTime ? new Date(data.startTime) : null;
  const endTime = data?.endTime ? new Date(data.endTime) : null;
  const userRole = String(currentUser?.role || "").toUpperCase();
  const isTutorView =
    userRole === "TUTOR" ||
    (!!currentUser?.id && !!data?.tutor?.id && currentUser.id === data.tutor.id);
  const counterpartLabel = isTutorView ? "Student" : "Tutor";
  const counterpartName = isTutorView
    ? data?.student?.name || data?.student?.email || data?.studentId || "Student"
    : data?.tutor?.name || data?.tutor?.email || "Tutor";

  // Build display-friendly note name showing counterpart from viewer's perspective
  const displayNoteName = (() => {
    if (!wbNotes?.noteName) return "Whiteboard Notes";
    // The note was saved by the tutor with the student's name.
    // Replace the stored name with the counterpart name for the current viewer.
    const dateMatch = wbNotes.noteName.match(/_([\d-]+)$/);
    const datePart = dateMatch ? `_${dateMatch[1]}` : "";
    return `ClassWhiteBoardNotes-${counterpartName}${datePart}`;
  })();

  const handleOpenClassroom = () => {
    if (!meetingUrl) return;
    if (startTime) {
      const openAt = new Date(startTime.getTime() - 5 * 60 * 1000);
      const now = new Date();
      if (now < openAt) {
        const mins = Math.max(1, Math.ceil((openAt.getTime() - now.getTime()) / 60000));
        setJoinMessage(`Classroom opens ${mins} min before start. Please wait ${mins} min.`);
        setShowJoinModal(true);
        return;
      }
    }
    if (endTime) {
      const closeAt = new Date(endTime.getTime() + 10 * 60 * 1000);
      if (new Date() > closeAt) {
        setJoinMessage("This class has ended. Please contact support if needed.");
        setShowJoinModal(true);
        return;
      }
    }
    if (isLivekit) {
      navigate(`/call/${bookingId}`);
      return;
    }
    globalThis.open(meetingUrl, "_blank");
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-slate-500">Booking</p>
          <h1 className="text-2xl font-bold text-slate-800">Class Details</h1>
          {bookingId && <p className="text-sm text-slate-500">ID: {bookingId}</p>}
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCcw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center text-slate-600">Loading class…</div>
      ) : !data ? (
        <div className="text-center text-red-600">Unable to load class details.</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
          {/* Status badge */}
          {data.status === "COMPLETED" && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Completed
            </div>
          )}
          {data.status === "CONFIRMED" && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
              Confirmed
            </div>
          )}
          {(data.status === "CANCELED" || data.status?.startsWith("AUTO_CANCELLED")) && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
              Cancelled
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">{counterpartLabel}</p>
              <p className="text-lg font-semibold text-slate-800">{counterpartName}</p>
              {data.isGroupSession ? (
                <p className="text-sm text-slate-600">
                  Students: {data.currentEnrollment}/{data.maxStudents}
                </p>
              ) : (
                <p className="text-sm text-slate-600">
                  {isTutorView ? `Student ID: ${data.studentId}` : `Tutor ID: ${data.tutorId}`}
                </p>
              )}
            </div>
            <div className="text-sm text-slate-600">
              {data.startTime && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {new Date(data.startTime).toLocaleString()}
                </div>
              )}
              {data.endTime && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Ends {new Date(data.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={handleOpenClassroom}
              disabled={!meetingUrl}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-600"
            >
              <Video className="h-5 w-5" />
              {meetingUrl ? (isLivekit ? "Open Classroom" : "Join Class") : "No meeting link"}
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs text-slate-500">Whiteboard opens inside the live classroom.</p>

          {meetingUrl && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-sm">
              <div className="truncate">
                <p className="text-slate-500">Meeting URL</p>
                <p className="font-mono text-slate-700 truncate">{meetingUrl}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(meetingUrl);
                  showSuccess("Copied meeting link");
                }}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                <Copy className="h-4 w-4" /> Copy
              </button>
            </div>
          )}

          {/* Whiteboard Notes */}
          {wbNotes && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-emerald-800 truncate">{displayNoteName}</p>
                    <p className="text-xs text-emerald-600">
                      Shared {new Date(wbNotes.sharedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={downloadNotes}
                  disabled={downloadingPdf}
                  className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500"
                >
                  <Download className="h-4 w-4" /> {downloadingPdf ? "Generating…" : "Download"}
                </button>
              </div>
            </div>
          )}

          {/* Create Performance Report — tutor only, after class */}
          {isTutorView && data.status === "COMPLETED" && bookingId && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-blue-800">Performance Report</p>
                    <p className="text-xs text-blue-600">Track your student's progress from this session</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/tutor/performance-tracking?bookingId=${bookingId}&studentId=${data.studentId}`)}
                  className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <FileText className="h-4 w-4" /> Create Report
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showJoinModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Classroom not open yet</h3>
            <p className="mt-2 text-sm text-slate-600">{joinMessage || "Please wait until the scheduled time."}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowJoinModal(false)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Ok
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}