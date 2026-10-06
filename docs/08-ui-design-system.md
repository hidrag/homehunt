# HomeHunt — UI Design System

## Current status
Active UI standard incorporating Sprint 1–Sprint 3 component patterns, Tailwind CSS v4, and Lucide React icons.

S3 did not introduce shadcn/ui or Radix UI dependencies and continues using Tailwind CSS v4 + lucide-react.

## Principles
- Responsive-first: every layout adapts seamlessly from mobile (`< 640px`) to tablet (`640px–1023px`) to desktop (`1024px+`).
- Mobile usability is a first-class requirement (touch targets >= 44px, horizontal scrolling filmstrips, disabled scroll wheel zoom on embedded maps).
- Prefer reusable components and existing Tailwind utility patterns.
- Consistent spacing (Tailwind 4px baseline scale), typography, borders (`rounded-lg`, `rounded-xl`, `rounded-2xl`), and interaction states.
- Accessible by default: semantic HTML headings, ARIA roles/states, high-contrast focus rings, keyboard navigation.

## Component Specifications (S3)

### Visit Form (`VisitForm.jsx`, S8)
- **Fields**: date (`type="date"`, min = today), time (`type="time"`), duration (select: 30/60/90/120 minutes), optional note (textarea, ≤1000 chars client-side; server enforces 2000). React Hook Form + Yup.
- **Timezone**: captured from `Intl.DateTimeFormat().resolvedOptions().timeZone` (fallback `Asia/Kolkata`) and sent with the request; the server validates against IANA names.
- **Payload**: `startAt`/`endAt` are built as local wall-clock ISO strings with explicit `±HH:MM` offsets. The end slot uses its **own** calendar date so late-night slots crossing midnight do not send `endAt` on the wrong day.
- **States**: submitting ("Sending…"), success message, error message (server error text when available).

### Visit list surfaces (S8)
- **Buyer (`Visits.jsx`)**: URL-synced pagination (`page`), loading spinner, error + retry, empty state with "Browse listings" action, per-visit cancel with inline confirm (pending/confirmed only), deleted-property fallback ("Listing no longer available"), shared `StatusBadge`.
- **Agent dashboard Visits tab**: URL-synced tab + `vpage` pagination, loading/error/empty/retry, buyer summary, confirm/decline (pending) and complete/cancel (confirmed) with inline confirm, deleted-property fallback.
- **Admin Visits tab**: `GET /api/admin/visits` with status filter and pagination, safe buyer/agent summaries, deleted-property fallback, lifecycle actions limited to the server transition table with confirmation dialog.

### Chat surfaces (S9)
- **Buyer & agent (`Messages.jsx`)**: responsive two-pane layout (inbox list + transcript) that collapses to a single column below `lg` with a "back to conversations" affordance. Inbox shows property title, counterpart, last-message preview and an unread badge; URL-synced pagination (`page`). Transcript renders newest-last bubbles (`whitespace-pre-wrap break-words`, React text nodes only — never `dangerouslySetInnerHTML`), marks the thread read on open, and joins the Socket.io room for live `message:new` appends (deduplicated by `_id`). Send is a REST `POST` with a submitting state and inline error.
- **Listing detail (`MessageAgentButton.jsx`)**: "Message the agent" affordance beside the inquiry and visit forms. Signed-out visitors are routed to login; buyers open (or reuse) the property-bound thread and are navigated into it. Hidden for agent/admin viewers.
- **Header**: Messages link with an unread-count badge for buyers and agents (Redux `chat.unread`, hydrated on auth and refreshed on read). Admins see no Messages link.
- **Agent dashboard Conversations tab**: `cpage` pagination, buyer summary, last-message preview, per-thread unread badge, "Open conversation" link into `Messages`.
- **Admin Conversations tab**: read-only audit list with safe buyer/agent summaries and a "View transcript" panel that loads any thread's history (`GET /api/admin/conversations/:id/messages`). No compose affordance and no room participation (S9 locked decision).

### Property Gallery (`PropertyGallery.jsx`, S3)
- **Main Viewport**: Aspect ratio `aspect-video`, `rounded-2xl`, `overflow-hidden`, `border border-gray-200`, `bg-gray-100`, `shadow-sm`.
- **Navigation Buttons**: Circular translucent controls (`h-11 w-11 rounded-full bg-white/90 text-gray-800 shadow-md backdrop-blur-xs hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`), positioned vertically centered on left (`left-3`) and right (`right-3`). Disabled and styled with `opacity-40 cursor-not-allowed` at boundaries. Hidden when image count <= 1.
- **Counter Badge**: Positioned at bottom-right (`absolute right-4 bottom-4 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold tracking-wider text-white backdrop-blur-sm`), format: `X / Y`, with `aria-live="polite"`.
- **Thumbnail Strip**: Button group in a horizontally scrollable container (`flex gap-3 overflow-x-auto pb-1 pt-0.5`). Thumbnail buttons sized `h-16 w-24 sm:h-18 sm:w-28`, `rounded-lg`, `border bg-gray-100`. Active thumbnail highlighted with `border-indigo-600 ring-2 ring-indigo-600 ring-offset-1` and `aria-current="true"`; inactive thumbnails with `border-gray-200 opacity-70 hover:opacity-100`. Focus ring: `focus-visible:ring-2 focus-visible:ring-indigo-500`.
- **Broken Image Fallback**: In-place fallback container with `ImageOff` icon and descriptive message; navigation controls remain fully operational.

### Property Map (`PropertyMap.jsx`)
- **Container**: `h-64 w-full overflow-hidden rounded-2xl border border-gray-200 shadow-sm sm:h-80 lg:h-96`.
- **Marker Pin**: Custom inline SVG pin (`36x36px` circle with `20x20px` SVG, background `#4f46e5` / indigo-600, 2px white border, shadow) avoiding Vite static asset resolution issues.
- **Popup**: Displays property title using safe DOM `textContent` to prevent XSS.
- **Interactions**: Drag/pan and touch zoom enabled; `scrollWheelZoom: false` to avoid trapping page scroll.
- **Attribution**: OpenStreetMap contributors attribution preserved.
- **External Action**: Text link (`<a>`) with `ExternalLink` icon linking to OpenStreetMap in a new tab with `rel="noopener noreferrer"`.
- **Fallback State**: Responsive container (`h-64 sm:h-80 lg:h-96 rounded-2xl border border-gray-200 bg-gray-100 p-8 text-center`) with `MapPinOff` icon and text explaining coordinates are unavailable.

### Typography & Heading Hierarchy
- **Single `h1` per page**:
  - Listing detail page: Property Title (`text-3xl font-bold text-gray-900 sm:text-4xl`).
- **Section Headings (`h2`)**:
  - Sections (`Property Highlights`, `About this property`, `Amenities`, `Location`): `text-xl font-semibold text-gray-900`.
- **Subsection / Element Labels**:
  - Highlights metadata labels, sidebar detail labels (`text-sm text-gray-500`).
- **Price Display**:
  - Rendered as styled semantic `<p>` (`text-3xl font-bold text-indigo-700`), never as a heading element (`h2`/`h3`), preserving a clean document outline for assistive technologies.

## Required states
Major components must account for:
- loading (skeletons / spinners)
- empty (meaningful empty message with action button)
- error (descriptive error with retry option)
- disabled (visual opacity + `pointer-events-none` + `aria-disabled`)
- mobile, tablet, and desktop viewports
