// src/pages/about.tsx
export default function About() {
  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold">About Tunect</h1>
      <p className="mt-3 text-slate-700">
        Tunect connects students and tutors for high-quality 1:1 sessions across subjects and regions.
        Our mission is to make education borderless, accessible, and personalized.
      </p>
      <h2 className="mt-8 text-xl font-semibold">What we offer</h2>
      <ul className="mt-2 list-disc pl-6 text-slate-700">
        <li>Verified tutors with transparent reviews</li>
        <li>Flexible booking and secure payments</li>
        <li>Support for live sessions and follow-ups</li>
      </ul>
    </div>
  );
}
