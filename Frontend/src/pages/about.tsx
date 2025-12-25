// src/pages/about.tsx
import { GraduationCap, Users, Globe, Award, Shield, Heart, TrendingUp, Sparkles } from 'lucide-react';

export default function About() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-ocean-700 to-green-500 text-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl font-bold mb-6">About Tunect</h1>
            <p className="text-xl text-white/90 leading-relaxed">
              Connecting passionate learners with exceptional tutors across the globe. 
              We're on a mission to make quality education accessible, personalized, and borderless.
            </p>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-16 container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12">
            <div className="rounded-3xl border bg-white p-8 shadow-lg hover:shadow-xl transition">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-full bg-ocean-100">
                  <Heart className="h-8 w-8 text-ocean-700" />
                </div>
                <h2 className="text-3xl font-bold text-slate-800">Our Mission</h2>
              </div>
              <p className="text-lg text-slate-600 leading-relaxed">
                To revolutionize online education by creating a trusted platform where students can 
                discover world-class tutors, and educators can share their knowledge with learners 
                who need it most. We believe everyone deserves access to personalized, high-quality 
                learning experiences.
              </p>
            </div>

            <div className="rounded-3xl border bg-white p-8 shadow-lg hover:shadow-xl transition">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-full bg-green-100">
                  <Sparkles className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-3xl font-bold text-slate-800">Our Vision</h2>
              </div>
              <p className="text-lg text-slate-600 leading-relaxed">
                A world where geographical boundaries don't limit educational opportunities. 
                Where every student can find the perfect tutor for their unique learning style, 
                and every talented educator can build a thriving online teaching career.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What Makes Us Different */}
      <section className="py-16 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-slate-800 mb-4">What Makes Us Different</h2>
              <p className="text-xl text-slate-600">Why thousands of students and tutors choose Tunect</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <FeatureCard
                icon={<Shield className="h-10 w-10 text-ocean-600" />}
                title="Verified Tutors"
                description="Every tutor undergoes rigorous KYC verification and skill testing. We ensure you connect with qualified, trusted educators."
              />
              <FeatureCard
                icon={<Globe className="h-10 w-10 text-green-600" />}
                title="Global Reach"
                description="Learn from tutors across countries and time zones. Access expertise in any subject, no matter where you are."
              />
              <FeatureCard
                icon={<Award className="h-10 w-10 text-amber-600" />}
                title="Quality Assurance"
                description="Transparent reviews, ratings, and detailed tutor profiles help you make informed decisions about your education."
              />
              <FeatureCard
                icon={<Users className="h-10 w-10 text-purple-600" />}
                title="Personalized Learning"
                description="One-on-one sessions tailored to your pace and learning style. No crowded classrooms, just focused attention."
              />
              <FeatureCard
                icon={<TrendingUp className="h-10 w-10 text-rose-600" />}
                title="Track Progress"
                description="Monitor your learning journey with detailed analytics, certificates, and progress tracking across subjects."
              />
              <FeatureCard
                icon={<GraduationCap className="h-10 w-10 text-sky-600" />}
                title="Flexible Scheduling"
                description="Book sessions that fit your schedule. Cancel or reschedule with ease. Learning on your terms."
              />
            </div>
          </div>
        </div>
      </section>

      {/* By the Numbers */}
      <section className="py-16 container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-slate-800 mb-4">Tunect by the Numbers</h2>
            <p className="text-xl text-slate-600">Growing stronger every day</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            <StatCard number="10,000+" label="Active Students" />
            <StatCard number="2,500+" label="Expert Tutors" />
            <StatCard number="50,000+" label="Sessions Completed" />
            <StatCard number="98%" label="Satisfaction Rate" />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-gradient-to-r from-ocean-50 to-green-50">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-slate-800 mb-4">How Tunect Works</h2>
              <p className="text-xl text-slate-600">Your learning journey in 4 simple steps</p>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
              <StepCard
                step="1"
                title="Browse Tutors"
                description="Search by subject, rating, price, or availability. Filter to find your perfect match."
              />
              <StepCard
                step="2"
                title="Book a Session"
                description="Try a free demo session or book directly. Choose a time that works for you."
              />
              <StepCard
                step="3"
                title="Learn & Grow"
                description="Join live 1:1 sessions with video, whiteboard, and file sharing. Learn at your pace."
              />
              <StepCard
                step="4"
                title="Track Progress"
                description="Review session notes, earn certificates, and watch your skills grow over time."
              />
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-slate-800 mb-4">Our Core Values</h2>
          </div>

          <div className="space-y-6">
            <ValueCard
              title="🎯 Student-Centric"
              description="Every decision we make puts students first. Your success is our success."
            />
            <ValueCard
              title="✨ Excellence"
              description="We maintain the highest standards in tutor quality, platform security, and user experience."
            />
            <ValueCard
              title="🤝 Trust & Transparency"
              description="Clear pricing, honest reviews, and open communication. No hidden fees or surprises."
            />
            <ValueCard
              title="🌍 Inclusivity"
              description="Education is a right, not a privilege. We work to make learning accessible to all."
            />
            <ValueCard
              title="🚀 Innovation"
              description="Continuously evolving with AI-powered features, smart matching, and cutting-edge tools."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-ocean-700 to-green-500 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Start Your Learning Journey?</h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Join thousands of students discovering the joy of personalized learning with expert tutors.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href="/find-tutors"
              className="px-8 py-4 bg-white text-ocean-700 rounded-xl font-semibold text-lg hover:bg-slate-100 transition shadow-lg"
            >
              Find a Tutor
            </a>
            <a
              href="/become-tutor"
              className="px-8 py-4 bg-ocean-900 text-white rounded-xl font-semibold text-lg hover:bg-ocean-800 transition shadow-lg"
            >
              Become a Tutor
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-bold text-slate-800 mb-3">{title}</h3>
      <p className="text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}

function StatCard({ number, label }: { number: string; label: string }) {
  return (
    <div className="rounded-2xl border bg-white p-8 shadow-sm hover:shadow-lg transition text-center">
      <div className="text-4xl font-bold text-ocean-700 mb-2">{number}</div>
      <div className="text-slate-600 font-medium">{label}</div>
    </div>
  );
}

function StepCard({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition relative">
      <div className="absolute -top-4 left-6 w-10 h-10 rounded-full bg-ocean-600 text-white flex items-center justify-center font-bold text-lg">
        {step}
      </div>
      <h3 className="text-lg font-bold text-slate-800 mb-2 mt-4">{title}</h3>
      <p className="text-slate-600 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function ValueCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm hover:shadow-md transition">
      <h3 className="text-xl font-bold text-slate-800 mb-2">{title}</h3>
      <p className="text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}
