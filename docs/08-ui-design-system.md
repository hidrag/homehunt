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

### Property Gallery (`PropertyGallery.jsx`)
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
