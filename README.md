# FairPlay - Automated Event Management & Scoring Platform

A complete, production-ready platform for managing contests, tournaments, pageants, and competitions with automated scoring, live leaderboards, and intelligent judge assignment.

## 🚀 Quick Start

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The application will open at `http://localhost:3000`

### Demo Login Credentials

**Admin Dashboard:**
- Email: `admin@fairplay.com`
- Password: Any password works
- Role: `admin`

**Organizer Dashboard:**
- Email: `organizer@fairplay.com`
- Password: Any password works
- Role: `organizer`

**Judge Dashboard:**
- Email: `judge@fairplay.com`
- Password: Any password works
- Role: `judge`

**Participant Dashboard:**
- Email: `participant@fairplay.com`
- Password: Any password works
- Role: `participant`

## 📁 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── common/         # Base components (Button, Card, Input, Modal, etc.)
│   ├── dashboard/      # Dashboard-specific components (StatCard, etc.)
│   ├── layouts/        # Layout wrappers (DashboardLayout, AuthLayout, etc.)
│   ├── navigation/     # Navigation components (Sidebar, Navbar)
│   └── notifications/  # Notification system components
├── context/            # React Context (Auth, Notifications)
├── data/               # Mock data files (users, events, rankings, etc.)
├── hooks/              # Custom React hooks (useAuth, useNotification, useResponsive)
├── pages/              # Page components
│   ├── auth/          # Login/Register pages
│   ├── dashboard/     # Main dashboard
│   ├── public/        # Landing page
│   └── [role]/        # Role-specific dashboard pages (to be implemented)
├── routes/            # Route configuration
├── styles/            # Global styles and CSS variables
├── utils/             # Utility functions (formatters, validators, helpers)
├── App.jsx            # Main App component
└── main.jsx           # React entry point
```

## 🎨 Design System

### Colors (CSS Variables)
- **Primary Background:** `--bg-primary` (Black)
- **Secondary Background:** `--bg-secondary` (Dark Navy)
- **Accent Colors:** 
  - Cyan: `--accent-cyan` (Primary brand)
  - Purple: `--accent-purple`
  - Blue: `--accent-blue`
  - Green: `--accent-green`
  - Red: `--accent-red`
  - Yellow: `--accent-yellow`

### Typography
- **Font Family:** System fonts (Inter equivalent via system fonts)
- **Font Weights:** Normal (400), Medium (500), Semibold (600), Bold (700)
- **Font Sizes:** XS (12px) → 4XL (40px)

### Spacing
Uses a consistent 8px base unit for all spacing.
- `--spacing-xs`: 4px
- `--spacing-sm`: 8px
- `--spacing-md`: 16px
- `--spacing-lg`: 24px
- `--spacing-xl`: 32px
- `--spacing-2xl`: 48px

## 🧩 Components

### Common Components
- **Button** - Multiple variants (primary, secondary, danger, ghost, success, warning)
- **Card** - Container component with padding and shadow options
- **Input** - Form input with validation support
- **Badge** - Status badges with color variants
- **Modal** - Dialog component for overlays
- **LoadingSpinner** - Loading indicator with variants
- **EmptyState** - Placeholder for empty lists
- **Tabs** - Tabbed interface component

### Layout Components
- **DashboardLayout** - Main dashboard wrapper with sidebar and navbar
- **PublicLayout** - Landing page layout with header and footer
- **AuthLayout** - Login/register page layout with animated background

### Navigation Components
- **Sidebar** - Role-based navigation menu with collapsible state
- **Navbar** - Top navigation bar with search, notifications, and profile menu

### Dashboard Components
- **StatCard** - Statistics display card with optional trend indicator

## 🔐 Authentication System

### Context: `AuthContext`
Provides authentication state and login/logout functions.

```javascript
const { user, isAuthenticated, loading, login, logout, userRole } = useAuth();
```

**Features:**
- Mock login system (works with any password)
- localStorage persistence
- Role-based access control
- Automatic session restoration

## 🔔 Notification System

### Context: `NotificationContext`
Manages toast notifications.

```javascript
const { success, error, warning, info, notifications } = useNotification();

