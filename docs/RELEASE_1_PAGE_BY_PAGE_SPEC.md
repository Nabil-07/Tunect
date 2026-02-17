# Tunect — Release 1 (Page-by-Page BA Specification)

## Audience
This document is written for non-technical stakeholders (Business, Operations, Leadership, Support).

## Purpose of Release 1
Tunect Release 1 delivers a trusted, role-based tutoring marketplace with:
- Tutor discovery (search, filters, public tutor profiles)
- Booking (free demo + paid sessions via token packs)
- In-platform live classroom (video + whiteboard) when applicable
- Messaging and notifications
- Student learning management (bookings, sessions, notes, goals, progress, certificates)
- Tutor operations (availability, KYC, sessions, earnings, content library)
- Admin operations (KYC verification, refunds, policy configuration, audit log, finance, reports)

## Roles in Release 1
- **Visitor (Public)**: can browse and learn about Tunect, search tutors, read blogs.
- **Student**: can book sessions, buy tokens, join classes, message tutors, track learning.
- **Tutor**: can complete KYC, manage availability, teach sessions, view earnings, share materials.
- **Admin**: can manage platform operations, users, finances, policy, compliance, and audit.

## Global / Cross-cutting UX
- **Authentication**: users can sign up/sign in using email/password or Google.
- **Role-based experience**: after sign-in, the user lands in Student, Tutor, or Admin areas.
- **Messages**: a Messages entry is available for logged-in users; conversations open in a chat view.
- **Notifications**: a bell shows notifications; notifications can be marked read and deleted.
- **Account menu** (logged in): includes Dashboard, Edit details, Manage account, Password & security, Logout.
- **Pre-production gate (if enabled)**: in certain environments, only internal users can access the app.

---

# A) Public (Visitor) Pages

## 1) Home ("/")
**Purpose**: Introduce Tunect and drive tutor discovery.
- **What the page contains**: Hero area with a search input; highlight sections such as verified tutors, subjects, stats, testimonials.
- **Primary action**: Search redirects to Find Tutors with the query applied.
- **Key user actions**: Enter a subject/topic/keyword; click search; explore highlighted sections.
- **System behavior**: If the user is already logged in, the site still allows browsing but routes role-based actions (booking, dashboard) into the correct area.
- **Outcome**: The user lands on Find Tutors with the search intent carried forward.

## 2) Find Tutors ("/find-tutors")
**Purpose**: Enable students/visitors to discover tutors matching their needs.
- **What the page contains**: Tutor listing with filtering (e.g., subject/class/language/rating/price), sorting, pagination.
- **Primary actions**: Open a tutor profile; begin booking or demo flow (depending on tutor and student status).
- **Key user actions**: Refine search using filters; sort results; open profiles to compare options.
- **System behavior**: Handles empty results (no tutors match) and loading states while results are fetched.
- **Outcome**: The user chooses a tutor and proceeds to profile → booking/demo/payment journey.

## 3) Tutor Public Profile ("/tutors/:slug")
**Purpose**: Present a tutor’s details for decision-making.
- **What the page contains**: Tutor identity, profile content, subjects, pricing, and review signals (where available).
- **Primary actions**: Proceed to booking/demo/token purchase paths (based on user state).
- **Key user actions**: Review tutor summary, subjects, and pricing; decide whether to book demo or proceed to paid booking.
- **System behavior**: If the viewer is not authenticated, the user is prompted to sign in before completing booking/payment actions.
- **Outcome**: Student proceeds to demo booking or token purchase for that tutor.

## 4) Become a Tutor ("/become-tutor")
**Purpose**: Convert visitors into tutor applicants.
- **What the page contains**: Value proposition and CTA to start the tutor onboarding.
- **Primary actions**:
  - If not logged in: sign up/sign in, then choose role.
  - If logged in: proceed toward tutor onboarding (KYC).
- **Key user actions**: Review expectations/benefits; click CTA to start.
- **System behavior**: Routes the user into the tutor dashboard and onboarding requirements if they select Tutor role.
- **Outcome**: Tutor begins profile completion and KYC submission.

## 5) Pricing ("/pricing")
**Purpose**: Explain token-based pricing and demo policy.
- **What the page contains**: Token concept, demo session messaging, minimum token purchase, payment provider mention.
- **Key user actions**: Understand token packs; compare how tokens apply to bookings.
- **Outcome**: User proceeds to Find Tutors / tutor profile and then cart/checkout if ready.

