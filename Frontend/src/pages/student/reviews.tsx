import { useEffect, useMemo, useState } from 'react';
import { getMyBookings, type BookingDto } from '../../services/bookingsService';
import { createReview, deleteReview, getMyReviews, updateReview, type ReviewDto } from '../../services/reviewService';
import { useToast } from '../../contexts/ToastContext';

type Draft = { rating: number; comment: string };

type TutorReviewRow = {
  tutorId: string;
  tutorName: string;
  bookingId: string;
  review?: ReviewDto;
};

export default function StudentReviews() {
  const { showError, showSuccess } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TutorReviewRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [reviews, bookings] = await Promise.all([
          getMyReviews(1, 100),
          getMyBookings(),
        ]);

        let completed: BookingDto[] = [];
        if (Array.isArray(bookings?.completed)) {
          completed = bookings.completed;
        } else if (Array.isArray(bookings?.all)) {
          completed = bookings.all.filter((b) => b.status === 'COMPLETED');
        }

        const latestByTutor = new Map<string, BookingDto>();
        completed.forEach((b) => {
          const current = latestByTutor.get(b.tutorId);
          const currentTime = current?.endTime ? new Date(current.endTime).getTime() : 0;
          const nextTime = b.endTime ? new Date(b.endTime).getTime() : 0;
          if (!current || nextTime > currentTime) {
            latestByTutor.set(b.tutorId, b);
          }
        });

        const reviewByTutor = new Map<string, ReviewDto>();
        reviews.forEach((r) => reviewByTutor.set(r.tutorId, r));

        const nextRows: TutorReviewRow[] = Array.from(latestByTutor.values()).map((b) => {
          const review = reviewByTutor.get(b.tutorId);
          return {
            tutorId: b.tutorId,
            tutorName: b.tutor?.name || b.tutor?.email || 'Tutor',
            bookingId: b.id,
            review,
          };
        });

        if (!mounted) return;
        setRows(nextRows);

        const nextDrafts: Record<string, Draft> = {};
        nextRows.forEach((row) => {
          nextDrafts[row.tutorId] = {
            rating: row.review?.rating ?? 0,
            comment: row.review?.comment ?? '',
          };
        });
        setDrafts(nextDrafts);
      } catch (err: any) {
        showError(err?.message || 'Failed to load reviews');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [showError]);

  const hasRows = useMemo(() => rows.length > 0, [rows.length]);

  const updateDraft = (tutorId: string, next: Partial<Draft>) => {
    setDrafts((prev) => ({
      ...prev,
      [tutorId]: {
        rating: next.rating ?? prev[tutorId]?.rating ?? 0,
        comment: next.comment ?? prev[tutorId]?.comment ?? '',
      },
    }));
  };

  const handleSave = async (row: TutorReviewRow) => {
    const draft = drafts[row.tutorId];
    if (!draft || draft.rating < 1 || draft.rating > 5) {
      showError('Please select a rating between 1 and 5.');
      return;
    }

    setSaving(row.tutorId);
    try {
      if (row.review) {
        const updated = await updateReview(row.review.id, {
          rating: draft.rating,
          comment: draft.comment?.trim() || undefined,
        });
        showSuccess('Review updated.');
        setRows((prev) =>
          prev.map((r) => (r.tutorId === row.tutorId ? { ...r, review: updated } : r))
        );
      } else {
        const created = await createReview({
          bookingId: row.bookingId,
          rating: draft.rating,
          comment: draft.comment?.trim() || undefined,
        });
        showSuccess('Review submitted.');
        setRows((prev) =>
          prev.map((r) => (r.tutorId === row.tutorId ? { ...r, review: created } : r))
        );
      }
    } catch (err: any) {
      showError(err?.response?.data?.message || err?.message || 'Failed to save review');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (row: TutorReviewRow) => {
    if (!row.review) return;
    setSaving(row.tutorId);
    try {
      await deleteReview(row.review.id);
      showSuccess('Review deleted.');
      setRows((prev) =>
        prev.map((r) => (r.tutorId === row.tutorId ? { ...r, review: undefined } : r))
      );
      updateDraft(row.tutorId, { rating: 0, comment: '' });
    } catch (err: any) {
      showError(err?.response?.data?.message || err?.message || 'Failed to delete review');
    } finally {
      setSaving(null);
    }
  };

  let content: React.ReactNode;
  if (loading) {
    content = <div className="h-24 rounded-lg bg-slate-100 animate-pulse" />;
  } else if (hasRows === false) {
    content = (
      <div className="rounded-lg border border-slate-200 p-6 text-slate-600">
        No completed sessions yet.
      </div>
    );
  } else {
    content = (
      <div className="grid gap-4">
        {rows.map((row) => {
          const draft = drafts[row.tutorId] || { rating: 0, comment: '' };
          const isSaving = saving === row.tutorId;
          const ratingId = `rating-${row.tutorId}`;
          const commentId = `comment-${row.tutorId}`;
          return (
            <div key={row.tutorId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-500">Tutor</div>
                  <div className="text-lg font-medium text-slate-900">{row.tutorName}</div>
                </div>
                {row.review && (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    Reviewed
                  </span>
                )}
              </div>

              <div className="mt-4">
                <label htmlFor={ratingId} className="block text-sm text-slate-600 mb-2">Rating</label>
                <div id={ratingId} className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => updateDraft(row.tutorId, { rating: n })}
                      className={`h-9 w-9 rounded-full border ${
                        draft.rating >= n ? 'bg-amber-500 text-white border-amber-500' : 'border-slate-300 text-slate-600'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label htmlFor={commentId} className="block text-sm text-slate-600 mb-2">Comment</label>
                <textarea
                  id={commentId}
                  rows={3}
                  value={draft.comment}
                  onChange={(e) => updateDraft(row.tutorId, { comment: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Share your experience..."
                />
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSave(row)}
                  disabled={isSaving}
                  className="rounded-lg bg-ocean-600 px-4 py-2 text-sm font-medium text-white hover:bg-ocean-700 disabled:opacity-60"
                >
                  {row.review ? 'Update Review' : 'Submit Review'}
                </button>
                {row.review && (
                  <button
                    type="button"
                    onClick={() => handleDelete(row)}
                    disabled={isSaving}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-2">Your Reviews</h1>
      <p className="text-slate-600 mb-6">Leave one review per tutor. You can edit or delete it anytime.</p>
      {content}
    </div>
  );
}
