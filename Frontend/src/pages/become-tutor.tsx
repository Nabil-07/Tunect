// src/pages/BecomeTutor.tsx
import { useState } from "react";
import {
  DollarSign,
  Globe2,
  Clock,
  User,
  ShieldCheck,
  BookOpen,
  HelpCircle,
  Star,
  CheckCircle2,
  IndianRupee,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import api, { readToken, setAuthHeader } from "../lib/apiClient";

type TutorApplication = {
  fullName: string;
  subjects: string;
  experience: string;
  hourlyRate: string;
  qualification: string;
};

export default function BecomeTutor() {
  const navigate = useNavigate();

  // Earnings calculator state
  const [rate, setRate] = useState(1200);
  const [hours, setHours] = useState(10);
  const tutorShare = 0.85;

  // Application “form” state (purely UI now; no prefill, no caching)
  const [form, setForm] = useState<TutorApplication>({
    fullName: "",
    subjects: "",
    experience: "",
    hourlyRate: "",
    qualification: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  /** unified start flow:
   *  - not logged in → signup and then /choose-role
   *  - logged in → set role TUTOR server-side, store role, go to /tutor/kyc
   */
  const startApplication = async () => {
    const token = readToken();

    if (!token) {
      // No drafts. No prefill. Just a clean auth → choose role.
      navigate("/signup?next=/choose-role", { replace: true });
      return;
    }

    try {
      setAuthHeader(token);
      // Prefer profiles route if present
      await api.post("/profiles/choose-role", { role: "TUTOR" });
    } catch {
      // Fallback to auth route if profiles not available
      await api.post("/auth/choose-role", { role: "TUTOR" });
    }

    try {
      localStorage.setItem("role", "TUTOR");
    } catch {}
    navigate("/tutor/kyc", { replace: true });
  };

  // form submit now just triggers startApplication (no API body sent here)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await startApplication();
  };

  // helpers
  const formatINR = (n: number) =>
    n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  return (
    <div className="bg-white text-slate-800">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-green-100 to-blue-100 py-16">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              Share Your <span className="text-green-600">Knowledge</span>,<br />
              Earn <span className="text-blue-600">Global Income</span>
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Join thousands of tutors teaching students worldwide and earning
              fair income on their own terms.
            </p>
            <div className="mt-6 flex gap-4">
              <button
                onClick={startApplication}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                Start Teaching Today
              </button>
              <Link
                to="/contact"
                className="px-6 py-3 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition"
              >
                Have Questions?
              </Link>
            </div>
            <div className="mt-8 flex gap-8 text-slate-700">
              <div>
                <p className="font-bold text-xl">2,500+</p>
                <p className="text-sm">Active Tutors</p>
              </div>
              <div>
                <p className="font-bold text-xl">85%</p>
                <p className="text-sm">Earnings Share</p>
              </div>
              <div>
                <p className="font-bold text-xl">50+</p>
                <p className="text-sm">Countries</p>
              </div>
            </div>
          </div>

          {/* Application Card (no prefill, no caching, no direct submit to /tutors/apply) */}
          <div className="bg-white shadow-lg rounded-2xl p-6 border">
            <h2 className="text-2xl font-bold text-slate-800 mb-1">
              Tutor Application
            </h2>
            <p className="mb-5 text-sm text-slate-600">
              Tell us a bit about yourself. You’ll complete the full profile & KYC in the next step.
            </p>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <input
                type="text"
                name="fullName"
                value={form.fullName}
                onChange={handleChange}
                placeholder="Full Name"
                className="w-full p-3 border rounded-lg"
              />
              <input
                type="text"
                name="subjects"
                value={form.subjects}
                onChange={handleChange}
                placeholder="Subjects You Teach"
                className="w-full p-3 border rounded-lg"
              />
              <input
                type="text"
                name="experience"
                value={form.experience}
                onChange={handleChange}
                placeholder="Teaching Experience (e.g., 3 years)"
                className="w-full p-3 border rounded-lg"
              />
              <select
                name="qualification"
                value={form.qualification}
                onChange={handleChange}
                className="w-full p-3 border rounded-lg"
              >
                <option value="">Highest Qualification</option>
                <option value="High School">High School</option>
                <option value="Diploma">Diploma</option>
                <option value="Bachelors">Bachelors</option>
                <option value="Masters">Masters</option>
                <option value="PhD">PhD</option>
              </select>
              <input
                type="number"
                name="hourlyRate"
                value={form.hourlyRate}
                onChange={handleChange}
                placeholder="Hourly Rate (in INR)"
                className="w-full p-3 border rounded-lg"
              />

              <button
                type="submit"
                className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition"
              >
                Start Application
              </button>

              <p className="text-xs text-slate-500">
                We won’t auto-save details on this page. You’ll confirm everything in the KYC step.
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* Why Teach on Tunect */}
      <section className="py-16 max-w-7xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-center mb-12">
          Why Teach on Tunect?
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: <DollarSign className="h-8 w-8 text-green-600" />,
              title: "Earn Fair Income",
              desc: "Set your own hourly rates and earn 85% of fees. No hidden deductions.",
            },
            {
              icon: <Globe2 className="h-8 w-8 text-blue-600" />,
              title: "Global Reach",
              desc: "Teach students worldwide without geographical limitations.",
            },
            {
              icon: <Clock className="h-8 w-8 text-purple-600" />,
              title: "Flexible Schedule",
              desc: "Set your availability and teach when it’s convenient for you.",
            },
            {
              icon: <User className="h-8 w-8 text-orange-600" />,
              title: "One-on-One Teaching",
              desc: "Deliver impactful, personalized lessons to individual students.",
            },
            {
              icon: <ShieldCheck className="h-8 w-8 text-indigo-600" />,
              title: "Secure Platform",
              desc: "Safe payments and professional teaching environment.",
            },
            {
              icon: <BookOpen className="h-8 w-8 text-pink-600" />,
              title: "Teaching Support",
              desc: "Access tools and resources to help you succeed as a tutor.",
            },
          ].map((b, i) => (
            <div
              key={i}
              className="bg-white border rounded-xl p-6 hover:shadow-lg transition"
            >
              {b.icon}
              <h3 className="mt-4 font-semibold text-lg">{b.title}</h3>
              <p className="text-slate-600 mt-2">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Simple Application Process */}
      <section className="bg-slate-50 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          Simple Application Process
        </h2>
        <div className="max-w-5xl mx-auto grid md:grid-cols-4 gap-8 text-center">
          {[
            { num: "01", title: "Create Your Profile", desc: "Fill out your info, subjects, and experience." },
            { num: "02", title: "Upload Documents", desc: "Complete KYC verification by uploading ID." },
            { num: "03", title: "Profile Review", desc: "Our team reviews and verifies (24–48 hrs)." },
            { num: "04", title: "Start Teaching", desc: "Set your schedule and start earning." },
          ].map((step, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="w-16 h-16 flex items-center justify-center rounded-full bg-gradient-to-r from-green-600 to-blue-600 text-white text-xl font-bold">
                {step.num}
              </div>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="text-slate-600 mt-2 text-sm">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Earnings Calculator */}
      <section className="py-16 max-w-6xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-center mb-2">
          Calculate Your Potential Earnings
        </h2>
        <p className="text-center text-slate-600 mb-10">
          Move the sliders or pick a preset to see your monthly & yearly
          estimates (85% tutor share).
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="rounded-2xl p-6 bg-gradient-to-r from-green-600 to-blue-600 text-white shadow-lg">
            <label className="block font-medium">Hourly Rate (₹)</label>
            <div className="flex items-center gap-3 mt-2">
              <div className="shrink-0 rounded-lg bg-white/10 px-2 py-1 flex items-center gap-1">
                <IndianRupee className="w-4 h-4" />
                <span className="tabular-nums">{rate}</span>
              </div>
              <input
                type="range"
                min={200}
                max={3000}
                step={50}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="w-full accent-white"
              />
            </div>

            <label className="block font-medium mt-6">Hours per Week</label>
            <div className="flex items-center gap-3 mt-2">
              <div className="shrink-0 rounded-lg bg-white/10 px-2 py-1">
                <span className="tabular-nums">{hours}</span> hrs
              </div>
              <input
                type="range"
                min={2}
                max={40}
                step={1}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-full accent-white"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[5, 10, 15, 20, 25, 30].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(h)}
                  className={`px-3 py-1 rounded-full text-sm bg-white/15 hover:bg-white/25 transition ${
                    hours === h ? "ring-2 ring-white" : ""
                  }`}
                >
                  {h}h/week
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-xl bg-white/10 p-4">
              {(() => {
                const grossMonthly = rate * hours * 4;
                const yourShare = Math.round(grossMonthly * tutorShare);
                const yearly = yourShare * 12;
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="opacity-90">Estimated Monthly Earnings</span>
                      <span className="text-xl font-semibold">
                        ₹{formatINR(yourShare)}
                      </span>
                    </div>
                    <div className="border-t border-white/20 my-4" />
                    <div className="flex items-center justify-between">
                      <span className="opacity-90">Projected Yearly</span>
                      <span className="text-lg font-semibold">
                        ₹{formatINR(yearly)}
                      </span>
                    </div>
                    <p className="text-xs text-white/70 mt-3">
                      *Earnings shown are your take-home after standard platform deductions
                    </p>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Benefits & Quick examples */}
          <div className="space-y-4">
            {[
              "Keep 85% of session fees",
              "No subscription fees",
              "Weekly payouts to bank",
              "Set your own rates",
              "Global student base",
            ].map((b, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl border p-4 hover:shadow transition"
              >
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                <p className="text-slate-700">{b}</p>
              </div>
            ))}

            <div className="mt-6 rounded-xl border p-4">
              <p className="font-medium mb-3">
                Quick examples (at your current rate ₹{formatINR(rate)})
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[10, 20, 30].map((h) => {
                  const m = Math.round(rate * h * 4 * tutorShare);
                  return (
                    <div key={h} className="rounded-lg bg-slate-50 p-3">
                      <div className="text-slate-500">{h} hrs/week</div>
                      <div className="font-semibold">₹{formatINR(m)}/month</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-slate-50 py-16">
        <h2 className="text-3xl font-bold text-center mb-10">
          What Tutors Say
        </h2>
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
          {[
            { name: "Sarah K.", quote: "Tunect helped me reach students worldwide. I doubled my income within 3 months!" },
            { name: "Arjun M.", quote: "The flexible schedule lets me balance teaching with my PhD research." },
            { name: "Fatima R.", quote: "Payments are always on time, and I love the one-on-one teaching format." },
          ].map((t, i) => (
            <div
              key={i}
              className="bg-white border rounded-xl p-6 text-center shadow hover:shadow-lg transition"
            >
              <Star className="w-6 h-6 text-yellow-400 mx-auto" />
              <p className="italic mt-4">“{t.quote}”</p>
              <h4 className="mt-4 font-semibold">{t.name}</h4>
            </div>
          ))}
        </div>
      </section>

      {/* Tutor FAQ — Accordion */}
      <section className="py-16 max-w-4xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-center mb-2">Tutor FAQ</h2>
        <p className="text-center text-slate-600 mb-8">
          Answers to the most common questions from tutors.
        </p>

        {[
          {
            q: "How long does verification take?",
            a: "Most applications are reviewed within 24–48 hours. We’ll notify you by email as soon as it’s complete.",
          },
          {
            q: "What documents are required?",
            a: "A government-issued photo ID for KYC. Optionally, you can upload certificates to boost profile trust.",
          },
          {
            q: "How do I get paid?",
            a: "Weekly payouts via Razorpay/Stripe directly to your bank account. You’ll see a payout summary in your dashboard.",
          },
          {
            q: "Is there a joining fee?",
            a: "No. Creating a tutor account and applying for KYC is completely free.",
          },
        ].map((item, idx) => (
          <FaqItem key={idx} q={item.q} a={item.a} />
        ))}

        <div className="text-center mt-8">
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-slate-50 transition"
          >
            Still have a question? Contact support
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-gradient-to-r from-green-600 to-blue-600 py-16 text-center text-white">
        <h2 className="text-3xl font-bold">Ready to Start Teaching?</h2>
        <p className="mt-3 text-lg">
          Join thousands of tutors already earning fair income while making a
          global impact.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <button
            onClick={startApplication}
            className="px-6 py-3 bg-white text-green-700 rounded-lg font-medium hover:bg-slate-100 transition"
          >
            Apply Now — It’s Free
          </button>
          <Link
            to="/contact"
            className="px-6 py-3 border border-white rounded-lg font-medium hover:bg-white hover:text-green-700 transition"
          >
            Contact Us
          </Link>
        </div>
      </section>
    </div>
  );
}

/** Small accordion item for FAQ */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b py-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-4 text-left"
      >
        <span className="flex items-center gap-2 font-semibold text-slate-800">
          <HelpCircle className="w-5 h-5 text-green-600" />
          {q}
        </span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-slate-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-500" />
        )}
      </button>
      {open && <p className="mt-2 text-slate-600">{a}</p>}
    </div>
  );
}
