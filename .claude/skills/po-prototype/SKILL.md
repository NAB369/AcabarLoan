---
name: po-prototype
description: Generate interactive HTML prototype page with Tailwind CDN and shared layout for UX validation
user-invocable: true
---

# Generate HTML + Tailwind CDN Prototype Page

Generate interactive HTML prototype pages with a shared layout system. Each page is a separate HTML file that shares the same sidebar, topbar, theme, and mock data — change the layout once, all pages update.

Uses React 18 via CDN + Tailwind CSS via CDN + Babel standalone. No build step — double-click any file to open in browser.

> **Why Tailwind CDN?** The real app uses Next.js + Tailwind CSS. Prototype uses the same Tailwind classes — dev copies them directly into Next.js components.

## Usage

```
/po-prototype "Dashboard with stats cards, recent orders table, and activity feed"
/po-prototype --mode=wireframe "Checkout flow: cart → address → payment → confirmation"
/po-prototype "Product listing page with search, filters, and add to cart"
```

If the user does not describe what to prototype, ask them.

$ARGUMENTS

---

## Modes

| Mode | When to use | Look |
|------|-------------|------|
| `--mode=wireframe` | Early validation of layout and flow | Gray palette, dashed borders, placeholder text |
| `--mode=highfi` (default) | Visual validation before dev starts | Full colors, real text, polished UI |

---

## Before Generating

1. Check if `prototype/` folder exists with `config.js`, `layout.js`, `styles.css`
   - **If yes** → read them, generate only the new page file + update `index.html`
   - **If no** → generate the full scaffold first (config.js + layout.js + styles.css + index.html), then the page
2. Check if `prd.md` exists — read for user roles, features, data entities
3. Check if `ui-ux-wireframes.md` exists — read for page layout and components

---

## Prototype Folder Structure

```
prototype/
├── config.js            ← App name, menu items, mock data
├── layout.js            ← Sidebar, Topbar, PageLayout, Toast, Modal, EmptyState
├── styles.css           ← Tailwind config + minimal custom CSS
├── index.html           ← Directory page with links to all prototype pages
│
├── login.html           ← Auth page (no sidebar)
├── dashboard.html       ← App page (with sidebar)
├── product-listing.html ← App page
└── product-detail.html  ← App page
```

---

## Step 1: Generate Scaffold (first run only)

### `config.js` — App Config + Mock Data

```js
// ============================================
// App Configuration
// Edit this file to change menu, branding, and mock data
// ============================================

const APP_CONFIG = {
  name: "{App Name}",
  logo: "{emoji or text}",
  primaryColor: "teal", // Tailwind color name

  menu: [
    { label: "Dashboard", icon: "dashboard", href: "dashboard.html" },
    { label: "Products", icon: "inventory_2", href: "product-listing.html" },
    // Add more pages here
  ],

  currentUser: {
    id: 1,
    name: "Alice Johnson",
    email: "alice@example.com",
    role: "Admin",
    avatar: "A",
  },
};

// ============================================
// Mock Data — shared across all pages
// ============================================

const MOCK = {
  // Add entity data here based on PRD
  // Example:
  // products: [
  //   { id: 1, name: "Handmade Scarf", price: 29.99, category: "Accessories", stock: 15, status: "Active" },
  // ],
};

// ============================================
// Utility Functions
// ============================================

function formatMoney(val) {
  return "$" + Number(val).toFixed(2);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTimeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + "m ago";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h ago";
  return Math.floor(hours / 24) + "d ago";
}

function getInitial(name) {
  return name ? name.charAt(0).toUpperCase() : "?";
}

function getStatusClass(status) {
  const map = {
    active: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    rejected: "bg-red-100 text-red-800",
    inactive: "bg-slate-100 text-slate-800",
    "out of stock": "bg-red-100 text-red-800",
  };
  return map[status.toLowerCase()] || "bg-slate-100 text-slate-800";
}
```

Populate `MOCK` data based on the PRD entities. Use realistic data — real names, plausible values.

### `layout.js` — Shared Layout Components

This file uses `React.createElement()` (NOT JSX — plain JS file).