## 6) How It Works ("/how-it-works")
**Purpose**: Simple explanation of the end-to-end journey.
- **What the page contains**: Step list (sign up → search tutors → book demo/paid via tokens → join session → chat/rate).
- **Key user actions**: Follow steps to understand the flow.
- **Outcome**: Clear expectation-setting for the student and tutor experiences.

## 7) About ("/about")
**Purpose**: Brand story and trust-building.
- **What the page contains**: Mission/vision, differentiators (verified tutors, global reach, progress tracking), values, CTAs.
- **Key user actions**: Read mission and trust signals; proceed to tutor discovery or tutor onboarding.
- **Outcome**: Higher confidence and conversion to the appropriate next step.

## 8) Support ("/support")
**Purpose**: Central help center for all roles (AI quick-help + support tickets; student refunds/transfers; admin queues).
- **Tabs / areas**:
  - **AI Help**: basic guided help replies for common questions.
  - **Support tickets** (logged-in): create ticket, view ticket thread, post messages, update status.
  - **Admin support queue** (admin-only): see unassigned/assigned tickets and assign/handle them.
  - **Refunds & transfers** (student-focused): submit refund requests and token transfer requests (with validation rules).
- **Key user actions**: Search/ask quick questions; create a ticket; track ticket status; submit refund/transfer requests when eligible.
- **System behavior**: Shows role-specific tools (students see requests; admins see queues and assignment actions).
- **Outcome**: The issue is either answered immediately (AI help) or tracked to closure via a ticket/request.

## 9) Privacy Policy ("/privacy")
**Purpose**: Communicate privacy, data handling, and user rights.
- **What the page contains**: A structured policy describing data collected, use, sharing, security, retention, and contact info.
- **Key user actions**: Review how data is used and how to request support regarding privacy.
- **Outcome**: Transparency and compliance alignment.

## 10) Terms of Use ("/terms")
**Purpose**: Define platform terms and operational rules.
- **What the page contains**: Student and tutor rules including booking, cancellations/refunds, token rules, tutor responsibilities and payout policy, acceptable use.
- **Key user actions**: Understand cancellation/refund principles and acceptable-use rules.
- **Outcome**: Reduced disputes and aligned expectations.

## 11) Blog List ("/blogs")
**Purpose**: Publish educational updates and community content.
- **What the page contains**: Blog cards (cover image, title, summary, author/date) with empty-state handling.
- **Key user actions**: Browse posts; open a post; return to list.
- **System behavior**: Displays empty-state messaging if there are no published posts.
- **Outcome**: Users consume content and re-engage with the platform.

## 12) Blog Post ("/blogs/:slug")
**Purpose**: Read a single blog article.
- **What the page contains**: Cover image (optional), title, author/date, summary, and the article body.
- **Key user actions**: Read content; navigate back to blogs.
- **Outcome**: Inform and educate users; build trust.

## 13) Login ("/login")
**Purpose**: Authenticate users.
- **What the page contains**: Email/password login, "Remember for 30 days", Google sign-in, forgot password.
- **Outcome**: Redirect to Student/Tutor/Admin dashboard (or role selection if needed).
- **Key user actions**: Sign in via password or Google; use forgot password if needed.
- **System behavior**: Prevents logged-in users from staying on login and routes them to their dashboard.

## 14) Sign Up ("/signup")
**Purpose**: Create a new student or tutor account.
- **What the page contains**: Role toggle (Student/Tutor), Google sign-up, email/password sign-up.
- **Outcome**: Redirect into the chosen role area.
- **Key user actions**: Choose role; create account.
- **System behavior**: Establishes the role experience and routes accordingly.

## 15) Forgot Password ("/forgot-password")
**Purpose**: Recover account access.
- **What the page contains**: Multi-step reset flow: choose method (email/phone) → OTP verify → set new password.
- **Key user actions**: Request OTP; verify OTP; set new password.
- **System behavior**: Enforces OTP validation and minimum password rules.
- **Outcome**: User regains account access and can log in.

## 16) Reset Password ("/reset-password")
**Purpose**: Complete password reset after verification.
- **What the page contains**: The final reset step (set a new password) depending on how the recovery flow is configured.
- **Key user actions**: Enter new password and confirm.
- **Outcome**: Password is updated; user can proceed to login.

