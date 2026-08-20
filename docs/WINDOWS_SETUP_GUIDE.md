# FairPlay Setup Guide for Windows

## Current Status
You're in the correct directory: `C:\Users\Carlo\fairplay-events`

## What You Need to Do

### Step 1: Install Dependencies (5 minutes)
Run this command in PowerShell:

```powershell
npm install
```

This will:
- Download React and React Router from npm
- Create node_modules folder (may take 2-3 minutes)
- Set up all dependencies

Wait for it to complete. You should see: `added X packages`

### Step 2: Start the Development Server (2 minutes)

Now run:

```powershell
npm start
```

OR alternative (same thing):

```powershell
npm run dev
```

You should see output like:
```
  VITE v5.0.0  ready in 123 ms

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

### Step 3: Open in Browser

Open your browser and go to:
```
http://localhost:5173/
```

You should see the **FairPlay Premium Landing Page**

### Step 4: Test Login

Click "Get Started" button and you'll be taken to login page.

Use these demo credentials (password can be anything):
- **Admin**: admin@fairplay.com
- **Organizer**: organizer@fairplay.com
- **Judge**: judge@fairplay.com
- **Participant**: participant@fairplay.com

Example:
- Email: `organizer@fairplay.com`
- Password: `password123` (or anything)
- Role: Select "Organizer"
- Click "Sign In"

### Step 5: Explore the App

After login, you can:
- View the dashboard at `/dashboard`
- Create events at `/organizer/create-event`
- View leaderboards
- Check QR scanner
- View tournament brackets

---

## Troubleshooting

### Issue: "npm is not recognized"
**Solution**: Node.js is not installed
- Download from https://nodejs.org/
- Install the LTS version
- Restart PowerShell after installation
- Try `npm --version` to verify

### Issue: "Port 5173 already in use"
**Solution**: Another app is using the port
- Run: `npm start -- --port 5174`
- Then open: `http://localhost:5174/`

### Issue: "FATAL ERROR: Cannot allocate memory"
**Solution**: Clear npm cache
```powershell
npm cache clean --force
npm install
```

### Issue: Blank page or errors in console
**Solution**: Hard refresh browser
- Press: `Ctrl + Shift + R` (Windows)
- Or clear browser cache

---

## File Structure

```
fairplay-events/
├── src/
│   ├── pages/              # All page components
│   │   ├── public/         # Landing, login, register
│   │   ├── dashboard/      # Dashboard pages
│   │   └── organizer/      # Organizer pages
│   ├── components/         # Reusable components
│   │   ├── common/         # Button, Card, Input, etc.
│   │   ├── navigation/     # Sidebar, Navbar
│   │   ├── leaderboard/    # Leaderboard component
│   │   ├── qr/            # QR Scanner component
│   │   └── brackets/      # Tournament Bracket
│   ├── styles/            # CSS files
│   ├── context/           # Auth, Notifications
│   ├── hooks/             # Custom hooks
│   ├── data/              # Mock data
│   ├── utils/             # Utilities
│   ├── routes/            # React Router config
│   ├── App.jsx            # Main app component
│   └── main.jsx           # Entry point
├── index.html             # HTML template
├── package.json           # Dependencies
├── vite.config.js         # Vite configuration
└── README.md              # Documentation
```

---

## Common Commands

```powershell
# Start development server
npm start

# Build for production
npm run build

# Preview production build
npm run preview

# Check installed packages
npm list

# Update packages
npm update

# Clear cache
npm cache clean --force
```

---

## What Happens When You Run npm install

1. npm reads `package.json`
2. Downloads React, React Router, and other dependencies
3. Creates `node_modules` folder (big!)
4. Creates `package-lock.json` (do not edit this)
5. Done!

**Important**: Do NOT edit `node_modules` - it's auto-generated

---

## Next Steps After Setup

1. Explore the landing page at `http://localhost:5173/`
2. Login with demo credentials
3. Check out the dashboard
4. Try creating an event at `/organizer/create-event`
5. View leaderboards, QR scanner, and brackets
6. Read INDEX.md for documentation guide
7. Read START_HERE.md for next steps

---

## Need Help?

If something doesn't work:

1. Check the browser console for errors (F12)
2. Check the PowerShell output for errors
3. Try restarting: Stop with Ctrl+C, then `npm start` again
4. Clear cache: `npm cache clean --force`
5. Reinstall: Delete `node_modules` and run `npm install` again

---

## System Requirements

- Windows 10 or later
- Node.js 16+ (check with `node --version`)
- npm 7+ (comes with Node.js)
- Modern browser (Chrome, Firefox, Safari, Edge)
- Internet connection for first npm install

You have everything you need! ✓

---

Let me know when you've completed Step 1 (npm install) and Step 2 (npm start) successfully!
