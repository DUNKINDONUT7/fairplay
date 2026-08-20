# Task Plan: Complete All Sidebar Buttons & Fix Routing

## Current State
The app (`src/main.jsx` → `src/App.jsx`) already has most routes defined and page files exist. However, there are issues:

## Issues Found

1. **Bug in `src/pages/BracketsPage.jsx`** - line 98: `roundMatches = ...` missing `let`/`const` declaration
2. **Auth flow issue**: `AuthModal.jsx` passes password but `authStore.login()` only uses email
3. **Missing routes** for `/judge/score/:sessionId` and `/judge/session/:sessionId` in App.jsx
4. **Missing `!important` fallback** routes - some sidebar items might error if pages crash

## Plan
1. Fix BracketsPage.jsx variable declaration
2. Fix AuthModal.jsx to match authStore login signature
3. Add missing route for judge session
4. Remove unused legacy `App.tsx` that could cause confusion
5. Test all sidebar buttons navigate correctly
6. Verify all pages load without errors