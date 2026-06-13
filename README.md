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

## Technical Stack

- **Core**: React 19, Vite 8, TypeScript, Vanilla CSS.
- **State & Routing**: Component state machines (tab-based UI for mobile efficiency).
- **Database**: IndexedDB (`db.ts`) for offline persistence.
- **PWA Capabilities**: Service worker registration via `vite-plugin-pwa`.
- **Hybrid Mobile Wrapper**: Ready for Capacitor integrations (`capacitor.config.ts`).
- **Icons**: Lucide React.

---

## Getting Started

### Prerequisites
Make sure you have Node.js (version 18+ recommended) installed.

### Installation
1. Clone the repository and navigate to the project directory:
   ```bash
   cd SalesFlow
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
Run the Vite development server:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building for Production & PWA Testing
Build the static distribution files and generate the PWA service worker:
```bash
npm run build
```
The output bundle will be created inside the `dist/` directory.

You can preview the production build locally:
```bash
npm run preview
```
