// src/pages/terms.tsx
import { Scale, UserCheck, CreditCard, Shield, MessageSquare, AlertTriangle, Award, FileText } from 'lucide-react';

export default function Terms() {
  return (
    <div className="min-h-screen bg-slate-50" data-testid="terms-page">
      {/* Header */}
      <section className="bg-gradient-to-r from-ocean-700 to-green-500 text-white py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex justify-center mb-4">
              <Scale className="h-16 w-16" />
            </div>
            <h1 className="text-5xl font-bold mb-4">Terms of Use</h1>
            <p className="text-xl text-white/90">Last Updated: February 15, 2026</p>
            <p className="text-lg text-white/80 mt-4">
              Please read these terms carefully before using Tunect. By accessing or using our platform, 
              you agree to be bound by these terms.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-16 container mx-auto px-4">
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Section 1 */}
          <TermsSection
            icon={<FileText className="h-8 w-8 text-ocean-600" />}
            title="1. Acceptance of Terms"
          >
            <p className="text-slate-600">
              By creating an account, accessing, or using Tunect ("the Platform"), you agree to comply with 
              and be bound by these Terms of Use, our Privacy Policy, and all applicable laws and regulations. 
              If you do not agree with any part of these terms, you must not use the Platform.
            </p>
            <p className="text-slate-600 mt-3">
              These terms apply to all users including students, tutors, and administrators. Additional 
              terms may apply to specific user types as outlined in the sections below.
            </p>
          </TermsSection>

          {/* Section 2 */}
          <TermsSection
            icon={<UserCheck className="h-8 w-8 text-green-600" />}
            title="2. Account Registration & Eligibility"
          >
            <h3 className="font-semibold text-lg mb-3 text-slate-800">2.1 Eligibility</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li>You must be at least 13 years old to use Tunect</li>
              <li>Users under 18 require parental consent and supervision</li>
              <li>Tutors must be at least 18 years old and legally authorized to work</li>
              <li>You must provide accurate and complete information during registration</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">2.2 Account Security</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li>You are responsible for maintaining the confidentiality of your password</li>
              <li>You must notify us immediately of any unauthorized account access</li>
              <li>You are liable for all activities conducted through your account</li>
              <li>Sharing accounts is strictly prohibited</li>
              <li>We reserve the right to suspend or terminate accounts that violate these terms</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">2.3 Account Verification</h3>
            <p className="text-slate-600">
              We may require email, phone, or identity verification. Tutors must complete KYC (Know Your Customer) 
              verification and skill assessments before offering services. Providing false information may result 
              in immediate account termination.
            </p>
          </TermsSection>

          {/* Section 3 - Student Terms */}
          <TermsSection
            icon={<Award className="h-8 w-8 text-purple-600" />}
            title="3. Terms for Students"
          >
            <h3 className="font-semibold text-lg mb-3 text-slate-800">3.1 Booking & Scheduling</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li>Sessions must be booked through the Platform</li>
              <li>You must arrive on time for scheduled sessions</li>
              <li>Free demo sessions are limited to one per tutor per student</li>
              <li>Recurring bookings require upfront payment for the full package</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">3.2 Cancellation & Refund Policy</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li><strong>Awaiting Slot Selection:</strong> If you cancel before a time slot is assigned, you receive a 100% refund to your token balance</li>
              <li><strong>Cancellations 48+ hours before scheduled time:</strong> 100% refund to token balance</li>
              <li><strong>Cancellations 24-48 hours before scheduled time:</strong> 50% refund to token balance</li>
              <li><strong>Cancellations less than 24 hours before scheduled time:</strong> No refund</li>
              <li><strong>No-shows:</strong> Full session fee charged, no refund</li>
              <li><strong>Demo sessions:</strong> Free of charge, cancellation does not affect token balance</li>
              <li><strong>Tutor cancellation:</strong> Full refund to token balance</li>
            </ul>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-4">
              <p className="text-sm text-blue-900">
                <strong>Note:</strong> All refunds are processed to your token balance, not to the original payment method. 
                Cancelled slots are automatically released and become available for other students to book. 
                Refund timing is calculated from the originally scheduled session start time.
              </p>
            </div>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">3.3 Token System</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li>Tokens are non-refundable to original payment method (refunds to token balance only)</li>
              <li>Tokens are valid for 60 days from the date of purchase unless otherwise specified</li>
              <li>Promotional tokens may have expiration dates and usage restrictions</li>
              <li>Tokens are non-transferable between accounts</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">3.4 Student Responsibilities</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600">
              <li>Participate actively and respectfully during sessions</li>
              <li>Provide honest feedback and reviews</li>
              <li>Do not record sessions without tutor's explicit consent</li>
              <li>Do not share session materials publicly without permission</li>
              <li>Report any inappropriate behavior or content immediately</li>
            </ul>
          </TermsSection>

          {/* Section 4 - Tutor Terms */}
          <TermsSection
            icon={<Award className="h-8 w-8 text-rose-600" />}
            title="4. Terms for Tutors"
          >
            <h3 className="font-semibold text-lg mb-3 text-slate-800">4.1 Tutor Qualifications</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li>You must possess genuine expertise in your listed subjects</li>
              <li>All credentials and certificates must be authentic and verifiable</li>
              <li>You must pass our skill assessment before being listed as "Verified"</li>
              <li>You must complete verification with a valid government ID and a valid degree certificate</li>
              <li>False credentials result in permanent ban and potential legal action</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">4.2 Service Delivery</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li>Arrive on time and deliver the full duration of booked sessions</li>
              <li>Provide high-quality, engaging, and professional instruction</li>
              <li>Maintain a professional demeanor and appropriate language</li>
              <li>Use Tunect’s in-platform class tools powered by LiveKit, including integrated whiteboard and file sharing</li>
              <li>Provide session notes for student review when required by platform policy</li>
              <li>Respond to student messages within 24 hours</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">4.3 Pricing & Payments</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li>Set competitive and fair hourly rates</li>
              <li>Tunect charges a tiered platform fee on tutor earnings: 25% for ₹0–₹399/hr, 22% for ₹400–₹699/hr, and 18% for ₹700+/hr</li>
              <li>Payments processed within 7 business days after session completion</li>
              <li>Minimum payout threshold: ₹500 (accumulates until reached)</li>
              <li>You are responsible for applicable taxes on your earnings</li>
              <li>Payment disputes must be raised within 14 days</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">4.4 Cancellation by Tutors</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li>Not joining a scheduled class within 10 minutes leads to 1 demerit point</li>
              <li>When 3 demerit points are reached, an additional +3% platform fee is applied to your next 10 bookings</li>
              <li>After those 10 bookings, your platform fee reverts to your normal slab</li>
              <li>After 3 demerit points are reached, cancellation rules are: 24+ hours before: no penalty; under 24 hours: ₹200 penalty fee</li>
              <li>Continued misses after penalty may lead to withholding of company-held earnings and permanent account suspension</li>
              <li>Repeated cancellations may result in account suspension</li>
              <li>Emergency cancellations must be reported with valid reason</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">4.5 Prohibited Activities</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600">
              <li><strong>No off-platform transactions:</strong> All bookings and payments must occur through Tunect</li>
              <li><strong>No solicitation:</strong> Do not ask students to book sessions outside the platform</li>
              <li><strong>No sharing contact info:</strong> Do not share personal phone numbers, email addresses, or social handles in chat</li>
              <li><strong>No inappropriate content:</strong> Sexual, violent, discriminatory, or harmful material strictly prohibited</li>
              <li><strong>No proxy teaching:</strong> You must personally conduct all booked sessions</li>
            </ul>
          </TermsSection>

          {/* Section 5 */}
          <TermsSection
            icon={<CreditCard className="h-8 w-8 text-amber-600" />}
            title="5. Payments & Billing"
          >
            <h3 className="font-semibold text-lg mb-3 text-slate-800">5.1 Payment Methods</h3>
            <p className="text-slate-600 mb-4">
              We accept payments via credit/debit cards, UPI, net banking, and digital wallets through 
              our secure payment partner, Razorpay. All transactions are encrypted and PCI-DSS compliant.
            </p>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">5.2 Pricing & Fees</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li>Prices are displayed in Indian Rupees (₹) and include applicable taxes</li>
              <li>Platform may charge convenience fees on certain transactions</li>
              <li>Promotional discounts are subject to terms and conditions</li>
              <li>Prices may change; you'll be notified before charges</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">5.3 Disputes & Chargebacks</h3>
            <p className="text-slate-600">
              If you believe a charge was made in error, contact support before initiating a chargeback. 
              Unjustified chargebacks may result in account suspension. All disputes are handled per our 
              Dispute Resolution Policy.
            </p>
          </TermsSection>

          {/* Section 6 */}
          <TermsSection
            icon={<MessageSquare className="h-8 w-8 text-sky-600" />}
            title="6. Communication & Conduct"
          >
            <h3 className="font-semibold text-lg mb-3 text-slate-800">6.1 Acceptable Use</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li>Be respectful, professional, and courteous in all interactions</li>
              <li>Use appropriate language free from profanity, hate speech, or harassment</li>
              <li>Protect others' privacy and personal information</li>
              <li>Do not spam, advertise, or solicit for other services</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">6.2 Prohibited Conduct</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li>Harassment, bullying, threats, or intimidation</li>
              <li>Discriminatory behavior based on race, religion, gender, age, disability, etc.</li>
              <li>Sexual or inappropriate content involving minors</li>
              <li>Impersonation or misrepresentation</li>
              <li>Sharing malicious links, viruses, or harmful software</li>
              <li>Attempting to hack, disrupt, or compromise platform security</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">6.3 Reporting & Enforcement</h3>
            <p className="text-slate-600">
              Report violations immediately via the in-app reporting feature or contact support. 
              We investigate all reports and may warn, suspend, or permanently ban violators. 
              Severe violations may be reported to authorities.
            </p>
          </TermsSection>

          {/* Section 7 */}
          <TermsSection
            icon={<Shield className="h-8 w-8 text-indigo-600" />}
            title="7. Intellectual Property"
          >
            <h3 className="font-semibold text-lg mb-3 text-slate-800">7.1 Platform Content</h3>
            <p className="text-slate-600 mb-4">
              All content on Tunect (logos, text, graphics, software, interface) is owned by Tunect 
              or licensed to us. You may not copy, modify, distribute, or create derivative works without permission.
            </p>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">7.2 User Content</h3>
            <p className="text-slate-600 mb-4">
              You retain ownership of content you create (messages, reviews, materials). By posting, 
              you grant Tunect a worldwide, non-exclusive license to use, display, and distribute your 
              content for platform operation and improvement.
            </p>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">7.3 Session Materials</h3>
            <p className="text-slate-600">
              Tutors retain rights to their teaching materials. Students may use session materials 
              for personal learning only. Redistribution, resale, or public sharing is prohibited 
              without explicit permission.
            </p>
          </TermsSection>

          {/* Section 8 */}
          <TermsSection
            icon={<AlertTriangle className="h-8 w-8 text-rose-600" />}
            title="8. Disclaimers & Limitations"
          >
            <h3 className="font-semibold text-lg mb-3 text-slate-800">8.1 Platform Availability</h3>
            <p className="text-slate-600 mb-4">
              We strive for 99.9% uptime but do not guarantee uninterrupted service. Maintenance, 
              technical issues, or force majeure events may cause temporary disruptions. We are not 
              liable for losses resulting from service interruptions.
            </p>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">8.2 Educational Outcomes</h3>
            <p className="text-slate-600 mb-4">
              Tunect is a platform connecting students and tutors. We do not guarantee specific 
              learning outcomes, exam results, or skill acquisition. Educational success depends on 
              many factors including student effort, tutor quality, and individual circumstances.
            </p>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">8.3 Third-Party Services</h3>
            <p className="text-slate-600 mb-4">
              We integrate with third-party services (payment gateways, video conferencing, etc.). 
              We are not responsible for their performance, security breaches, or service disruptions.
            </p>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">8.4 Limitation of Liability</h3>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-900">
                <strong>IMPORTANT:</strong> To the maximum extent permitted by law, Tunect shall not be 
                liable for any indirect, incidental, special, consequential, or punitive damages, or any 
                loss of profits or revenues. Our total liability shall not exceed the amount you paid to 
                Tunect in the past 12 months.
              </p>
            </div>
          </TermsSection>

          {/* Section 9 */}
          <TermsSection
            icon={<Scale className="h-8 w-8 text-purple-600" />}
            title="9. Dispute Resolution"
          >
            <p className="text-slate-600 mb-4">
              In the event of a dispute:
            </p>
            <ol className="list-decimal pl-6 space-y-2 text-slate-600">
              <li><strong>Contact Support First:</strong> Reach out to support@tunectnow.com to resolve informally</li>
              <li><strong>Mediation:</strong> If unresolved, both parties agree to good-faith mediation</li>
              <li><strong>Arbitration:</strong> Disputes will be resolved via binding arbitration under Indian Arbitration Act</li>
              <li><strong>Jurisdiction:</strong> Governed by the laws of India; courts in Patna have exclusive jurisdiction</li>
            </ol>
          </TermsSection>

          {/* Section 10 */}
          <TermsSection
            icon={<FileText className="h-8 w-8 text-green-600" />}
            title="10. Termination"
          >
            <h3 className="font-semibold text-lg mb-3 text-slate-800">10.1 By You</h3>
            <p className="text-slate-600 mb-4">
              You may delete your account at any time from account settings. Remaining token balance 
              may be refunded per our refund policy (minus processing fees).
            </p>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">10.2 By Tunect</h3>
            <p className="text-slate-600 mb-4">
              We may suspend or terminate accounts that violate these terms, engage in fraudulent activity, 
              or pose security risks. We'll provide notice when possible, but immediate termination may occur 
              for severe violations.
            </p>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">10.3 Effect of Termination</h3>
            <p className="text-slate-600">
              Upon termination, your access is revoked, but these terms survive for provisions regarding 
              liability, intellectual property, and dispute resolution.
            </p>
          </TermsSection>

          {/* Section 11 */}
          <TermsSection
            icon={<FileText className="h-8 w-8 text-ocean-600" />}
            title="11. Changes to Terms"
          >
            <p className="text-slate-600">
              We may update these terms periodically. Significant changes will be notified via email or 
              platform notice 30 days before taking effect. Continued use after changes constitutes acceptance. 
              If you disagree with changes, you must stop using the platform and may delete your account.
            </p>
          </TermsSection>

          {/* Section 12 */}
          <TermsSection
            icon={<MessageSquare className="h-8 w-8 text-sky-600" />}
            title="12. Contact Information"
          >
            <p className="text-slate-600 mb-4">
              For questions about these Terms of Use, please contact us:
            </p>
            <div className="bg-slate-100 rounded-xl p-6">
              <p className="text-slate-700"><strong>Official:</strong> <a href="mailto:official@tunectnow.com" className="text-ocean-700 hover:underline">official@tunectnow.com</a></p>
              <p className="text-slate-700 mt-2"><strong>Support:</strong> <a href="mailto:support@tunectnow.com" className="text-ocean-700 hover:underline">support@tunectnow.com</a></p>
              <p className="text-slate-700 mt-2"><strong>Business Name:</strong> Tunect Private Limited</p>
              <p className="text-slate-700 mt-2"><strong>CIN:</strong> U85500BR2026PTC081390</p>
            </div>
          </TermsSection>

          {/* Acknowledgment */}
          <div className="rounded-2xl border-2 border-ocean-600 bg-ocean-50 p-8">
            <h3 className="text-xl font-bold text-ocean-900 mb-4">Acknowledgment</h3>
            <p className="text-ocean-800">
              By using Tunect, you acknowledge that you have read, understood, and agree to be bound by 
              these Terms of Use and our Privacy Policy. These terms constitute a legally binding agreement 
              between you and Tunect Private Limited.
            </p>
          </div>

        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-12 bg-gradient-to-r from-ocean-700 to-green-500 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Questions About Our Terms?</h2>
          <p className="text-lg text-white/90 mb-6 max-w-2xl mx-auto">
            Our team is here to help clarify any questions or concerns you may have.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href="/support"
              className="px-6 py-3 bg-white text-ocean-700 rounded-xl font-semibold hover:bg-slate-100 transition"
            >
              Contact Support
            </a>
            <a
              href="/privacy"
              className="px-6 py-3 bg-ocean-900 text-white rounded-xl font-semibold hover:bg-ocean-800 transition"
            >
              Read Privacy Policy
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function TermsSection({ icon, title, children }: Readonly<{ icon: React.ReactNode; title: string; children: React.ReactNode }>) {
  return (
    <div className="rounded-2xl border bg-white p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        {icon}
        <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}
