// src/components/Footer.tsx
import { Link } from 'react-router-dom';

export default function Footer() {
  const year = new Date().getFullYear();
  const socials = [
    {
      label: "Instagram",
      href: "https://www.instagram.com/offical.tunect?igsh=dGx3YmY5YnhxN3p2",
      icon: "/icons/instagram.svg",
    },
    {
      label: "YouTube",
      href: "https://www.youtube.com/channel/UCKciojRm4f8GS_MhgFu1yQw",
      icon: "youtube",
    },
    {
      label: "LinkedIn",
      href: "https://www.linkedin.com/company/tunect/",
      icon: "/icons/linkedin.svg",
    },
  ];

  return (
    <footer
      className="bg-[#0b1120] text-slate-200"
      aria-labelledby="footer-heading"
    >
      <h2 id="footer-heading" className="sr-only">Footer</h2>

      <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16">
        {/* Top grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Brand + tagline */}
          <div>
            <div className="flex items-center gap-3">
              {/* Tunect Logo */}
              <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-white/20 shadow-[0_8px_20px_-10px_rgba(16,185,129,.5)]">
                <img
                  src="/tunect_logo_hd.png"
                  alt="Tunect Logo"
                  className="h-8 w-24 object-contain"
                />
              </div>
              <span className="text-2xl font-semibold tracking-tight">Tunect</span>
            </div>

            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-slate-400">
              Connecting students and tutors worldwide for personalized one-on-one learning.
              Making education borderless, accessible, and personalized.
            </p>

            <div className="mt-5 flex items-center gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
                >
                  {s.icon === "youtube" ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-white"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3A2.7 2.7 0 0 0 2.4 7.2 28.6 28.6 0 0 0 2 12a28.6 28.6 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.3a2.7 2.7 0 0 0 1.9-1.9A28.6 28.6 0 0 0 22 12a28.6 28.6 0 0 0-.4-4.8ZM10 15.5V8.5l6 3.5-6 3.5Z" />
                    </svg>
                  ) : (
                    <img src={s.icon} alt="" className="h-4 w-4" />
                  )}
                </a>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-slate-400">
              <span className="inline-flex items-center gap-2 text-sm">
                {/* shield icon */}
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M12 2 4.5 5v6.2c0 4.76 3.3 9.27 7.5 10.8 4.2-1.53 7.5-6.04 7.5-10.8V5L12 2Z" />
                </svg>
                100% Secure Payments
              </span>

              {/* Razorpay pill (external) */}
              <a
                href="https://razorpay.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium hover:bg-white/10"
                aria-label="Razorpay (opens in a new tab)"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-blue-600 text-white text-[10px] font-bold">
                  RP
                </span>
                <span>Razorpay</span>
              </a>
            </div>
          </div>

          {/* Navigation */}
          <nav aria-label="Navigation">
            <h3 className="text-lg font-semibold text-white">Navigation</h3>
            <ul className="mt-4 space-y-3 text-[15px]">
              <li><Link to="/" className="text-slate-300 hover:text-white transition-colors">Home</Link></li>
              <li><Link to="/about" className="text-slate-300 hover:text-white transition-colors">About</Link></li>
              <li><Link to="/find-tutors" className="text-slate-300 hover:text-white transition-colors">Find Tutors</Link></li>
              <li><Link to="/become-tutor" className="text-slate-300 hover:text-white transition-colors">Become a Tutor</Link></li>
              <li><Link to="/blogs" className="text-slate-300 hover:text-white transition-colors">Blogs</Link></li>
            </ul>
          </nav>

          {/* Platform */}
          <nav aria-label="Platform">
            <h3 className="text-lg font-semibold text-white">Platform</h3>
            <ul className="mt-4 space-y-3 text-[15px]">
              <li><Link to="/student/dashboard" className="text-slate-300 hover:text-white transition-colors">Student Dashboard</Link></li>
              <li><Link to="/tutor/dashboard" className="text-slate-300 hover:text-white transition-colors">Tutor Dashboard</Link></li>
              <li><Link to="/admin/dashboard" className="text-slate-300 hover:text-white transition-colors">Admin Dashboard</Link></li>

              <li className="my-2 border-t border-white/10 pt-4" />

              <li><Link to="/privacy" className="text-slate-300 hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms" className="text-slate-300 hover:text-white transition-colors">Terms of Use</Link></li>
            </ul>
          </nav>
        </div>

        {/* Divider */}
        <div className="mt-12 border-t border-white/10" />

        {/* Bottom bar */}
        <div className="pt-6 text-sm text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {year} Tunect. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/blogs" className="hover:text-white transition-colors">
              Blogs
            </Link>
            <p>Made with <span className="mx-1 text-rose-400">♥</span> for global education.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
