// src/pages/pricing.tsx
export default function Pricing() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-primary">Pricing & Tokens</h2>
      <ul className="space-y-4 text-gray-700">
        <li>🎁 First session is always <strong>free</strong> (Demo)</li>
        <li>🎯 Each tutor sets their own hourly rate (in tokens)</li>
        <li>💎 Minimum 10 tokens required to book a tutor</li>
        <li>💳 Purchase tokens securely using Stripe</li>
      </ul>
    </div>
  )
}