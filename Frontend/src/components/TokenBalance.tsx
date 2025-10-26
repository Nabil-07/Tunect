// =============================================
// File: src/components/Testimonials.tsx
// Description: Testimonials carousel (controlled)
// =============================================
import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';

export type Testimonial = {
  quote: string;
  name: string;
  subtitle: string;
};

const Testimonials: React.FC<{ items: Testimonial[] }> = ({ items }) => {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % items.length), 4500);
    return () => window.clearInterval(id);
  }, [items.length]);

  return (
    <section className="w-full bg-white py-14">
      <div className="container-px mx-auto">
        <h2 className="text-center text-2xl sm:text-3xl font-bold text-ink">What Our Students Say</h2>
        <p className="mt-2 text-center text-slate-600">Real feedback from students who’ve transformed their learning</p>

        <div className="relative mx-auto mt-10 max-w-3xl rounded-2xl bg-white p-8 shadow-md">
          <div className="flex items-center justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
            ))}
          </div>

          <p className="mt-6 text-center text-lg text-slate-800 leading-relaxed">{items[idx].quote}</p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-200" />
            <div className="text-center">
              <div className="font-semibold text-ink">{items[idx].name}</div>
              <div className="text-sm text-slate-600">{items[idx].subtitle}</div>
            </div>
          </div>

          <button
            aria-label="Previous"
            onClick={() => setIdx((i) => (i - 1 + items.length) % items.length)}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-2 shadow hover:bg-slate-50"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            aria-label="Next"
            onClick={() => setIdx((i) => (i + 1) % items.length)}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-2 shadow hover:bg-slate-50"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="mt-6 flex items-center justify-center gap-2">
            {items.map((_, i) => (
              <span key={i} className={`h-2 w-2 rounded-full ${i === idx ? 'bg-slate-900' : 'bg-slate-300'}`} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
