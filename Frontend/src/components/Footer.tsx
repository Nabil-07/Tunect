// src/components/Footer.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/apiClient';

interface SupportContact {
  phone: string | null;
  email: string | null;
}

export default function Footer() {
  const year = new Date().getFullYear();
  const [support, setSupport] = useState<SupportContact>({ phone: null, email: null });

  useEffect(() => {
    api.get('/policy-config')
      .then(({ data }) => {
        const phone = data?.legal?.supportPhone?.trim() || null;
        const email = data?.legal?.supportEmail?.trim() || null;
        setSupport({ phone, email });
      })
      .catch(() => { /* keep nulls = don't render */ });
  }, []);
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
      data-testid="footer"
    >
      <h2 id="footer-heading" className="sr-only">Footer</h2>

      <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16">
        {/* Top grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
          {/* Brand + tagline */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              {/* Tunect Logo */}
              <div className="rounded-xl bg-white/95 px-4 py-2.5 shadow-lg shadow-emerald-500/10">
                <img
                  src="/tunect_logo_hd_main.png"
                  alt="Tunect Logo"
                  className="h-10 w-auto object-contain"
                />
              </div>
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
                  data-testid={`footer-social-${s.label.toLowerCase()}-link`}
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
              <li><Link to="/" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-home-link">Home</Link></li>
              <li><Link to="/about" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-about-link">About</Link></li>
              <li><Link to="/find-tutors" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-find-tutors-link">Find Tutors</Link></li>
              <li><Link to="/trending-tutors" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-trending-tutors-link">Trending Tutors</Link></li>
              <li><Link to="/become-tutor" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-become-tutor-link">Become a Tutor</Link></li>
              <li><Link to="/how-it-works" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-how-it-works-link">How It Works</Link></li>
              <li><Link to="/pricing" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-pricing-link">Pricing</Link></li>
              <li><Link to="/blogs" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-blogs-link">Blogs</Link></li>
            </ul>
          </nav>

          {/* Popular Subjects (SEO internal links) */}
          <nav aria-label="Popular Subjects">
            <h3 className="text-lg font-semibold text-white">Popular Subjects</h3>
            <ul className="mt-4 space-y-3 text-[15px]">
              <li><Link to="/online-maths-tutor" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-maths-tutor-link">Online Maths Tutor</Link></li>
              <li><Link to="/online-physics-tutor" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-physics-tutor-link">Online Physics Tutor</Link></li>
              <li><Link to="/online-chemistry-tutor" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-chemistry-tutor-link">Online Chemistry Tutor</Link></li>
              <li><Link to="/online-biology-tutor" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-biology-tutor-link">Online Biology Tutor</Link></li>
              <li><Link to="/online-english-tutor" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-english-tutor-link">Online English Tutor</Link></li>
            </ul>
          </nav>

          {/* Platform + Legal */}
          <nav aria-label="Platform">
            <h3 className="text-lg font-semibold text-white">Platform</h3>
            <ul className="mt-4 space-y-3 text-[15px]">
              <li><Link to="/student/dashboard" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-student-dashboard-link">Student Dashboard</Link></li>
              <li><Link to="/tutor/dashboard" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-tutor-dashboard-link">Tutor Dashboard</Link></li>
              <li><Link to="/support" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-support-link">Help &amp; Support</Link></li>

              <li className="my-2 border-t border-white/10 pt-4" />

              <li><Link to="/privacy" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-privacy-link">Privacy Policy</Link></li>
              <li><Link to="/terms" className="text-slate-300 hover:text-white transition-colors" data-testid="footer-terms-link">Terms of Use</Link></li>
            </ul>
          </nav>

          {/* Customer Support – only rendered when at least one contact is configured */}
          {(support.phone ?? support.email) && (
            <div>
              <h3 className="text-lg font-semibold text-white">Customer Support</h3>
              <ul className="mt-4 space-y-3 text-[15px]">
                {support.phone && (
                  <li>
                    <a href={`tel:${support.phone.replaceAll(' ', '')}`} className="text-slate-300 hover:text-white transition-colors inline-flex items-center gap-2">
                      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
                        <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2Z" />
                      </svg>
                      {support.phone}
                    </a>
                    <p className="text-xs text-slate-500 mt-0.5 ml-6">Available: 10 AM – 8 PM (IST)</p>
                  </li>
                )}
                {support.email && (
                  <li>
                    <a href={`mailto:${support.email}`} className="text-slate-300 hover:text-white transition-colors inline-flex items-center gap-2">
                      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
                        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2Zm0 4-8 5-8-5V6l8 5 8-5v2Z" />
                      </svg>
                      {support.email}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mt-12 border-t border-white/10" />

        {/* Bottom bar */}
        <div className="pt-6 text-sm text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {year} Tunect. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/blogs" className="hover:text-white transition-colors" data-testid="footer-bottom-blogs-link">
              Blogs
            </Link>
            <p>Made with <span className="mx-1 text-rose-400">♥</span> for global education.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
