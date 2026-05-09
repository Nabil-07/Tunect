import React from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { http as api } from "../api/http";

type Testimonial = {
  id: string;
  rating: number;
  comment: string;
  studentName: string;
  studentAvatar?: string | null;
  tutorName: string;
  tutorSubject?: string;
};

const Testimonials: React.FC = () => {
  const [idx, setIdx] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<Testimonial[]>([]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get<Testimonial[]>("/reviews/featured", { params: { limit: 6 } });
        if (!mounted) return;
        const list = Array.isArray(data) ? data.filter((r) => r.comment) : [];
        setItems(list);
        setIdx(0);
      } catch {
        if (!mounted) return;
        setItems([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const prev = () => setIdx((i) => (i - 1 + items.length) % items.length);
  const next = () => setIdx((i) => (i + 1) % items.length);

  const t = items[idx];
  const canSlide = items.length > 1;

  let content: React.ReactNode;
  if (loading) {
    content = <div className="h-32 animate-pulse rounded-xl bg-slate-50" />;
  } else if (items.length === 0) {
    content = (
      <div className="text-center text-slate-600">
        <div className="text-lg font-semibold text-slate-900">Be the first to share feedback</div>
        <p className="mt-2 text-sm text-slate-600">
          After your session, leave a review to help other students pick the right tutor.
        </p>
      </div>
    );
  } else {
    content = (
      <>
        <div className="flex items-center justify-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`h-5 w-5 ${
                n <= Math.round(t.rating) ? "fill-yellow-400 text-yellow-400" : "text-slate-300"
              }`}
            />
          ))}
        </div>

        <p className="mt-6 text-center text-lg text-slate-800 leading-relaxed">
          “{t.comment}”
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-200 flex items-center justify-center">
            {t.studentAvatar ? (
              <img src={t.studentAvatar} alt={t.studentName} className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs font-semibold text-slate-600">
                {t.studentName.substring(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="text-center">
            <div className="font-semibold text-slate-900">{t.studentName}</div>
            <div className="text-sm text-slate-600">
              {t.tutorSubject ? `${t.tutorSubject} with ${t.tutorName}` : `Session with ${t.tutorName}`}
            </div>
          </div>
        </div>

        <button
          aria-label="Previous"
          onClick={prev}
          disabled={!canSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-2 shadow hover:bg-slate-50 disabled:opacity-40"
          data-testid="testimonials-prev-btn"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          aria-label="Next"
          onClick={next}
          disabled={!canSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-2 shadow hover:bg-slate-50 disabled:opacity-40"
          data-testid="testimonials-next-btn"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        <div className="mt-6 flex items-center justify-center gap-2">
          {items.map((item, i) => (
            <span
              key={item.id}
              className={`h-2 w-2 rounded-full ${i === idx ? "bg-ocean-600" : "bg-slate-200"}`}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <section className="w-full bg-white py-14">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="text-center text-2xl sm:text-3xl font-bold text-slate-900">
          Testimonials from Our Valued Students
        </h2>
        <p className="mt-3 text-center text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Discover how students have transformed their academic journeys with Tunect.
        </p>
        <p className="mt-1 text-center text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
          We encourage all users to leave a review after their session. This feedback is invaluable for helping other students find a tutor online who is perfectly suited to their needs and learning style.
        </p>

        <div className="relative mx-auto mt-10 max-w-3xl rounded-2xl bg-white p-8 shadow-md" data-testid="testimonials-card">
          {content}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
