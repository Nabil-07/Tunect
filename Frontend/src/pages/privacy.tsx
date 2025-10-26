// src/pages/privacy.tsx
export default function Privacy() {
  return (
    <div className="container mx-auto px-4 py-12 prose prose-slate">
      <h1>Privacy Policy</h1>
      <p>We respect your privacy. This page explains what information we collect and how we use it.</p>
      <h2>Information we collect</h2>
      <ul>
        <li>Account details (name, email)</li>
        <li>Booking and payment information</li>
        <li>Diagnostic logs to improve reliability</li>
      </ul>
      <h2>How we use your information</h2>
      <ul>
        <li>To provide and improve our services</li>
        <li>To support payments and prevent fraud</li>
        <li>To communicate important updates</li>
      </ul>
      <p>Contact us at support@tunect.example for any questions.</p>
    </div>
  );
}
