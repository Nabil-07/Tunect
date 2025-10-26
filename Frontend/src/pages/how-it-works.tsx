// src/pages/how-it-works.tsx
export default function HowItWorks() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-primary">How Tunect Works</h2>
      <ol className="space-y-4 list-decimal list-inside text-gray-800">
        <li>Sign up as a student or tutor</li>
        <li>Students search and filter tutors by subject, price, rating, or country</li>
        <li>Book a free demo or paid session with tokens</li>
        <li>Join the session via Zoom/Google Meet</li>
        <li>Chat, rate, and message your tutor after session</li>
      </ol>
    </div>
  )
}