```js
// ============================================
// Shared Layout Components
// All components use React.createElement (no JSX in .js files)
// ============================================

const e = React.createElement;

// --- Sidebar ---
function Sidebar({ open, onClose }) {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  return e("div", null,
    // Mobile overlay
    open && e("div", {
      className: "fixed inset-0 bg-black/50 z-30 lg:hidden",
      onClick: onClose,
    }),
    // Sidebar
    e("aside", {
      className: `fixed inset-y-0 left-0 w-64 bg-slate-900 text-white z-40 transform transition-transform lg:relative lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`,
    },
      // Brand
      e("div", { className: "px-6 py-5 border-b border-slate-700 flex items-center gap-3" },
        e("span", { className: "text-2xl" }, APP_CONFIG.logo),
        e("span", { className: "text-lg font-bold" }, APP_CONFIG.name),
      ),
      // Nav
      e("nav", { className: "px-3 py-4 space-y-1" },
        APP_CONFIG.menu.map(function(item) {
          const active = currentPage === item.href;
          return e("a", {
            key: item.href,
            href: item.href,
            className: `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`,
          },
            e("span", { className: "material-symbols-outlined text-xl" }, item.icon),
            item.label,
          );
        }),
      ),
      // User info at bottom
      e("div", { className: "absolute bottom-0 left-0 right-0 px-4 py-4 border-t border-slate-700" },
        e("div", { className: "flex items-center gap-3" },
          e("div", { className: "w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-sm font-bold" },
            getInitial(APP_CONFIG.currentUser.name),
          ),
          e("div", null,
            e("div", { className: "text-sm font-medium" }, APP_CONFIG.currentUser.name),
            e("div", { className: "text-xs text-slate-400" }, APP_CONFIG.currentUser.role),
          ),
        ),
      ),
    )
  );
}

// --- Topbar ---
function Topbar({ title, subtitle, onMenuClick, actions }) {
  return e("header", { className: "bg-white border-b border-slate-200 px-6 py-4" },
    e("div", { className: "flex items-center justify-between" },
      e("div", { className: "flex items-center gap-4" },
        e("button", { className: "lg:hidden text-slate-600", onClick: onMenuClick },
          e("span", { className: "material-symbols-outlined" }, "menu"),
        ),
        e("div", null,
          e("h1", { className: "text-2xl font-extrabold text-slate-900 tracking-tight" }, title),
          subtitle && e("p", { className: "text-sm text-slate-500 mt-0.5" }, subtitle),
        ),
      ),
      e("div", { className: "flex items-center gap-3" },
        actions || null,
        e("span", { className: "material-symbols-outlined text-slate-400 cursor-pointer hover:text-slate-600" }, "notifications"),
        e("div", { className: "w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-sm font-bold" },
          getInitial(APP_CONFIG.currentUser.name),
        ),
      ),
    ),
  );
}

// --- PageLayout (wraps sidebar + topbar + content) ---
function PageLayout({ title, subtitle, actions, children }) {
  const sidebarState = React.useState(false);
  const open = sidebarState[0];
  const setOpen = sidebarState[1];

  return e("div", { className: "flex min-h-screen bg-slate-50" },
    e(Sidebar, { open: open, onClose: function() { setOpen(false); } }),
    e("div", { className: "flex-1 flex flex-col min-w-0" },
      e(Topbar, {
        title: title,
        subtitle: subtitle,
        actions: actions,
        onMenuClick: function() { setOpen(true); },
      }),
      e("main", { className: "flex-1 p-6" }, children),
    ),
  );
}

// --- Toast ---
function Toast({ message, type, onClose }) {
  React.useEffect(function() {
    var t = setTimeout(onClose, 3000);
    return function() { clearTimeout(t); };
  }, []);

  var bgColor = type === "success" ? "bg-green-600" : type === "error" ? "bg-red-600" : "bg-slate-700";

  return e("div", { className: "fixed bottom-6 right-6 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium z-50 toast-enter " + bgColor },
    message,
  );
}

// --- Confirm Modal ---
function ConfirmModal({ title, message, confirmLabel, variant, onConfirm, onCancel }) {
  var btnClass = variant === "danger"
    ? "bg-red-600 hover:bg-red-700 text-white"
    : "bg-primary-600 hover:bg-primary-700 text-white";

  return e("div", { className: "fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 modal-enter", onClick: onCancel },
    e("div", { className: "bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 modal-enter", onClick: function(ev) { ev.stopPropagation(); } },
      e("h3", { className: "text-lg font-bold text-slate-900 mb-2" }, title || "Confirm"),
      e("p", { className: "text-sm text-slate-600 mb-6" }, message),
      e("div", { className: "flex justify-end gap-3" },
        e("button", { className: "px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50", onClick: onCancel }, "Cancel"),
        e("button", { className: "px-4 py-2 rounded-lg text-sm font-medium " + btnClass, onClick: onConfirm }, confirmLabel || "Confirm"),
      ),
    ),
  );
}

// --- Empty State ---
function EmptyState({ icon, message, actionLabel, onAction }) {
  return e("div", { className: "text-center py-16 px-6" },
    e("span", { className: "material-symbols-outlined text-5xl text-slate-300 block mb-3 empty-bounce" }, icon || "inbox"),
    e("p", { className: "text-slate-500 mb-4" }, message || "No items yet"),
    actionLabel && e("button", {
      className: "px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700",
      onClick: onAction,
    }, actionLabel),
  );
}

// --- Loading Skeleton ---
function Skeleton({ type }) {
  if (type === "card") {
    return e("div", { className: "animate-pulse bg-white border border-slate-200 rounded-xl p-6 space-y-3" },
      e("div", { className: "h-4 bg-slate-200 rounded w-3/4" }),
      e("div", { className: "h-4 bg-slate-200 rounded w-1/2" }),
      e("div", { className: "h-20 bg-slate-200 rounded" }),
    );
  }
  return e("div", { className: "animate-pulse space-y-3" },
    e("div", { className: "h-4 bg-slate-200 rounded w-3/4" }),
    e("div", { className: "h-4 bg-slate-200 rounded w-1/2" }),
    e("div", { className: "h-4 bg-slate-200 rounded w-5/6" }),
  );
}

// --- Render App ---
function renderApp(Component) {
  ReactDOM.createRoot(document.getElementById("root")).render(e(Component));
}
```

