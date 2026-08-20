# FairPlay Platform Architecture Guide

## System Overview

FairPlay is a modern React application built with Vite that provides a complete event management and automated scoring platform. The architecture follows component-driven design with context-based state management for authentication and notifications.

## Architecture Layers

### 1. Presentation Layer (Components)
Located in `src/components/`

**Hierarchy:**
```
components/
├── common/          - Reusable atomic components
│   ├── Button.jsx   - Primary UI component (used everywhere)
│   ├── Card.jsx     - Container component
│   ├── Input.jsx    - Form input field
│   ├── Modal.jsx    - Dialog/overlay
│   ├── Badge.jsx    - Status indicator
│   ├── Tabs.jsx     - Tabbed interface
│   ├── EmptyState.jsx - No data placeholder
│   └── LoadingSpinner.jsx - Loading indicator
│
├── dashboard/       - Dashboard-specific components
│   └── StatCard.jsx - Statistics display
│
├── layouts/         - Page layout wrappers
│   ├── DashboardLayout.jsx - Dashboard with sidebar
│   ├── AuthLayout.jsx - Auth page wrapper
│   └── PublicLayout.jsx - Public pages wrapper
│
├── navigation/      - Navigation components
│   ├── Sidebar.jsx  - Role-based sidebar menu
│   └── Navbar.jsx   - Top navigation bar
│
└── notifications/   - Toast notification system
    ├── NotificationContainer.jsx
    └── Notification.jsx
```

**Design Pattern:** Each component has:
- JSX file with component logic
- CSS file with scoped styles
- Proper prop validation
- Accessibility attributes (aria-labels)

### 2. State Management Layer

#### Authentication State (`src/context/AuthContext.jsx`)
```javascript
{
  user: { id, name, email, role, avatar },
  isAuthenticated: boolean,
  loading: boolean,
  userRole: string,
  login(email, role): Promise,
  logout(): void
}
```

**Features:**
- Mock authentication (extensible to real API)
- localStorage persistence
- Role-based access control
- Automatic session restoration on app load

#### Notifications State (`src/context/NotificationContext.jsx`)
```javascript
{
  notifications: Array<Notification>,
  addNotification(message, type, duration): id,
  removeNotification(id): void,
  success/error/warning/info(message, duration): id,
  clearAll(): void
}
```

**Types:** success | error | warning | info

### 3. Data Layer

Located in `src/data/` - Mock data that simulates backend API responses

**Files:**
- **users.js** - User database with role-based filtering
- **events.js** - Event catalog with search and filters
- **rankings.js** - Leaderboard data for contests/tournaments
- **teams.js** - Team rosters and management
- **notifications.js** - User notifications (read/unread)
- **brackets.js** - Tournament bracket structures
- **analytics.js** - Dashboard metrics and activity logs

**Pattern:** Each file exports:
- Main data array
- Get functions (by ID, by filter, etc.)
- Update/mutation functions

Example:
```javascript
export const getEventById = (id) => mockEvents.find(e => e.id === id);
export const getActiveEvents = () => mockEvents.filter(e => e.status === 'active');
```

### 4. Utilities Layer (`src/utils/`)

#### formatters.js
- Date/time formatting
- Currency formatting
- Text transformation (capitalize, title case, etc.)
- Rank formatting with ordinals

#### validators.js
- Email, phone, URL validation
- Password strength checking
- Field-level validation
- Form-wide validation with error messages

#### helpers.js
- Class name combining (cn)
- Array operations (sort, filter, group, unique)
- Object manipulation (deep clone, merge, nested access)
- Functional utilities (debounce, throttle, delay)

### 5. Hooks Layer (`src/hooks/`)

Custom React hooks for common patterns:

```javascript
useAuth()           // Access authentication context
useNotification()   // Access notification context
useResponsive()     // Detect screen size breakpoints
                    // Returns: {width, height, isMobile, isTablet, isDesktop}
```

### 6. Routing Layer (`src/routes/` & `src/App.jsx`)

**Route Organization:**
```
Public Routes:
  / - Landing page
  /login, /register - Auth pages
  /about, /features, /contact - Public pages

Protected Routes (require authentication):
  /dashboard - Main dashboard
  /admin/* - Admin dashboard
  /organizer/* - Organizer dashboard
  /judge/* - Judge dashboard
  /participant/* - Participant dashboard
```

**Protection:**
```javascript
<ProtectedRoute>
  <Component /> // Only renders if authenticated
</ProtectedRoute>
```

## Data Flow

### Authentication Flow
```
1. User clicks Login
2. LoginPage calls useAuth().login(email, role)
3. AuthContext updates user state
4. localStorage.fairplay_user saved
5. ProtectedRoutes check isAuthenticated
6. Redirect to /dashboard
7. DashboardLayout loads based on userRole
```

### Notification Flow
```
1. Action occurs (form submit, save, delete, etc.)
2. Component calls useNotification().success/error()
3. NotificationContext adds notification
4. NotificationContainer receives via context
5. Notification renders with animation
6. Auto-dismisses after duration (default 5s)
```

### Page Rendering Flow
```
1. App.jsx routes request
2. ProtectedRoute checks authentication
3. If auth, renders lazy-loaded page component
4. Page uses DashboardLayout wrapper
5. DashboardLayout includes Sidebar + Navbar
6. Main content area renders page content
7. CSS animations trigger on mount
```