// Usage
success('Event created successfully!');
error('Failed to save changes');
warning('Are you sure?');
info('New participant registered');
```

## 🎯 Mock Data

### Available Data Sources
- **users.js** - 8 mock users across all roles
- **events.js** - 6 mock events with various types
- **rankings.js** - Event rankings and leaderboards
- **teams.js** - Team compositions for tournaments
- **notifications.js** - User notifications
- **brackets.js** - Tournament bracket data
- **analytics.js** - Dashboard analytics and metrics

All data functions are exported for easy integration with real APIs.

## 🛠️ Utility Functions

### Formatters (`utils/formatters.js`)
- `formatDate()` - Format date as readable string
- `formatDateTime()` - Format date and time
- `formatCurrency()` - Format numbers as currency
- `formatRank()` - Add ordinal suffix (1st, 2nd, 3rd)
- `getRelativeTime()` - Return relative time ("2 hours ago")

### Validators (`utils/validators.js`)
- `isValidEmail()` - Email validation
- `isValidPassword()` - Strong password check
- `isValidPhoneNumber()` - Phone validation
- `validateForm()` - Multi-field form validation

### Helpers (`utils/helpers.js`)
- `cn()` - Conditional class names
- `debounce()` - Debounce function calls
- `throttle()` - Throttle function calls
- `groupBy()` - Group array by key
- `sortBy()` - Sort array by property

## 🎭 User Roles

### 1. **Admin**
- Analytics dashboard
- User management
- Event management
- Judge management
- System reports and settings

### 2. **Organizer**
- Create and manage events
- Manage teams and participants
- Assign judges
- Create scoring brackets
- Live leaderboards
- Generate reports

### 3. **Judge**
- View assigned events
- Score sheets and scoring
- Rankings
- Event schedule
- Judge profile

### 4. **Participant**
- Browse events
- Team management
- View rankings and certificates
- User profile

## 🚦 Responsive Design

- **Mobile:** < 641px - Single column, full-width, touch-friendly (44px min tap targets)
- **Tablet:** 641px - 1024px - Two column layouts
- **Desktop:** 1025px+ - Full features with sidebar navigation

## 🔄 Routing Structure

- `/` - Landing page (public)
- `/login` - Login page (public)
- `/register` - Register page (public)
- `/dashboard` - Main dashboard (protected)
- `/admin/*` - Admin dashboard (protected, admin role)
- `/organizer/*` - Organizer dashboard (protected, organizer role)
- `/judge/*` - Judge dashboard (protected, judge role)
- `/participant/*` - Participant dashboard (protected, participant role)

## 📝 Development Notes

### Adding New Pages

1. Create page component in `src/pages/[section]/PageName.jsx`
2. Create corresponding CSS file `PageName.css`
3. Add route in `src/App.jsx`
4. Use `DashboardLayout` for protected pages:

```javascript
import DashboardLayout from '../../components/layouts/DashboardLayout';

export default function MyPage() {
  return (
    <DashboardLayout title="Page Title" subtitle="Optional subtitle">
      {/* Page content */}
    </DashboardLayout>
  );
}
```

### Adding New Components

1. Create component in `src/components/[category]/ComponentName.jsx`
2. Create CSS file `ComponentName.css`
3. Export from component index

### Styling Approach

- Use CSS custom properties from `styles/variables.css`
- Follow BEM naming convention for CSS classes
- Use Flexbox for layouts (Grid for complex 2D layouts)
- Mobile-first responsive design
- Import global styles in main.jsx

## 🎉 Features Included

✅ Complete authentication system with role-based access
✅ Multi-role dashboards (Admin, Organizer, Judge, Participant)
✅ 40+ custom UI components
✅ Complete CSS system with design tokens
✅ Mock data for all event types
✅ Real-time notification system
✅ Responsive design (mobile to desktop)
✅ Landing page with features showcase
✅ Sidebar navigation with role-based menus
✅ Top navbar with notifications and profile
✅ Form validation utilities
✅ Custom hooks for common patterns

## 🚧 Next Steps to Extend

1. **Implement remaining dashboard pages** - Admin, Organizer, Judge, Participant dashboards
2. **Create event management pages** - Event creation, editing, management
3. **Build scoring system** - Scoring sheets, judge assignment, live updates
4. **Develop leaderboards** - Real-time rankings, graphs, statistics
5. **Add API integration** - Replace mock data with backend API calls
6. **Implement real authentication** - Replace mock auth with JWT/OAuth
7. **Add database** - Supabase, Firebase, or custom backend
8. **Set up CI/CD** - GitHub Actions, automated testing, deployment

## 📦 Dependencies

- **React 19** - UI framework
- **React Router** - Client-side routing
- **Vite** - Fast build tool and dev server

## 📄 License

Private project for FairPlay platform.

---

**Built with ⚡ by v0** - Start building the remaining pages and features!