## 17) Auth Callback ("/auth/callback")
**Purpose**: Complete Google sign-in and route user appropriately.
- **Stakeholder note**: This is a technical bridging page; the user sees a brief “Finishing sign-in…” state.
- **Key user actions**: No action required; user waits briefly.
- **Outcome**: User arrives at their dashboard (or choose-role if required).

## 18) Legacy / Compatibility Routes
**Purpose**: Maintain backward compatibility and route redirects.
- **What the routes do**:
  - Old tutor profile links redirect to the new tutor public profile route.
  - Older URLs redirect to their modern equivalents.
- **Examples**:
  - "/tutor/:id" and "/tutor" redirect into the correct tutor public profile route.
  - "/tutors" redirects to "/find-tutors".
  - "/become-a-tutor" redirects to "/become-tutor".
  - "/tutors/kyc-submission" and "/tutor/kyc-submission" redirect to "/tutor/kyc".
- **Outcome**: Old links continue to work, reducing user confusion and support burden.

---

# B) Shared (Logged-in) Pages

## 19) Choose Role ("/choose-role")
**Purpose**: Decide how a newly authenticated user will use Tunect.
- **What the page contains**: Two choices: **I’m a Student** / **I’m a Tutor**.
- **Outcome**: Creates/activates the appropriate profile and routes to the correct dashboard.
- **Key user actions**: Select Student or Tutor.
- **System behavior**: Prevents access to role dashboards until a role is set.

## 20) Password & Security ("/account/security")
**Purpose**: Enable password creation/change.
- **What the page contains**: Change password (if password exists) or create password (if Google-only user).
- **Key rule**: Minimum password length enforced.
- **Key user actions**: Set or change password.
- **Outcome**: Password is saved; user can use password-based login going forward.

## 21) Class Details ("/class/:bookingId")
**Purpose**: Show the booking’s class join details.
- **What the page contains**: Tutor info, schedule, meeting URL, and a join/open action.
- **Key rules**:
  - Classroom becomes available shortly before start time.
  - After class end, joining is blocked and user is guided to support.
- **Key user actions**: Review schedule; click Join/Open when allowed.
- **System behavior**: Enforces time gates to avoid early/late entry.
- **Outcome**: User is routed into in-platform call (LiveKit) or an external meeting link.

## 22) Live Call ("/call/:bookingId")
**Purpose**: In-platform live classroom using video + audio and an integrated whiteboard.
- **What the page contains**: Live video grid, participant list, and a whiteboard tab.
- **Key rules**: waiting-room behavior until both parties join; time-limited session behavior.
- **Key user actions**: Join call; manage mic/camera; switch between participants and whiteboard.
- **System behavior**: Validates booking context and enforces session timing.
- **Outcome**: Live teaching session happens inside Tunect.

## 23) Whiteboard ("/whiteboard/:bookingId")
**Purpose**: Direct whiteboard access tied to a booking.
- **What the page contains**: The whiteboard canvas for that booking.
- **Key user actions**: Open whiteboard and collaborate (during an active/eligible booking).
- **Outcome**: Shared whiteboard supports teaching and learning.

---

# C) Student Pages ("/student/*")

## 22) Student Dashboard ("/student/dashboard")
**Purpose**: Student’s operational home.
- **What the page contains**: Token balance, next booking, unread messages, recommended tutors, study stats, profile completion.
- **Behavior**: Independent loading blocks (each section can load/fail without breaking the whole page).
- **Key user actions**: Jump into bookings, tokens, messages, or recommended tutors.
- **System behavior**: Loads multiple widgets; partial failures show per-widget error states.
- **Outcome**: Student can quickly resume the next important task.

## 23) Student Profile ("/student/profile")
**Purpose**: Manage student personal profile.
- **What the page contains**: View/edit profile details and avatar upload.
- **Key user actions**: Update personal info and profile picture.
- **Outcome**: Profile is saved and reflected across bookings/messages.

## 24) Manage Account ("/student/manage-account")
**Purpose**: Update account settings.
- **What the page contains**: Name and preferred display currency; email read-only; phone read-only if present.
- **Key user actions**: Update name/currency.
- **System behavior**: Prevents editing immutable identity fields (email; phone where locked).
- **Outcome**: Preferred currency affects how prices are displayed in the UI.