### `styles.css` — Tailwind Config + Minimal Custom CSS

```html
<!-- This is loaded via <script> tag, not <link>, because Tailwind CDN needs config -->
```

Actually, Tailwind config goes in the HTML `<script>` tag. `styles.css` is for minimal overrides only:

```css
/* styles.css — Minimal custom CSS */
/* Tailwind handles 99% of styling. Only add what Tailwind can't do. */

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

/* Page content fade-in */
.page-enter {
  animation: fadeInUp 0.3s ease-out;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Modal entrance — scale up with backdrop */
.modal-enter {
  animation: modalIn 0.2s ease-out;
}

@keyframes modalIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* Toast slide-in from bottom-right */
.toast-enter {
  animation: toastIn 0.3s ease-out;
}

@keyframes toastIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Staggered list items — use with inline style: animation-delay */
.stagger-item {
  opacity: 0;
  animation: fadeInUp 0.3s ease-out forwards;
}

/* Empty state icon gentle bounce */
.empty-bounce {
  animation: bounce 2s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

/* Scrollbar styling */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### `index.html` — Prototype Directory

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prototype — {App Name}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet">
  <style>.material-symbols-outlined { overflow: hidden; display: inline-block; width: 1em; height: 1em; line-height: 1; vertical-align: middle; }</style>
  <style>body { font-family: 'Inter', sans-serif; }</style>
</head>
<body class="bg-slate-50 min-h-screen flex items-center justify-center p-8">
  <div class="w-full max-w-lg">
    <h1 class="text-3xl font-extrabold text-slate-900 mb-2">{App Name}</h1>
    <p class="text-slate-500 mb-8">Prototype Pages</p>

    <div class="space-y-3">
      <!-- Auto-updated: one link per page -->
      <a href="dashboard.html" class="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl hover:shadow-md hover:-translate-y-0.5 transition-all">
        <span class="material-symbols-outlined text-teal-600">dashboard</span>
        <span class="font-medium text-slate-900">Dashboard</span>
      </a>
    </div>

    <p class="text-xs text-slate-400 mt-8">{N} pages</p>
  </div>
</body>
</html>
```

---

## Step 2: Generate Page File

Each page HTML file follows this template:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{Page Name} — {App Name}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: { 50:'#f0fdfa',100:'#ccfbf1',200:'#99f6e4',300:'#5eead4',400:'#2dd4bf',500:'#14b8a6',600:'#0d9488',700:'#0f766e',800:'#115e59',900:'#134e4a' },
          }
        }
      }
    }
  </script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet">
  <style>.material-symbols-outlined { overflow: hidden; display: inline-block; width: 1em; height: 1em; line-height: 1; vertical-align: middle; }</style>
  <link rel="stylesheet" href="styles.css">
</head>
<body class="bg-slate-50 text-slate-900">
  <div id="root"></div>

  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="config.js"></script>
  <script src="layout.js"></script>

  <script type="text/babel">
    function {PageName}Page() {
      const [toast, setToast] = React.useState(null);

      return (
        <PageLayout title="{Page Title}" subtitle="{Page description}">
          <div className="page-enter">
            {/* Page-specific content here */}
          </div>

          {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </PageLayout>
      );
    }

    renderApp({PageName}Page);
  </script>
</body>
</html>
```

**Auth pages** (login, register) don't use `PageLayout`:

```html
<script type="text/babel">
  function LoginPage() {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
          {/* Login form */}
        </div>
      </div>
    );
  }
  renderApp(LoginPage);