## CSS Architecture

### Structure (`src/styles/`)

**variables.css**
- All design tokens as CSS custom properties
- Colors, spacing, typography, shadows, z-index values
- Single source of truth for design system

**global.css**
- Root styles and resets
- Typography styles (h1-h6, p, a, button, input)
- Utility classes (.flex, .grid, .text-center, etc.)
- Scrollbar styling

**animations.css**
- Keyframe animations (fade, slide, scale, bounce, glow, float, etc.)
- Animation utility classes (.animate-fade-in, etc.)
- Interactive states (.btn-hover, .card-hover)

**responsive.css**
- Breakpoints: Mobile (640px), Tablet (1024px), Desktop (1440px)
- Responsive grid systems
- Touch-friendly sizing
- Media query utilities

### Naming Convention (BEM-like)
```css
.component { /* Base component */ }
.component-variant { /* Variant */ }
.component-section { /* Child section */ }
.component-section-element { /* Nested element */ }

Example:
.button { /* Base */ }
.button-primary { /* Variant */ }
.button-icon { /* Child element */ }
```

## Component Development Guide

### Creating a New Component

**Step 1: Create JSX**
```javascript
// src/components/common/MyComponent.jsx
import React from 'react';
import './MyComponent.css';

const MyComponent = ({ 
  children, 
  className = '', 
  variant = 'default',
  ...props 
}) => {
  const componentClass = `my-component my-component-${variant} ${className}`.trim();
  
  return (
    <div className={componentClass} {...props}>
      {children}
    </div>
  );
};

export default MyComponent;
```

**Step 2: Create CSS**
```css
/* src/components/common/MyComponent.css */
.my-component {
  /* Base styles */
  display: flex;
  padding: var(--spacing-md);
  background-color: var(--bg-secondary);
  border-radius: var(--radius-md);
  transition: all var(--transition-base);
}

.my-component-primary {
  /* Variant styles */
  background-color: var(--accent-cyan);
  color: var(--text-dark);
}

/* Responsive */
@media (max-width: 640px) {
  .my-component {
    padding: var(--spacing-sm);
  }
}
```

**Step 3: Use Component**
```javascript
import MyComponent from '../common/MyComponent';

<MyComponent variant="primary" className="additional-class">
  Content here
</MyComponent>
```

## Role-Based Access Control

### Sidebar Menu Configuration
Location: `src/components/navigation/Sidebar.jsx`

```javascript
const roleMenus = {
  admin: [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Analytics', path: '/admin/analytics', icon: '📈' },
    // ... more items
  ],
  organizer: [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Create Event', path: '/organizer/create-event', icon: '✨' },
    // ... more items
  ],
  // ... other roles
}
```

Menu automatically filters based on `useAuth().userRole`

## Performance Optimizations

1. **Code Splitting**
   - Pages are lazy-loaded with React.lazy()
   - Suspense boundaries for loading states

2. **CSS Organization**
   - Modular CSS files prevent style conflicts
   - Variables reduce redundancy
   - BEM naming prevents cascading issues

3. **Component Reusability**
   - Common components used across app
   - Reduces bundle size and maintenance

4. **Responsive CSS**
   - Mobile-first approach
   - Minimal media queries
   - CSS Grid and Flexbox (no float layouts)

## Testing Considerations

### Unit Tests (Components)
```javascript
import { render } from '@testing-library/react';
import Button from './Button';

test('renders button with text', () => {
  render(<Button>Click me</Button>);
  expect(screen.getByText('Click me')).toBeInTheDocument();
});
```

### Integration Tests (Flows)
```javascript
test('user can login and access dashboard', async () => {
  render(<App />);
  // Test full authentication flow
});
```

## Scaling Strategy

### Adding 60+ Pages

**Organization:**
```
pages/
├── auth/              # Authentication pages (2)
├── public/            # Public pages (3)
├── dashboard/         # Main dashboard (1)
├── admin/             # Admin pages (10+)
├── organizer/         # Organizer pages (15+)
├── judge/             # Judge pages (10+)
└── participant/       # Participant pages (15+)
```

**Pattern:**
1. Duplicate dashboard structure for each role
2. Use same layout components
3. Replace content with role-specific data
4. Reuse common components

### Backend Integration

Replace mock data with API calls:
```javascript
// Before (mock data)
import { mockEvents } from '../data/events';
const events = mockEvents;

// After (API)
const [events, setEvents] = useState([]);
useEffect(() => {
  fetch('/api/events').then(r => r.json()).then(setEvents);
}, []);
```

## File Size Estimates

- **Minified JS:** ~200KB (can optimize with tree-shaking)
- **CSS:** ~50KB (highly compressible)
- **Total Bundle:** ~250KB gzipped

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Mobile browsers: Latest versions
- Minimum: ES2020 JavaScript support

## Deployment

### Development
```bash
pnpm dev
```

### Production Build
```bash
pnpm build
pnpm preview
```

### Deployment Targets
- Vercel (recommended for Next.js integration)
- Netlify
- GitHub Pages
- Docker container
- Any static host + API backend

---

This architecture is designed to scale from a prototype to a full production platform with 60+ pages and real backend integration.