## 25) Bookings ("/student/bookings")
**Purpose**: Book and manage sessions.
- **What the page contains**: Bookings segmented by state (e.g., unscheduled, upcoming, completed) with slot selection where required.
- **Key policies (as presented in-app)**:
  - Cancellation refund depends on timing (48+ hours full, 24–48 partial, <24 none).
  - Group sessions may be non-refundable.
  - Demo sessions do not impact token balance.
- **Key user actions**: Pick a time slot; reschedule/cancel (where allowed); join class at the right time.
- **System behavior**: Shows eligibility rules and blocks invalid actions (e.g., cancel too late).
- **Outcome**: Booking moves through lifecycle: created → scheduled → completed/cancelled.

## 26) Sessions ("/student/sessions")
**Purpose**: Track learning sessions list with status.
- **What the page contains**: Sessions with derived statuses (e.g., upcoming/completed/expired) and access to meeting links when available.
- **Key user actions**: Review session history; open class details; follow meeting/join action.
- **Outcome**: Student can track what was attended and what’s upcoming.

## 27) Messages ("/student/messages" and chat routes)
**Purpose**: Student-tutor communication.
- **What the page contains**: Conversation list and a conversation window when selected.
- **Key user actions**: Start/open conversation; send messages; follow conversation context.
- **System behavior**: Maintains conversation history and unread state.
- **Outcome**: Student and tutor coordinate outside the session time.

## 28) Notifications ("/student/notifications")
**Purpose**: View and manage notifications.
- **What the page contains**: All/unread filter, mark read, mark all read; deep-links into relevant areas (e.g., bookings).
- **Key user actions**: Open a notification; mark read/delete; clear all unread.
- **Outcome**: Reduced missed actions (booking updates, admin decisions, system events).

## 29) Favorites ("/student/favorites")
**Purpose**: Save and return to preferred tutors.
- **What the page contains**: Favorite tutor list with remove and quick actions.
- **Key user actions**: Add/remove favorites; reopen tutor profile.
- **Outcome**: Faster repeat booking with preferred tutors.

## 30) Token Balance ("/student/token-balance")
**Purpose**: Show token balances per tutor plus ledger history.
- **What the page contains**: Per-tutor balances and a ledger of token movements; CTA to buy more tokens.
- **Key user actions**: Review balances; understand where tokens were spent/refunded; buy more tokens.
- **System behavior**: Separates balances by tutor context (token packs are tied to a tutor).
- **Outcome**: Student can make informed purchase and booking decisions.

## 31) Cart ("/student/cart")
**Purpose**: Prepare token purchase.
- **What the page contains**: Selected tutor context and token purchase setup; routes to paid checkout.
- **Key user actions**: Choose token quantity/pack; confirm tutor selection; continue to checkout.
- **System behavior**: Validates required selections and prevents checkout without a valid purchase intent.
- **Outcome**: Student proceeds to payment.

## 32) Paid Checkout ("/student/checkout")
**Purpose**: Complete payment for token packs via payment gateway.
- **What the page contains**: Redirect/loading experience while the payment gateway is opened.
- **Key user actions**: Complete payment in gateway modal; handle success or cancel.
- **System behavior**: Creates an order, opens the gateway, and verifies payment before confirming success.
- **Outcome**: User is routed to success/failure result page.

## 33) Payment Success ("/student/payment/success")
**Purpose**: Confirm payment completion.
- **What the page contains**: Success message and order reference; routes to bookings and (optionally) slot-picking prompt.
- **Key user actions**: Go to bookings; optionally pick a slot now (guided CTA).
- **System behavior**: Can set a prompt flag so bookings page opens with “select slot” context.
- **Outcome**: Student converts payment into an actual scheduled class.

## 34) Payment Failure ("/student/payment/failure")
**Purpose**: Inform user that payment did not complete.
- **Current implementation note**: This page appears to show a success-style message in the code and should be reviewed before release.
- **Expected user actions**: Retry payment; return to cart; contact support if charged but not credited.
- **Outcome**: Either the payment is retried successfully or a support ticket/refund flow is initiated.

## 35) Transactions / Receipts ("/student/transactions")
**Purpose**: Provide receipts and payment history.
- **What the page contains**: List of successful payments and receipt generation (download).
- **Key user actions**: View past payments; download receipts for reimbursement/accounting.
- **System behavior**: Generates a receipt document (PDF) based on stored payment records.
- **Outcome**: Student has auditable proof of purchase.

