import React from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

type Testimonial = {
  quote: string;
  name: string;
  subtitle: string;
  avatar?: string;
};

const testimonials: Testimonial[] = [
  {
    quote:
      '“Sarah made calculus finally click for me! Her teaching style is incredibly clear and patient. Went from struggling to getting A\'s in my college math courses.”',
    name: "Michael Johnson",
    subtitle: "Mathematics with Sarah Thompson",
  },
  {
    quote:
      "“Rajesh is an amazing teacher! His real-world experience at Google really shows. I landed my first programming job thanks to his guidance.”",
    name: "Priya Sharma",
    subtitle: "Python Programming with Rajesh Kumar",
  },
  {
    quote:
      "“The demo class helped me choose the right tutor. The token system is simple and transparent—no confusing subscriptions.”",
    name: "Arjun Mehta",
    subtitle: "IELTS Prep with Ayesha Khan",
  },
];

const Testimonials: React.FC = () => {
  const [idx, setIdx] = React.useState(0);

  const prev = () => setIdx((i) => (i - 1 + testimonials.length) % testimonials.length);
  const next = () => setIdx((i) => (i + 1) % testimonials.length);

  const t = testimonials[idx];

  return (
    <section className="w-full bg-white py-14">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="text-center text-2xl sm:text-3xl font-bold text-slate-900">
          What Our Students Say
        </h2>
        <p className="mt-2 text-center text-slate-600">
          Real feedback from students who’ve transformed their learning experience
        </p>

        <div className="relative mx-auto mt-10 max-w-3xl rounded-2xl bg-white p-8 shadow-md">
          <div className="flex items-center justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
            ))}
          </div>

          <p className="mt-6 text-center text-lg text-slate-800 leading-relaxed">
            {t.quote}
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-200" />
            <div className="text-center">
              <div className="font-semibold text-slate-900">{t.name}</div>
              <div className="text-sm text-slate-600">{t.subtitle}</div>
            </div>
          </div>

          <button
            aria-label="Previous"
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-2 shadow hover:bg-slate-50"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            aria-label="Next"
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-2 shadow hover:bg-slate-50"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* dots */}
          <div className="mt-6 flex items-center justify-center gap-2">
            {testimonials.map((_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full ${i === idx ? "bg-slate-900" : "bg-slate-300"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
