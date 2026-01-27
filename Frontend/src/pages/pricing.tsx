// src/pages/pricing.tsx
import SEO from '../components/SEO';

export default function Pricing() {
  // FAQ Schema for Pricing
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How much does tutoring cost on Tunect?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Each tutor sets their own hourly rate. The first session is always free as a demo. After that, you purchase tokens to book sessions. Minimum 5 tokens required per booking.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is the first session really free?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes! Every student gets their first session with any tutor completely free as a demo. This allows you to try the platform and see if the tutor is a good fit before purchasing tokens.',
        },
      },
      {
        '@type': 'Question',
        name: 'How do I purchase tokens?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'You can purchase tokens securely using our payment gateway. Tokens are used to book sessions with tutors. Each tutor sets their own hourly rate in tokens.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is the minimum token requirement?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'You need a minimum of 5 tokens to book a tutor session. Token prices vary based on the tutor\'s hourly rate.',
        },
      },
    ],
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <SEO
        title="Pricing & Tokens | Online Tutoring Plans | Tunect"
        description="Affordable online tutoring pricing in India. First session free! Purchase tokens to book 1-on-1 sessions with verified tutors. Flexible pricing, secure payments."
        url="/pricing"
        structuredData={faqSchema}
      />
      <h1 className="text-3xl font-bold mb-6 text-primary">Pricing & Tokens</h1>
      <ul className="space-y-4 text-gray-700">
        <li>🎁 First session is always <strong>free</strong> (Demo)</li>
        <li>🎯 Each tutor sets their own hourly rate (in tokens)</li>
        <li>💎 Minimum 5 tokens required to book a tutor</li>
        <li>💳 Purchase tokens securely using Stripe</li>
      </ul>
    </div>
  )
}