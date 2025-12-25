// src/pages/privacy.tsx
import { Shield, Lock, Eye, Users, FileText, Mail, AlertCircle } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <section className="bg-gradient-to-r from-ocean-700 to-green-500 text-white py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex justify-center mb-4">
              <Shield className="h-16 w-16" />
            </div>
            <h1 className="text-5xl font-bold mb-4">Privacy Policy</h1>
            <p className="text-xl text-white/90">Last Updated: December 24, 2025</p>
            <p className="text-lg text-white/80 mt-4">
              Your privacy is important to us. This policy explains how Tunect collects, uses, 
              protects, and shares your personal information.
            </p>
          </div>
        </div>
      </section>

      {/* Quick Summary */}
      <section className="py-12 container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl border bg-white p-8 shadow-lg">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Eye className="h-6 w-6 text-ocean-600" />
              Privacy at a Glance
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <QuickPoint
                icon={<Lock className="h-5 w-5 text-green-600" />}
                text="Your data is encrypted and securely stored"
              />
              <QuickPoint
                icon={<Users className="h-5 w-5 text-ocean-600" />}
                text="We never sell your personal information"
              />
              <QuickPoint
                icon={<Shield className="h-5 w-5 text-purple-600" />}
                text="You control your data and can delete it anytime"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="pb-16 container mx-auto px-4">
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Section 1 */}
          <PolicySection
            icon={<FileText className="h-8 w-8 text-ocean-600" />}
            title="1. Information We Collect"
          >
            <h3 className="font-semibold text-lg mb-3 text-slate-800">1.1 Information You Provide</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li><strong>Account Information:</strong> Name, email address, phone number, password, profile picture</li>
              <li><strong>Profile Details:</strong> Educational background, subjects of interest, teaching expertise</li>
              <li><strong>Payment Information:</strong> Payment method details (processed securely via third-party providers)</li>
              <li><strong>KYC Documents:</strong> For tutors - ID proof, educational certificates, skill test results</li>
              <li><strong>Communications:</strong> Messages, reviews, feedback, support tickets</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">1.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li><strong>Usage Data:</strong> Pages visited, features used, time spent on platform</li>
              <li><strong>Device Information:</strong> Browser type, operating system, IP address, device identifiers</li>
              <li><strong>Cookies & Tracking:</strong> We use cookies to improve your experience and analyze usage patterns</li>
              <li><strong>Session Data:</strong> Session duration, attendance, completion status</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">1.3 Information from Third Parties</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600">
              <li>Social media login data (if you choose to sign in via Google, Facebook, etc.)</li>
              <li>Payment processing information from Razorpay and other payment gateways</li>
              <li>Video conferencing data from integrated services (Google Meet, etc.)</li>
            </ul>
          </PolicySection>

          {/* Section 2 */}
          <PolicySection
            icon={<Users className="h-8 w-8 text-green-600" />}
            title="2. How We Use Your Information"
          >
            <p className="text-slate-600 mb-4">We use your information to provide, maintain, and improve our services:</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-600">
              <li><strong>Service Delivery:</strong> Create and manage your account, facilitate bookings, process payments</li>
              <li><strong>Communication:</strong> Send booking confirmations, reminders, updates, and promotional content (you can opt out)</li>
              <li><strong>Matching:</strong> Recommend tutors to students based on preferences, history, and learning goals</li>
              <li><strong>Quality Assurance:</strong> Verify tutor qualifications, monitor session quality, prevent fraud</li>
              <li><strong>Platform Improvement:</strong> Analyze usage patterns, fix bugs, develop new features</li>
              <li><strong>Legal Compliance:</strong> Meet regulatory requirements, resolve disputes, enforce our terms</li>
              <li><strong>Safety & Security:</strong> Protect against fraud, abuse, and security threats</li>
            </ul>
          </PolicySection>

          {/* Section 3 */}
          <PolicySection
            icon={<Lock className="h-8 w-8 text-purple-600" />}
            title="3. How We Share Your Information"
          >
            <p className="text-slate-600 mb-4">We respect your privacy and only share information when necessary:</p>
            
            <h3 className="font-semibold text-lg mb-3 text-slate-800">3.1 With Other Users</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li>Students can see tutor profiles (name, photo, subjects, ratings, reviews)</li>
              <li>Tutors can see basic student information when bookings are made</li>
              <li>Messages and session content shared between matched users</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">3.2 With Service Providers</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li>Payment processors (Razorpay) for transaction handling</li>
              <li>Cloud hosting providers (AWS, Google Cloud) for data storage</li>
              <li>Email and SMS services for notifications</li>
              <li>Video conferencing platforms for live sessions</li>
              <li>Analytics tools to understand platform usage</li>
            </ul>

            <h3 className="font-semibold text-lg mb-3 text-slate-800">3.3 For Legal Reasons</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 mb-4">
              <li>To comply with legal obligations, court orders, or government requests</li>
              <li>To protect our rights, property, and safety, or that of our users</li>
              <li>To investigate fraud, security issues, or terms violations</li>
            </ul>

            <div className="bg-ocean-50 border border-ocean-200 rounded-xl p-4 mt-4">
              <p className="text-sm text-ocean-900 font-medium">
                <strong>We will NEVER:</strong> Sell your personal information to third parties, 
                share your data for advertising without consent, or use your session content 
                for purposes other than providing the service.
              </p>
            </div>
          </PolicySection>

          {/* Section 4 */}
          <PolicySection
            icon={<Shield className="h-8 w-8 text-rose-600" />}
            title="4. Data Security"
          >
            <p className="text-slate-600 mb-4">
              We implement industry-standard security measures to protect your information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-600">
              <li><strong>Encryption:</strong> All data is encrypted in transit (HTTPS/TLS) and at rest</li>
              <li><strong>Access Controls:</strong> Strict employee access policies with role-based permissions</li>
              <li><strong>Secure Authentication:</strong> Password hashing, OTP verification, session management</li>
              <li><strong>Regular Audits:</strong> Security assessments, penetration testing, compliance reviews</li>
              <li><strong>Data Backups:</strong> Regular backups with disaster recovery procedures</li>
              <li><strong>Payment Security:</strong> PCI-DSS compliant payment processing (we don't store card details)</li>
            </ul>
            <p className="text-slate-600 mt-4 text-sm italic">
              Note: While we take extensive measures to secure your data, no internet transmission 
              is 100% secure. Please use strong passwords and enable two-factor authentication.
            </p>
          </PolicySection>

          {/* Section 5 */}
          <PolicySection
            icon={<Eye className="h-8 w-8 text-amber-600" />}
            title="5. Your Rights & Choices"
          >
            <p className="text-slate-600 mb-4">You have control over your personal information:</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-600">
              <li><strong>Access:</strong> View and download your personal data from your account settings</li>
              <li><strong>Update:</strong> Correct or update your profile information at any time</li>
              <li><strong>Delete:</strong> Request account deletion (we'll retain some data for legal compliance)</li>
              <li><strong>Opt-Out:</strong> Unsubscribe from marketing emails via the link in any email</li>
              <li><strong>Cookie Control:</strong> Manage cookie preferences through your browser settings</li>
              <li><strong>Data Portability:</strong> Export your data in a machine-readable format</li>
              <li><strong>Restrict Processing:</strong> Limit how we use your data in certain circumstances</li>
            </ul>
            <p className="text-slate-600 mt-4">
              To exercise these rights, contact us at <a href="mailto:privacy@tunect.com" className="text-ocean-700 hover:underline font-medium">privacy@tunect.com</a>
            </p>
          </PolicySection>

          {/* Section 6 */}
          <PolicySection
            icon={<AlertCircle className="h-8 w-8 text-sky-600" />}
            title="6. Data Retention"
          >
            <p className="text-slate-600 mb-4">We retain your information for as long as necessary:</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-600">
              <li><strong>Active Accounts:</strong> Data retained while your account is active</li>
              <li><strong>After Deletion:</strong> Most data deleted within 30 days; some retained for legal compliance (e.g., transaction records for 7 years)</li>
              <li><strong>Backups:</strong> May persist in backups for up to 90 days after deletion</li>
              <li><strong>Legal Obligations:</strong> Some data retained longer when required by law (tax, fraud prevention)</li>
            </ul>
          </PolicySection>

          {/* Section 7 */}
          <PolicySection
            icon={<Users className="h-8 w-8 text-indigo-600" />}
            title="7. Children's Privacy"
          >
            <p className="text-slate-600">
              Tunect is intended for users 13 years and older. For users under 18, we require 
              parental consent and supervision. We do not knowingly collect information from 
              children under 13. If you believe a child under 13 has provided us information, 
              please contact us immediately at <a href="mailto:privacy@tunect.com" className="text-ocean-700 hover:underline font-medium">privacy@tunect.com</a>.
            </p>
          </PolicySection>

          {/* Section 8 */}
          <PolicySection
            icon={<Mail className="h-8 w-8 text-green-600" />}
            title="8. International Data Transfers"
          >
            <p className="text-slate-600">
              Your information may be transferred to and processed in countries other than your own. 
              We ensure appropriate safeguards are in place to protect your data in compliance with 
              applicable laws (GDPR, CCPA, etc.). By using Tunect, you consent to such transfers.
            </p>
          </PolicySection>

          {/* Section 9 */}
          <PolicySection
            icon={<FileText className="h-8 w-8 text-purple-600" />}
            title="9. Changes to This Policy"
          >
            <p className="text-slate-600">
              We may update this Privacy Policy from time to time. We'll notify you of significant 
              changes via email or a prominent notice on our platform. Your continued use after 
              changes constitutes acceptance of the updated policy. Previous versions are available 
              upon request.
            </p>
          </PolicySection>

          {/* Section 10 */}
          <PolicySection
            icon={<Mail className="h-8 w-8 text-rose-600" />}
            title="10. Contact Us"
          >
            <p className="text-slate-600 mb-4">
              If you have questions, concerns, or requests regarding this Privacy Policy or your data:
            </p>
            <div className="bg-slate-100 rounded-xl p-6">
              <p className="text-slate-700"><strong>Email:</strong> <a href="mailto:privacy@tunect.com" className="text-ocean-700 hover:underline">privacy@tunect.com</a></p>
              <p className="text-slate-700 mt-2"><strong>Support:</strong> <a href="mailto:support@tunect.com" className="text-ocean-700 hover:underline">support@tunect.com</a></p>
              <p className="text-slate-700 mt-2"><strong>Address:</strong> Tunect Technologies Pvt. Ltd., [Your Business Address]</p>
            </div>
          </PolicySection>

        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-12 bg-gradient-to-r from-ocean-700 to-green-500 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Your Privacy Matters</h2>
          <p className="text-lg text-white/90 mb-6 max-w-2xl mx-auto">
            We're committed to protecting your personal information and being transparent about our practices.
          </p>
          <a
            href="/support"
            className="inline-block px-6 py-3 bg-white text-ocean-700 rounded-xl font-semibold hover:bg-slate-100 transition"
          >
            Contact Support
          </a>
        </div>
      </section>
    </div>
  );
}

function QuickPoint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1">{icon}</div>
      <p className="text-sm text-slate-700">{text}</p>
    </div>
  );
}

function PolicySection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        {icon}
        <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
      </div>
      <div className="prose prose-slate max-w-none">
        {children}
      </div>
    </div>
  );
}