</script>
```

---

## Tailwind Class Patterns

Use these patterns — dev copies them directly into Next.js:

### Buttons
```jsx
// Primary
<button className="inline-flex items-center px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors">

// Outline
<button className="inline-flex items-center px-4 py-2.5 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors">

// Danger
<button className="inline-flex items-center px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors">

// Loading
<button className="... opacity-75 cursor-wait" disabled>
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
  Saving...
</button>
```

### Cards
```jsx
<div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">

// Clickable
<div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer">
```

### Form Inputs
```jsx
<label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
<input className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-colors" />

// Error state
<input className="w-full px-3.5 py-2.5 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600" />
<p className="mt-1 text-sm text-red-600">Email is required</p>
```

### Badges
```jsx
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>
```

### Tables
```jsx
<div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
  <table className="w-full text-sm">
    <thead>
      <tr className="bg-slate-50 border-b border-slate-200">
        <th className="text-left px-4 py-3 font-semibold text-slate-600">Name</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-200">
      <tr className="hover:bg-slate-50 transition-colors">
        <td className="px-4 py-3">...</td>
      </tr>
    </tbody>
  </table>
</div>
```

### Responsive Grids
```jsx
// Stats cards
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

// Content + sidebar
<div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">

// Filter row
<div className="flex flex-wrap gap-3 items-center">
```

### Animations (built into styles.css)

| Class | Effect | Use on |
|-------|--------|--------|
| `page-enter` | Fade in + slide up | Page content wrapper |
| `modal-enter` | Scale up + fade in | Modal overlay + card |
| `toast-enter` | Slide up from bottom | Toast notification |
| `stagger-item` | Fade in + slide up (use with `animation-delay`) | List items, cards in grid |
| `empty-bounce` | Gentle bounce loop | Empty state icon |
| `animate-pulse` | Shimmer (Tailwind built-in) | Loading skeletons |
| `animate-spin` | Spinner (Tailwind built-in) | Loading button icon |

**Staggered list items — cards appear one by one:**
```jsx
{items.map((item, i) => (
  <div key={item.id} className="stagger-item" style={{ animationDelay: `${i * 60}ms` }}>
    {/* card content */}
  </div>
))}
```

### Icons
```jsx
<span className="material-symbols-outlined text-slate-500">icon_name</span>
```

---

## Wireframe Mode

When `--mode=wireframe`:
- Use only gray: `bg-slate-50`, `bg-slate-100`, `border-slate-300`, `text-slate-500`
- Dashed borders on sections: `border-2 border-dashed border-slate-300`
- No images — gray placeholder: `<div className="bg-slate-200 rounded-lg h-40 flex items-center justify-center text-slate-400">Image</div>`
- No animations or hover effects
- Descriptive labels: "Product Card", "Search Input", "Filter Dropdown"

---

## Required States (every page must have)

1. **Loading** — `<Skeleton />` while data loads
2. **Empty** — `<EmptyState icon="..." message="..." actionLabel="..." />`
3. **Error** — red alert banner
4. **Success** — `<Toast message="..." type="success" />`

---

## Skill Behavior

### First run
1. Create `prototype/` folder
2. Generate `config.js` — populate with app name, menu, mock data from PRD
3. Generate `layout.js` — sidebar, topbar, PageLayout, Toast, Modal, EmptyState, Skeleton
4. Generate `styles.css` — minimal custom CSS
5. Generate `index.html` — directory page
6. Generate the requested page HTML file
7. Add page link to `index.html`

### Subsequent runs
1. Read existing `config.js` — use same mock data, add new data if needed
2. Read existing `layout.js` — use same components, add new shared components if needed
3. Generate only the new page HTML file
4. Update `index.html` — add link to new page
5. Update `config.js` menu — add new page to sidebar nav

---

## After Generating

1. Tell the user: `"Prototype saved to prototype/{page-name}.html — open it in your browser"`
2. If first run: `"Also created config.js, layout.js, styles.css, and index.html"`
3. Ask: `"Would you like to adjust the layout, content, or interactions?"`

---

## Guidelines

- **Shared layout** — sidebar, topbar, toast, modal live in `layout.js`
- **Shared data** — mock data and menu in `config.js`
- **Page files are small** — only page-specific content, everything else is shared
- **Tailwind only** — use Tailwind classes, minimal custom CSS
- **Responsive** — desktop, tablet, mobile
- **Interactive** — buttons, forms, modals, tabs all work
- **Realistic data** — real names, plausible values, never "test" or "lorem"
- **All states** — loading, empty, error, success
- **No build step** — double-click any HTML file to open
- **Dev-friendly** — Tailwind classes copy directly into Next.js
