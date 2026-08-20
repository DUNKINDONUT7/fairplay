# 🚀 FairPlay - Quick Start Guide

## System Requirements
- Node.js v11+ (already installed)
- npm (comes with Node.js)
- Any modern web browser

## Installation & Running (Zero-Config)

### Option 1: Automatic Setup (Recommended)
```bash
cd fairplay
npm install
npm run dev
```
The app will start on `http://localhost:3002` (or next available port)

### Option 2: Manual Build & Run
```bash
npm install        # Install dependencies
npm run dev        # Start development server
```

## 🔐 Demo Accounts for Testing

### Admin Account
- **Email:** admin@fairplay.com
- **Password:** admin123

### Organizer Account
- **Email:** organizer@fairplay.com
- **Password:** organizer123

### Judge Account
- **Email:** judge@fairplay.com
- **Password:** judge123

### Participant Account
- **Email:** participant@fairplay.com
- **Password:** participant123

## 📋 Features to Test

### Public Pages
- ✅ Landing Page (Home)
- ✅ Features Overview
- ✅ Event Types showcase
- ✅ Call-to-Action sections

### Authentication
- ✅ User Login with role-based routing
- ✅ User Registration
- ✅ Session persistence

### Dashboards (Protected Routes)
- ✅ Main Dashboard with analytics
- ✅ Role-specific navigation
- ✅ Event creation (Organizer)
- ✅ Event management

### Real-Time Features
- ✅ Live notifications system
- ✅ User profile management
- ✅ Settings dashboard

## 🎯 Key Routes

| Route | Access | Purpose |
|-------|--------|---------|
| `/` | Public | Landing page |
| `/login` | Public | User login |
| `/register` | Public | New user registration |
| `/dashboard` | Protected | Main user dashboard |
| `/organizer/create-event` | Organizer | Create new event |
| `/profile` | Protected | User profile |
| `/settings` | Protected | User settings |

## ⚙️ Build for Production

To create a production build:
```bash
npm run build
npm run preview
```

## 🐛 Troubleshooting

### White screen appears?
- Check browser console (F12) for errors
- Ensure port 3002 is not in use (try `netstat -ano | findstr :3002`)
- Clear browser cache and refresh (Ctrl+Shift+Delete)
- Restart the dev server

### Port already in use?
The app automatically tries ports 3000, 3001, 3002, etc. If you want a specific port:
```bash
npm run dev -- --port 5173
```

### Dependencies issues?
```bash
rm -r node_modules package-lock.json
npm install
npm run dev
```

## 📱 Responsive Design
The application is fully responsive and works on:
- ✅ Desktop (1920px and up)
- ✅ Tablet (768px - 1024px)
- ✅ Mobile (320px - 767px)

## 🎨 UI/UX Features
- Modern dark-themed interface with cyan accents
- Smooth animations and transitions
- Real-time notifications
- Intuitive navigation
- Role-based UI customization
- Responsive layouts

## 📊 Technology Stack
- **Frontend:** React 19 + Vite
- **Routing:** React Router v6
- **Styling:** CSS3 with CSS Variables
- **State:** React Hooks + Context API
- **Package Manager:** npm

---

**Status:** ✅ Fully Functional | Ready for Local Testing