## 36) Demo Checkout ("/student/demo-checkout")
**Purpose**: Book a free demo session with a tutor.
- **What the page contains**: Tutor selection context and booking creation flow.
- **Key rule**: One demo per tutor per student (where enforced).
- **Key user actions**: Confirm demo booking; select an available time.
- **Outcome**: Demo booking is created and shown in bookings/sessions.

## 37) Waitlist ("/student/waitlist")
**Purpose**: Track waitlist requests and book when a slot becomes available.
- **What the page contains**: Waitlist entries with statuses (Waiting, Slot Available, Expired, Booked), expiry messaging, and actions.
- **Key user actions**: Book from waitlist when notified; remove an entry; monitor expiry.
- **System behavior**: Highlights items close to expiry to reduce missed opportunities.
- **Outcome**: Student turns a waitlist entry into a confirmed booking.

## 38) Reviews ("/student/reviews")
**Purpose**: Create and manage tutor reviews.
- **What the page contains**: One review per tutor pattern (based on latest completed booking) with edit/delete.
- **Key user actions**: Rate and write feedback; edit or delete prior review.
- **System behavior**: Links reviews to valid tutor/session history.
- **Outcome**: Review signals improve marketplace trust and ranking.

## 39) Review Session ("/student/review-session")
**Purpose**: Informational/placeholder page.
- **What the page contains**: A basic page indicating review functionality.
- **Outcome**: Minimal; included for completeness of routing.

## 40) Learning Progress ("/student/progress")
**Purpose**: Show learning progress and achievements.
- **What the page contains**: Total hours studied, progress-by-subject cards, and certificate highlights.
- **Key user actions**: View progress and jump to goals.
- **System behavior**: Loads progress, certificates, and profile-derived totals independently.
- **Outcome**: Student understands learning trajectory and next steps.

## 41) Learning Goals ("/student/goals")
**Purpose**: Define and track learning goals.
- **What the page contains**: Create/edit/delete goals, milestones within goals, mark completion.
- **Key user actions**: Create goals; add milestones; check off milestones; complete goals.
- **System behavior**: Confirms destructive actions (delete) and updates progress instantly after changes.
- **Outcome**: Structured learning plan and accountability.

## 42) Session Notes ("/student/session-notes")
**Purpose**: Provide learning notes and shared study materials.
- **What the page contains**: Notes list, a shared materials list, and ability to open/download materials.
- **Key user actions**: Review notes; open shared PDFs/materials.
- **System behavior**: Tracks downloads/opens and resolves secure file access before opening.
- **Outcome**: Student can revisit learning content between sessions.

## 43) Certificates ("/student/certificates")
**Purpose**: Display learning certificates.
- **What the page contains**: Certificate tiles by type; share action; download is marked as “coming soon”.
- **Key user actions**: View certificate tier/status; share to other apps or copy a share link.
- **Outcome**: Motivation and proof-of-learning artifacts.

---

# D) Tutor Pages ("/tutor/*")

## 44) Tutor Dashboard ("/tutor/dashboard")
**Purpose**: Tutor’s operational home.
- **What the page contains**: Availability summary, sessions, profile completion, stats, and earnings highlights.
- **Key user actions**: Go to availability; review upcoming sessions; complete missing profile/KYC steps.
- **Outcome**: Tutor can manage day-to-day teaching operations.

## 45) Tutor Profile ("/tutor/profile")
**Purpose**: Manage tutor profile and readiness.
- **What the page contains**: Profile details (subjects, classes, languages, summary/experience, hourly rate) and validation-driven completeness.
- **Key user actions**: Add subjects/classes; set pricing; publish a compelling profile summary.
- **System behavior**: Highlights missing required fields to become bookable.
- **Outcome**: Improved discoverability and conversion.

## 46) KYC ("/tutor/kyc")
**Purpose**: Submit identity and payout verification details.
- **What the page contains**: KYC form and document uploads; status progression (submitted/under review/approved/rejected).
- **Key user actions**: Submit identity details and documents; track status.
- **System behavior**: Blocks payouts or certain operations until KYC meets requirements.
- **Outcome**: Tutor becomes eligible for payouts.

## 47) Availability ("/tutor/availability")
**Purpose**: Control when students can book.
- **What the page contains**: Calendar-based slot creation/edit/delete, recurring template application, and booking constraints.
- **Key user actions**: Add slots; remove slots; apply recurring patterns.
- **System behavior**: Prevents double-booking and invalid slot ranges.
- **Outcome**: Students can book within the tutor’s published availability.

