# 🎓 Tunect - Online Tutoring Platform

A modern, full-stack online tutoring platform connecting verified tutors with students worldwide. Built with **TypeScript**, **React**, **NestJS**, and **PostgreSQL**.

**Live Demo:** [https://tunectnow.com](https://tunectnow.com)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Architecture](#architecture)
- [Core Features Documentation](#core-features-documentation)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Development](#development)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## 📱 Overview

**Tunect** is a comprehensive online tutoring platform designed to:

- **Connect Students with Verified Tutors** - Browse, filter, and book tutors based on expertise, availability, and ratings
- **Manage Live Sessions** - Real-time video/audio sessions with whiteboard collaboration powered by **LiveKit**
- **Track Learning Progress** - Assignment management, performance analytics, and certification
- **Secure Payments** - Multiple payment gateways (Stripe, Razorpay, Google Pay) with wallet management
- **Communications Hub** - In-app messaging, notifications, and email campaigns
- **Admin Dashboard** - Comprehensive management tools for tutors, students, disputes, and analytics

---

## ✨ Key Features

### For Students
✅ **Tutor Discovery** - Search and filter tutors by subject, experience, reviews, and availability  
✅ **Booking System** - Schedule 1-on-1 or group sessions with flexible rescheduling  
✅ **Live Classes** - Integrated video conferencing with whiteboard, screen sharing, and recording  
✅ **Assignments** - Upload, submit, and receive feedback on assignments  
✅ **Progress Tracking** - View learning goals, milestones, and performance analytics  
✅ **Wallet & Tokens** - Token-based payment system with refund management  
✅ **Certificates** - Digital certificates upon course completion  
✅ **Reviews & Ratings** - Rate tutors and provide feedback  

### For Tutors
✅ **Availability Management** - Set flexible time slots and recurring schedules  
✅ **Session Management** - View bookings, attendance tracking, and earnings  
✅ **Assignment Creation** - Create and grade student assignments with feedback  
✅ **Earnings Dashboard** - Track income, wallet balance, and transaction history  
✅ **KYC Verification** - Document upload for compliance  
✅ **Group Sessions** - Host classes for multiple students simultaneously  
✅ **Analytics** - Student performance insights and teaching metrics  

### For Admin
✅ **User Management** - Manage tutors, students, and staff  
✅ **Dispute Resolution** - Handle booking disputes and refunds  
✅ **Financial Reporting** - Export transaction data and financial statements  
✅ **Email Campaigns** - Send targeted communications to users  
✅ **KYC Verification** - Approve/reject tutor documents  
✅ **Content Management** - Blog posts with SEO optimization  
✅ **System Health** - Monitoring and analytics dashboard  

---

## 🛠️ Tech Stack

### Frontend (94.9% TypeScript)
- **React 19** - Modern UI library with concurrent rendering
- **TypeScript 5.8** - Type-safe JavaScript development
- **Vite 7** - Lightning-fast build tool and dev server
- **Tailwind CSS 3** - Utility-first CSS framework
- **React Router 7** - Client-side routing and navigation
- **TipTap 3** - Rich text editor with collaborative extensions
- **Excalidraw** - Collaborative whiteboard and diagram tool
- **LiveKit Client 2** - WebRTC video/audio conferencing
- **Recharts 3** - React charting library for analytics
- **Socket.IO Client** - Real-time bidirectional communication
- **Framer Motion** - Declarative animation library
- **Axios** - Promise-based HTTP client
- **React Helmet** - SEO management for meta tags

### Backend (NestJS Microservices)
- **NestJS 10** - Progressive Node.js framework with dependency injection
- **TypeScript 5.9** - Enterprise-grade type safety
- **Express.js** - Underlying HTTP framework
- **Prisma 5** - Next-gen ORM with migrations
- **PostgreSQL** - Relational database with advanced features
- **Socket.IO** - WebSocket server for real-time features
- **Passport.js** - Authentication middleware (JWT, OAuth, Local)
- **Stripe SDK** - Payment processing integration
- **Razorpay SDK** - Indian payment gateway
- **AWS S3 SDK** - Cloud file storage and serving
- **LiveKit Server SDK** - Video room management and webhooks
- **OpenAI API** - AI-powered features
- **Nodemailer** - Email service for notifications
- **Swagger/OpenAPI** - Interactive API documentation
- **Sentry** - Error tracking and performance monitoring
- **Jest** - Unit testing framework

### Database Layer
- **PostgreSQL 12+** - Relational database
- **Prisma Client** - Database access and query building
- **Prisma Migrations** - Schema versioning and rollback

### DevOps & Infrastructure
- **Docker** - Container orchestration
- **Vercel** - Frontend hosting (React SPA)
- **GitHub Actions** - CI/CD pipelines
- **Environment Management** - dotenv for config management

---

## 📁 Project Structure

```
Tunect/
├── Frontend/                    # React + TypeScript Frontend
│   ├── src/
│   │   ├── components/         # Reusable React components
│   │   ├── pages/              # Route-level page components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── services/           # API service layer
│   │   ├── store/              # State management
│   │   ├── types/              # TypeScript type definitions
│   │   ├── utils/              # Utility functions
│   │   ├── styles/             # Global styles
│   │   ├── main.tsx            # React entry point
│   │   └── App.tsx             # Root component
│   ├── public/                 # Static assets
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── eslint.config.js
│
├── backend/                    # NestJS Backend API
│   ├── src/
│   │   ├── main.ts            # Application bootstrap
│   │   ├── app.module.ts       # Root module
│   │   ├── auth/               # Authentication logic
│   │   │   ├── strategies/     # Passport strategies (JWT, OAuth, Local)
│   │   │   ├── guards/         # Auth guards
│   │   │   └── jwt.service.ts  # JWT token handling
│   │   ├── modules/            # Feature modules (organized by domain)
│   │   │   ├── users/          # User management
│   │   │   ├── tutors/         # Tutor profiles
│   │   │   ├── students/       # Student profiles
│   │   │   ├── bookings/       # Session bookings
│   │   │   ├── payments/       # Payment processing
│   │   │   ├── messaging/      # Chat & notifications
│   │   │   ├── sessions/       # Live session management
│   │   │   ├── assignments/    # Assignment system
│   │   │   ├── analytics/      # Data analytics
│   │   │   ├── kyc/            # KYC verification
│   │   │   ├── disputes/       # Dispute resolution
│   │   │   └── admin/          # Admin operations
│   │   ├── common/             # Shared utilities
│   │   │   ├── decorators/     # Custom decorators
│   │   │   ├── filters/        # Exception filters
│   │   │   ├── interceptors/   # Response interceptors
│   │   │   └── guards/         # Shared guards
│   │   ├── prisma/             # Database service
│   │   └── config/             # Configuration
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema (20+ models)
│   │   └── migrations/         # Migration history
│   ├── scripts/                # Utility scripts
│   ├── test/                   # Jest test files
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   └── .env.example
│
└── README.md
```

---

## 🚀 Setup & Installation

### Prerequisites
- **Node.js** 18+ (LTS recommended)
- **npm** 9+ or **yarn** 3+
- **PostgreSQL** 12+
- **Git**

### Quick Start

#### 1. Clone the Repository
```bash
git clone https://github.com/Nabil-07/Tunect.git
cd Tunect
```

#### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Configure environment variables
# Edit .env with your settings:
# DATABASE_URL=postgresql://user:password@localhost:5432/tunect
# JWT_SECRET=your_jwt_secret_key_here
# NODE_ENV=development
# STRIPE_SECRET_KEY=sk_test_...
# RAZORPAY_KEY_ID=...
# RAZORPAY_KEY_SECRET=...
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
# LIVEKIT_API_KEY=...
# LIVEKIT_API_SECRET=...

# Generate Prisma Client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# (Optional) Seed database
npm run seed

# Start development server
npm run start:dev
```

**Backend runs on:** `http://localhost:3000`  
**Swagger Docs:** `http://localhost:3000/docs`

#### 3. Frontend Setup

```bash
cd ../Frontend

# Install dependencies
npm install

# Create environment file
cat > .env << EOF
VITE_API_URL=http://localhost:3000
VITE_LIVEKIT_URL=wss://your-livekit-instance.com
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_STRIPE_PUBLIC_KEY=pk_test_...
EOF

# Start development server
npm run dev
```

**Frontend runs on:** `http://localhost:5173`

#### 4. Verify Installation
- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- API Docs: http://localhost:3000/docs

---

## 🏗️ Architecture

### System Design
```
┌──────────────────────────────┐
│  Browser / Mobile Web App    │
│  (React SPA with Vite)       │
└──────────────┬───────────────┘
               │ HTTP + WebSocket
        ┌──────▼──────────────────┐
        │  Tunect Backend         │
        │  (NestJS on Express)    │
        ├──────────────────────────┤
        │  REST API + Socket.IO    │
        │  • Authentication        │
        │  • Rate Limiting         │
        │  • CORS & Security       │
        │  • Request Validation    │
        └──────────────┬───────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
    ┌───▼────┐    ┌────▼───┐    ┌────▼────┐
    │PostgreSQL   │AWS S3  │    │LiveKit   │
    │Database     │Files   │    │Video API │
    └────────┘    └────────┘    └──────────┘

    External Services:
    ├─ Stripe (Payments)
    ├─ Razorpay (Payments)
    ├─ Google OAuth (Auth)
    ├─ OpenAI (AI Features)
    └─ Nodemailer (Email)
```

### Authentication Flow
1. User registers/logs in
2. JWT token issued by backend
3. Token stored in localStorage
4. Subsequent requests include token in Authorization header
5. Backend validates JWT using Passport strategy
6. Optional OAuth integration (Google)

### Real-Time Communication
- **Socket.IO** for WebSocket connections
- Namespaces for different features (chat, notifications, sessions)
- Event-based architecture for real-time updates
- Automatic reconnection handling

### Payment Flow
1. Frontend initiates payment request
2. Backend creates payment order with gateway (Stripe/Razorpay)
3. Frontend displays payment UI
4. User completes payment
5. Webhook listener confirms transaction
6. Booking confirmed or tokens credited

---

## 📊 Core Features Documentation

### 1. User Authentication
- **Registration**: Email verification, phone verification
- **Login**: Username/email + password, or OAuth (Google)
- **JWT Tokens**: Access & refresh token management
- **Session Management**: Multiple device support

### 2. Tutor Discovery & Booking
- **Search Filters**: Subject, experience, ratings, price, availability
- **Tutor Profiles**: Credentials, certifications, teaching style
- **Availability Slots**: Recurring or one-time bookings
- **Pricing**: Fixed hourly rates with dynamic pricing
- **Reviews & Ratings**: 5-star system with comments

### 3. Live Class Sessions
- **Video Conference**: Powered by LiveKit WebRTC
- **Whiteboard**: Excalidraw for collaborative drawing
- **Screen Sharing**: Share screen during sessions
- **Chat**: In-session messaging
- **Recording**: Automatic session recording (optional)
- **Waiting Room**: Pre-session meet coordination

### 4. Assignment Management
- **Creation**: Tutors create assignments with due dates
- **Submission**: Students upload solutions
- **Grading**: Tutors grade with detailed feedback
- **File Support**: PDF, images, documents
- **Deadline Tracking**: Automated reminders

### 5. Payment System
- **Multiple Gateways**: Stripe, Razorpay, Google Pay
- **Token System**: Credits for session bookings
- **Wallet**: Store balance for quick bookings
- **Refund Processing**: Dispute resolution with refunds
- **Financial Reports**: Export transaction history

### 6. Communication Hub
- **In-App Messaging**: Chat between tutors & students
- **Notifications**: Real-time + email notifications
- **Email Campaigns**: Targeted user communications
- **Admin Broadcasts**: Announcements to tutors/students

### 7. Analytics & Reporting
- **Student Analytics**: Progress tracking, performance metrics
- **Tutor Analytics**: Earnings, session hours, ratings
- **Admin Reports**: User growth, revenue, disputes
- **Data Export**: Excel export for financial audits

---

## 🗄️ Database Schema

### Key Models

**Users** - Base user entity with role-based access
- Roles: ADMIN, TUTOR, STUDENT, SUPPORT

**Tutors** - Extended tutor profiles
- Hourly rates, bio, subjects, certifications
- Availability slots, KYC documents

**Students** - Extended student profiles
- Learning goals, progress tracking
- Favorite tutors, certificates

**Bookings** - Session records
- Status: PENDING, CONFIRMED, CANCELLED, COMPLETED
- Tracks pricing, duration, attendees

**Payments** - Payment transactions
- Multiple gateways tracked
- Refund history

**Messages** - Chat messages between users
- Attachments support
- Read receipts

**Assignments** - Learning materials
- File uploads, due dates
- Student submissions & grades

**Disputes** - Booking disputes
- Status tracking, resolution notes

See `backend/prisma/schema.prisma` for complete schema definition (20+ models).

---

## 🔌 API Endpoints

### Authentication
```
POST   /auth/register          - User registration
POST   /auth/login             - User login
POST   /auth/refresh           - Refresh JWT token
POST   /auth/logout            - Logout
GET    /auth/google            - Google OAuth
GET    /auth/google/callback   - OAuth callback
```

### Users
```
GET    /users/me               - Get current user
PATCH  /users/:id              - Update user profile
GET    /users/:id              - Get user details
```

### Tutors
```
GET    /tutors                 - List tutors with filters
GET    /tutors/:id             - Get tutor details
POST   /tutors/availability    - Create availability slot
GET    /tutors/:id/availability - Get tutor availability
PATCH  /tutors/:id             - Update tutor profile
```

### Bookings
```
POST   /bookings               - Create booking
GET    /bookings               - List user bookings
GET    /bookings/:id           - Get booking details
PATCH  /bookings/:id           - Update booking
DELETE /bookings/:id           - Cancel booking
```

### Payments
```
POST   /payments/checkout      - Create payment session
POST   /payments/webhook       - Payment gateway webhook
GET    /payments/history       - Payment history
```

### Messaging
```
GET    /conversations          - List conversations
POST   /conversations          - Start conversation
GET    /conversations/:id/messages - Get chat messages
POST   /conversations/:id/messages - Send message
```

### Sessions (WebSocket)
```
/sessions                      - Join live session
/chat                          - Session chat
/whiteboard                    - Collaborative whiteboard
/notifications                 - Real-time notifications
```

**Full API documentation available at**: `/docs` (Swagger UI)

---

## 👨‍💻 Development

### Code Standards
- **TypeScript**: Strict mode enabled, full type coverage
- **Formatting**: Prettier for consistent code style
- **Linting**: ESLint for code quality
- **Naming**: camelCase for variables, PascalCase for classes/types

### Running Tests
```bash
# Backend unit tests
cd backend
npm run test

# Frontend tests (if configured)
cd Frontend
npm run test
```

### Building for Production
```bash
# Backend build
cd backend
npm run build

# Frontend build
cd Frontend
npm run build:production
```

### Environment-Specific Configurations
```bash
# Development
npm run start:dev

# Test environment
npm run start:test

# Production (local)
npm run start:prodlocal
```

---

## 🚢 Deployment

### Frontend Deployment (Vercel)
```bash
# Automatic deployment on push to main
npm run build:production
```

**Deployed at**: [https://tunectnow.com](https://tunectnow.com)

### Backend Deployment
```bash
# Docker containerization
docker build -t tunect-backend .
docker run -p 3000:3000 tunect-backend

# Environment variables must be set before startup
```

### Database Deployment
```bash
# Production migration
npm run prisma:deploy:prod

# Database backup
npm run backup:prod

# Production seeding
npm run prisma:seed:prod
```

---

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your changes (`git commit -m 'Add some AmazingFeature'`)
4. **Push** to the branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

### Pull Request Process
- Include a clear description of changes
- Update documentation as needed
- Ensure tests pass
- Request review from maintainers
- Address feedback and re-request review

---

## 📞 Support & Contact

For issues, questions, or feature requests:
- **GitHub Issues**: [Create an issue](https://github.com/Nabil-07/Tunect/issues)
- **Email**: Support available through platform
- **Documentation**: See inline code comments and API docs

---

## 📄 License

This project is **private** and proprietary.  
**© 2025 Tunect. All rights reserved.**

---

## 🎯 Future Roadmap

- [ ] Mobile app (React Native)
- [ ] AI-powered tutor recommendations
- [ ] Advanced scheduling with calendar sync
- [ ] Batch class management
- [ ] Student progress AI insights
- [ ] Multi-language support
- [ ] Advanced analytics dashboard
- [ ] Integration with LMS platforms

---

**Built with ❤️ for online learning**
