# FairPlay Setup Instructions

## Quick Start (3 Steps)

### Step 1: Install Dependencies
Open PowerShell in your `fairplay-events` folder and run:

```bash
npm install
```

This will install:
- React 19
- React Router DOM 6
- Vite (build tool)
- React development tools

### Step 2: Start Development Server
Run one of these commands:

```bash
npm start
```

OR

```bash
npm run dev
```

Both commands do the same thing - start the Vite development server.

### Step 3: Open in Browser
The app will open automatically at: **http://localhost:5173**

If it doesn't open, manually go to that URL in your browser.

---

## Troubleshooting

### Issue: "npm: The term 'npm' is not recognized"
**Solution:** Node.js is not installed
- Download and install from https://nodejs.org/
- Restart PowerShell after installation
- Run `node --version` to verify

### Issue: "Port 5173 is already in use"
**Solution:** Kill the existing process
```bash
npx kill-port 5173
npm start
```

### Issue: "Missing modules" error
**Solution:** Dependencies not fully installed
```bash
rm -r node_modules
rm package-lock.json
npm install
npm start
```

### Issue: "Cannot find module 'react'"
**Solution:** Run `npm install` again and wait for all packages to complete

---

## Available Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start development server (Vite) |
| `npm run dev` | Same as `npm start` |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

---

## Project Structure

```
fairplay-events/
├── src/
│   ├── components/          # Reusable React components
│   ├── pages/               # Page components
│   ├── styles/              # CSS files
│   ├── data/                # Mock data
│   ├── context/             # React Context
│   ├── hooks/               # Custom hooks
│   ├── utils/               # Utility functions
│   ├── routes/              # Route configuration
│   ├── App.jsx              # Main app component
│   └── main.jsx             # Entry point
├── index.html               # HTML template
├── vite.config.js           # Vite config
└── package.json             # Project config
```

---

## Testing the App

Once `npm start` is running:

1. Open http://localhost:5173
2. You should see the **Premium Landing Page**
3. Click "Login" button
4. Choose a role (Admin, Organizer, Judge, Participant)
5. Enter any email and password (mock auth)
6. Click "Sign In" - you'll be redirected to the dashboard

---

## Demo Accounts

All of these work with any password:

| Email | Role |
|-------|------|
| admin@fairplay.com | Admin |
| organizer@fairplay.com | Organizer |
| judge@fairplay.com | Judge |
| participant@fairplay.com | Participant |

---

## Next Steps

After the app is running:

1. Explore the landing page
2. Test the login flow
3. Check the dashboard
4. Review the code in `src/` folder
5. Read `INDEX.md` for documentation
6. Customize colors in `src/styles/variables.css`

---

## Windows PowerShell Tips

If you get permission errors:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then run commands again.

---

## Need Help?

1. Check `DELIVERY_SUMMARY.txt` for what was delivered
2. Read `README_IMPROVEMENTS.md` for detailed info
3. Check `QUICK_START_NEW_FEATURES.md` for component examples
4. Look at console (F12) for any error messages

---

Happy coding! 🚀