## 48) Sessions ("/tutor/sessions")
**Purpose**: Manage teaching sessions.
- **What the page contains**: Session list with meeting links; certain session actions such as cancellation and group conversion (where allowed).
- **Key user actions**: Join class at session time; review upcoming/completed sessions.
- **Outcome**: Tutor can deliver sessions reliably.

## 49) Messages ("/tutor/messages" and chat routes)
**Purpose**: Tutor-student communication.
- **What the page contains**: Conversation list and chat window.
- **Key user actions**: Respond to student queries; coordinate scheduling and materials.
- **Outcome**: Better student support and retention.

## 50) Notifications ("/tutor/notifications")
**Purpose**: View and manage notifications.
- **What the page contains**: List with mark read, delete, mark all read; deep-links into tutor sessions.
- **Key user actions**: Open notification; clear unread; follow deep links.
- **Outcome**: Tutor stays up to date on session changes and platform actions.

## 51) Earnings ("/tutor/earnings")
**Purpose**: Financial transparency for tutors.
- **What the page contains**: Wallet balance, ledger entries, payout timing and summary.
- **Key user actions**: Review earnings and payout history.
- **Outcome**: Trust through transparent accounting.

## 52) Recurring Templates ("/tutor/recurring-templates")
**Purpose**: Save and reuse weekly availability patterns.
- **What the page contains**: CRUD for templates and activate/deactivate.
- **Key user actions**: Create a weekly schedule template; apply it to availability.
- **Outcome**: Faster availability management.

## 53) Content Library ("/tutor/content-library")
**Purpose**: Upload and share study materials.
- **What the page contains**: PDF upload (size/type enforced), list of uploaded materials, share to students, download tracking.
- **Key user actions**: Upload a PDF; share it with a student; manage existing materials.
- **System behavior**: Enforces file type/size rules and secures file access.
- **Outcome**: Students receive curated materials tied to learning.

## 54) Performance Tracking ("/tutor/performance-tracking")
**Purpose**: Create performance reports for students.
- **What the page contains**: Report list, create report form (by student and month), search/filter.
- **Key user actions**: Select student + month; fill strengths/areas to improve; publish report.
- **Outcome**: Students and parents get structured progress updates.

## 55) Manage Account ("/tutor/manage-account")
**Purpose**: Update account settings.
- **What the page contains**: Name and preferred display currency; email read-only; phone read-only if present.
- **Key user actions**: Update name/currency.
- **Outcome**: Currency preference affects display, and account remains identity-safe.

## 56) Skill Test ("/tutor/skill-test")
**Purpose**: Historical skill test page.
- **Current implementation note**: Marked as deprecated (informational only).
- **Outcome**: No operational impact; included for completeness.

---

# E) Admin Pages ("/admin/*")

## 57) Admin Dashboard ("/admin/dashboard")
**Purpose**: Platform control center.
- **What the page contains**: Key metrics tiles and quick navigation to operational tools.
- **Key user actions**: Navigate to tutor/student management, KYC, finance, support operations.
- **Outcome**: Fast access to operational workflows.

## 58) Tutors ("/admin/tutors")
**Purpose**: Monitor and manage tutors.
- **What the page contains**: Tutor list with filtering/sorting and status actions (including unban where applicable).
- **Key user actions**: Search tutors; open details; take actions (e.g., unban where permitted).
- **Outcome**: Controlled, auditable tutor operations.

## 59) Tutor Detail ("/admin/tutors/:id")
**Purpose**: Investigate and act on a single tutor.
- **What the page contains**: Wallet/ledger/payouts, bookings, reviews, KYC docs, conversations.
- **Key user actions**: Review KYC and financials; investigate disputes; take administrative actions.
- **Outcome**: Complete view for resolution and compliance.

## 60) Students ("/admin/students")
**Purpose**: Monitor and manage students.
- **What the page contains**: Student list with filtering/sorting, client-side pagination, and unban flow.
- **Key user actions**: Search/filter; open student detail; unban users when appropriate.
- **Outcome**: Centralized student operations.

## 61) Student Detail ("/admin/students/:id")
**Purpose**: Investigate and act on a single student.
- **What the page contains**: Tokens, bookings, token balances, ledgers, transfer/refund requests, assignments, certificates, progress, and conversations.
- **Key user actions**: Review payments and token movements; approve/reject requests in the correct queues; investigate conversation history.
- **Outcome**: Faster resolution of billing/support issues.

