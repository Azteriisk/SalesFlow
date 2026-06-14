# SalesFlow

SalesFlow is an offline-first, mobile-optimized, premium Progressive Web Application (PWA) designed for field sales representatives to discover prospects, manage pipelines, run calling sessions, and track sales performance.

Built with React, Vite, TypeScript, and standard CSS, it features a glassmorphic theme and offline databases for completely disconnected field operations.

---

## Key Features

### 1. Prospect Discover Swiper
- Swipable card deck of Google Place listings within a custom search radius.
- **Personalized Algorithm**: Dynamically calculates a match score (50%–99%) based on custom category weights, ratings, review counts, and Haversine distance.
- **Prospect Drawer**: Expand details to see address, category, phone number, website, and a live review feed (fetched via Google Places API or mocked fallback).

### 2. CRM Lead Manager (Pipeline)
- Categorizes prospects by lifecycle status: *Pending OSVs*, *Phone Block*, *Appointments*, *Sold (Closed Won)*, *Snoozed*, and *Blacklisted*.
- **Log On-Site Visit (OSV)**: Custom outcome forms to transition leads through the funnel, set appointments, log notes, and log spoke-with details.
- **Quote Attachments**: Attach custom quotes to lead profiles, approve/reject them, and automatically mark them as sold.

### 3. Media Attachments & Lightbox
- **Camera integration**: Attach multiple photos (storefronts, facility requirements, order forms) when logging visits or calls.
- **Client-Side Canvas Compression**: Automatically resizes and compresses uploads to `image/jpeg` at 70% quality (max 800px) before storing. This preserves high-quality thumbnails and keeps local database sizes under ~50KB per photo.
- **Lightbox Overlay**: Expands attached thumbnails into full-screen high-resolution modals with a close overlay.

### 4. Phone Calling Block
- Power-dialer interface containing swipable lead cards.
- Swipe left to skip (rotates to the back of the queue), swipe right to log outcome (blocked by gatekeeper, spoke with DM, set appointment, sold).
- Shows inline logs of past visit context to prepare the representative before making calls.

### 5. Analytics Dashboard & Quota Tracker
- **Progress Widgets**: Visual daily and weekly goal trackers for OSVs, phone calls, appointments, and contract revenue.
- **Career Milestones Tracker**: Tracks quarterly target goals ($9,000 for Summit, $12,000 for Presidents Club) and annual projections relative to the rep's custom fiscal year start date.
- **Interactive Map**: Displays categorized pins of nearby prospects using Google Maps.

---

## PWA & Sync Capabilities

SalesFlow is configured as a fully compliant Progressive Web Application (PWA) with the following features:

### 1. Offline Sync & Rep-to-Rep Collaboration
* **Connection Reconnect Sync**: The application automatically detects when connection status changes from offline to online and fires a background synchronization event (`syncDataWithCloud`) to upload local visit logs and pull updates.
* **Rep Shared Notes**: Allows reps working overlapping regions or shared customer accounts to see each other's visit notes. When team updates are pulled down, they are highlighted with a **Team Shared** visual badge in the pipeline drawer.
* **Service Worker Background Sync**: Registers PWA Background Sync (`salesflow-sync`) and Periodic Sync (`salesflow-periodic-sync` scheduled every 12 hours) to ensure updates are pushed/pulled even if the app is closed.

### 2. Intelligent Notifications
* **15-Minute Appointment Reminders**: Automatically parses appointment details from call/visit logs (`Appointment set for YYYY-MM-DD at HH:MM`) and schedules browser notifications to fire 15 minutes before the appointment start time.
* **Daily Goal Motivation Alerts**: Around 3:30 PM, the notification engine checks the rep's daily OSV target against their completed visits for the day. If they are behind schedule, a motivational message is dispatched to encourage hitting their target.
* **Settings Panel Toggles**: Users can toggle browser notifications on/off in the Settings screen, which requests browser permissions dynamically.

---

## Technical Stack

- **Core**: React 19, Vite 8, TypeScript, Vanilla CSS.
- **State & Routing**: Component state machines (tab-based UI for mobile efficiency).
- **Database**: IndexedDB (`db.ts`) for offline persistence.
- **PWA Capabilities**: Service worker registration via `vite-plugin-pwa`.
- **Hybrid Mobile Wrapper**: Ready for Capacitor integrations (`capacitor.config.ts`).
- **Icons**: Lucide React.

---

## Implemented Roadmap Features

The following priority roadmap features have been successfully implemented and integrated:

1. **Clerk Authentication Integration** 🔑
   * Replaced mock user profiles with production-ready Clerk authentication.
   * Configured hash routing gates (`<SignIn />` and `<SignUp />`) and profile population from authenticated user details.
   
2. **Enhanced Data Security** 🔒
   * Integrated AES-256-GCM encryption at the application level via Web Crypto API.
   * Enabled encryption for sync payloads transferred during background connections, using keys derived from the user's secure Clerk ID.

3. **Achievements Timeframe Classification** 🏆
   * Added interactive segment tabs (**Weekly**, **Quarterly**, **Yearly**, and **Lifetime**) to the dashboard badge tracking UI.
   * Expanded the local achievements database schema to support time-bounded badge targets (e.g., Weekly Hustler, Weekly Dialer).

4. **B2B Organization & Company Management** 🏢
   * Bounded the database version from 4 to 5 to introduce B2B `organizations` IndexedDB stores.
   * Built a full B2B administration and rep-quota alignment portal including Team Roster tables, Quota Governance policies (locking default quotas), and analytics panels.

5. **Discovery Tab GPS Drift & API Quota Protection** 📍
   * Configured a 250m Haversine distance guard on the Discovery tab to prevent GPS micro-drift from triggering excessive Google Places requests.
   * Implemented a matching 50m location watch state throttle in the main container to optimize overall battery and render cycles.