## 62) KYC Verification ("/admin/kyc-verification")
**Purpose**: Approve or reject tutor KYC submissions.
- **What the page contains**: Queue grouped by tutor with bundled KYC docs; approve/reject/pending with notes.
- **Key user actions**: Review docs; approve/reject; add notes.
- **Outcome**: Only compliant tutors become payout-eligible.

## 63) Refund Requests ("/admin/refund-requests")
**Purpose**: Process student refunds and token transfer requests.
- **What the page contains**: Requests list with approve/reject actions and notes.
- **Key user actions**: Review request details; approve/reject; document decision.
- **Outcome**: Controlled financial adjustments.

## 64) Policy Config ("/admin/policy-config")
**Purpose**: Configure platform policies.
- **What the page contains**: Editable policy sections (legal/student/tutor/platform rules) with metadata (last updated).
- **Key user actions**: Update policy text; publish changes.
- **Outcome**: Policy changes become visible and enforceable across the platform.

## 65) Audit Log ("/admin/audit")
**Purpose**: Operational traceability.
- **What the page contains**: Filtered/paginated audit log showing before/after JSON for changes.
- **Key user actions**: Filter by actor/action/date; inspect before/after.
- **Outcome**: Strong governance and accountability.

## 66) Finance Landing ("/admin/finance")
**Purpose**: Entry point to finance tools.
- **What the page contains**: Tiles for Balance Sheet (director-only) and Payments & Receipts.
- **Key user actions**: Navigate to payment monitoring, payouts, and reconciliation.
- **Outcome**: Finance workflows are centralized.

## 67) Payments & Receipts ("/admin/finance/payments")
**Purpose**: Track student payments and tutor payout obligations.
- **What the page contains**: Two tabs: student payments received and tutor payouts due; summary stats; basic export/download hooks.
- **Key user actions**: Monitor collections and payout obligations; identify blocked/banned impacts.
- **Outcome**: Improved cashflow visibility.

## 68) Payout Dashboard ("/admin/finance/payouts")
**Purpose**: Track payable earnings details.
- **What the page contains**: Filterable, grouped-by-tutor ledger breakdown and CSV export.
- **Key user actions**: Filter by date/reason; export CSV; reconcile totals.
- **Outcome**: Operational payout readiness.

## 69) Reconciliation ("/admin/finance/recon")
**Purpose**: Reconcile bank statements vs payment gateway reports.
- **What the page contains**: Date-based recon view, upload bank/gateway files, totals, and adjustment workflow.
- **Key user actions**: Upload statements; review mismatches; create adjustments.
- **Outcome**: Reduced financial discrepancies and better auditability.

## 70) Reports ("/admin/reports")
**Purpose**: Entry point to reporting.
- **What the page contains**: Report tiles linking to analytics and finance views; period selection UI.
- **Key user actions**: Choose a reporting area and time period.
- **Outcome**: Faster access to operational reporting.

## 71) Analytics ("/admin/analytics")
**Purpose**: Operational analytics navigation.
- **What the page contains**: Links to dashboard conversion metrics, director-only balance sheet, payout dashboard.
- **Key user actions**: Open analytics views; cross-check with finance.
- **Outcome**: Data-driven oversight.

## 72) Admin Messages ("/admin/messages")
**Purpose**: Moderate and manage messaging.
- **What the page contains**: Conversation list and chat window; ability to send subject broadcasts (admin-only) to tutors.
- **Key user actions**: Review conversations; broadcast important updates to tutors.
- **Outcome**: Platform-wide communications channel.

## 73) Reviews ("/admin/reviews")
**Purpose**: Review moderation.
- **Current implementation note**: The page is currently minimal (placeholder text).
- **Outcome**: Limited in Release 1; earmarked for enhancement.

## 74) Blogs Admin ("/admin/blogs")
**Purpose**: Create and publish blogs.
- **What the page contains**: Create/edit/delete blog posts with status (draft/published).
- **Key user actions**: Draft content; publish; unpublish/delete.
- **Outcome**: Controlled content publishing.

---

# Appendix — Notable Release 1 Notes
- Some pages are explicitly marked as **deprecated** (e.g., Tutor Skill Test).
- Some pages appear **placeholder/minimal** (e.g., Admin Reviews, Student Review Session).
- The Student **Payment Failure** route should be validated; current file content appears inconsistent with expected behavior.

