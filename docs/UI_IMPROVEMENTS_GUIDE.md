# FairPlay UI/UX Improvements Guide

This guide contains all the enhanced CSS and component updates to improve the visual design and user experience of the FairPlay platform.

## How to Apply These Changes

Replace the content of each file listed below with the provided updated code. All files are vanilla CSS with no external dependencies.

---

## File 1: src/styles/global.css

Replace your existing global.css with this enhanced version that includes:
- Gradient text effect for h1 headings
- Enhanced link hover states with glow effects
- Improved typography hierarchy

```css
/* Global Styles */
@import './variables.css';
@import './animations.css';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-normal);
  line-height: var(--line-height-normal);
  color: var(--text-primary);
  background-color: var(--bg-primary);
  overflow-x: hidden;
}

/* Typography */
h1 {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
  margin-bottom: var(--spacing-md);
  background: linear-gradient(135deg, var(--text-primary) 0%, var(--accent-cyan) 50%, var(--accent-blue) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

h2 {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
  margin-bottom: var(--spacing-md);
}

h3 {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
  margin-bottom: var(--spacing-sm);
}

h4 {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-normal);
  margin-bottom: var(--spacing-sm);
}

h5 {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-normal);
  margin-bottom: var(--spacing-sm);
}

h6 {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-normal);
  margin-bottom: var(--spacing-sm);
}

p {
  margin-bottom: var(--spacing-md);
}

a {
  color: var(--accent-cyan);
  text-decoration: none;
  transition: color var(--transition-base), text-shadow var(--transition-base);
}

a:hover {
  color: var(--accent-blue);
  text-shadow: 0 0 10px rgba(0, 132, 255, 0.3);
}

button {
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  cursor: pointer;
  border: none;
  outline: none;
}

input,
textarea,
select {
  font-family: var(--font-family);
  font-size: var(--font-size-base);
}

/* Utility Classes */
.container {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--spacing-md);
}

.flex {
  display: flex;
}

.flex-col {
  display: flex;
  flex-direction: column;
}

.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.flex-center {
  display: flex;
  justify-content: center;
  align-items: center;
}

.grid {
  display: grid;
}

.gap-sm {
  gap: var(--spacing-sm);
}

.gap-md {
  gap: var(--spacing-md);
}

.gap-lg {
  gap: var(--spacing-lg);
}

.mt-sm {
  margin-top: var(--spacing-sm);
}

.mt-md {
  margin-top: var(--spacing-md);
}

.mt-lg {
  margin-top: var(--spacing-lg);
}

.mb-sm {
  margin-bottom: var(--spacing-sm);
}

.mb-md {
  margin-bottom: var(--spacing-md);
}

.mb-lg {
  margin-bottom: var(--spacing-lg);
}

.p-sm {
  padding: var(--spacing-sm);
}

.p-md {
  padding: var(--spacing-md);
}

.p-lg {
  padding: var(--spacing-lg);
}

.text-center {
  text-align: center;
}

.text-right {
  text-align: right;
}

.text-left {
  text-align: left;
}

.text-primary {
  color: var(--text-primary);
}

.text-secondary {
  color: var(--text-secondary);
}

.bg-primary {
  background-color: var(--bg-primary);
}

.bg-secondary {
  background-color: var(--bg-secondary);
}

.bg-tertiary {
  background-color: var(--bg-tertiary);
}

.opacity-50 {
  opacity: 0.5;
}

.opacity-75 {
  opacity: 0.75;
}

.cursor-pointer {
  cursor: pointer;
}

.cursor-default {
  cursor: default;
}

.transition-all {
  transition: all var(--transition-base);
}

.rounded-sm {
  border-radius: var(--radius-sm);
}

.rounded-md {
  border-radius: var(--radius-md);
}

.rounded-lg {
  border-radius: var(--radius-lg);
}

.rounded-xl {
  border-radius: var(--radius-xl);
}

.rounded-full {
  border-radius: var(--radius-full);
}

.border {
  border: 1px solid var(--border-color);
}

.border-light {
  border: 1px solid var(--border-light);
}

.shadow-sm {
  box-shadow: var(--shadow-sm);
}

.shadow-md {
  box-shadow: var(--shadow-md);
}

.shadow-lg {
  box-shadow: var(--shadow-lg);
}

.shadow-neon {
  box-shadow: var(--shadow-neon);
}

.overflow-hidden {
  overflow: hidden;
}

.overflow-auto {
  overflow: auto;
}

.no-select {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
}

/* Scrollbar Styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--bg-secondary);
}

::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: var(--radius-full);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--border-hover);
}
```

---

## File 2: src/components/common/Card.css

Enhanced with glassmorphism and improved hover effects:

```css
/* Card Component */
.card {
  background: linear-gradient(135deg, rgba(15, 20, 25, 0.7) 0%, rgba(15, 20, 25, 0.5) 100%);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(6, 182, 212, 0.1);
  border-radius: var(--radius-lg);
  transition: all var(--transition-base);
}

.card-border {
  border: 1px solid rgba(6, 182, 212, 0.15);
}

.card-padding-sm {
  padding: var(--spacing-sm);
}

.card-padding-md {
  padding: var(--spacing-md);
}

.card-padding-lg {
  padding: var(--spacing-lg);
}

/* Hover Effect */
.card-hover:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 40px rgba(6, 182, 212, 0.25);
  border-color: rgba(6, 182, 212, 0.4);
  background: linear-gradient(135deg, rgba(15, 20, 25, 0.8) 0%, rgba(15, 20, 25, 0.6) 100%);
}

/* Responsive */
@media (max-width: 640px) {
  .card {
    border-radius: var(--radius-md);
  }

  .card-padding-lg {
    padding: var(--spacing-md);
  }
}
```

---

## File 3: src/components/navigation/Navbar.css

Enhanced with glassmorphism and premium styling:

```css
/* Navbar Component */
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 70px;
  background: linear-gradient(180deg, rgba(15, 20, 25, 0.95) 0%, rgba(15, 20, 25, 0.85) 100%);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(6, 182, 212, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--spacing-lg);
  gap: var(--spacing-lg);
  z-index: 100;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

/* Left Section */
.navbar-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
}

/* Center Section */
.navbar-center {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Right Section */
.navbar-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

/* Brand */
.navbar-brand {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  background: linear-gradient(135deg, var(--text-primary) 0%, var(--accent-cyan) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-decoration: none;
  transition: all var(--transition-base);
  letter-spacing: -0.5px;
}

.navbar-brand:hover {
  transform: scale(1.05);
  text-shadow: 0 0 20px rgba(6, 182, 212, 0.3);
}

/* Hamburger Menu */
.navbar-toggle {
  display: none;
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 24px;
  cursor: pointer;
  transition: color var(--transition-base);
}

.navbar-toggle:hover {
  color: var(--accent-cyan);
}

/* Nav Item */
.navbar-item {
  color: var(--text-secondary);
  text-decoration: none;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  transition: all var(--transition-base);
  font-size: var(--font-size-sm);
}

.navbar-item:hover {
  color: var(--accent-cyan);
  background-color: rgba(6, 182, 212, 0.1);
}

/* Dropdown */
.navbar-dropdown {
  position: relative;
}

.navbar-dropdown-toggle {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  transition: all var(--transition-base);
}

.navbar-dropdown-toggle:hover {
  color: var(--accent-cyan);
  background-color: rgba(6, 182, 212, 0.1);
}

.navbar-dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  background: linear-gradient(135deg, rgba(15, 20, 25, 0.95) 0%, rgba(15, 20, 25, 0.9) 100%);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(6, 182, 212, 0.15);
  border-radius: var(--radius-lg);
  min-width: 200px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  margin-top: var(--spacing-sm);
  display: none;
  flex-direction: column;
  gap: 0;
  z-index: 101;
}

.navbar-dropdown-menu.active {
  display: flex;
}

.navbar-dropdown-item {
  padding: var(--spacing-sm) var(--spacing-lg);
  color: var(--text-secondary);
  text-decoration: none;
  transition: all var(--transition-base);
  border-bottom: 1px solid rgba(6, 182, 212, 0.05);
}

.navbar-dropdown-item:last-child {
  border-bottom: none;
}

.navbar-dropdown-item:hover {
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.1);
  padding-left: calc(var(--spacing-lg) + 4px);
}

/* Search */
.navbar-search {
  display: flex;
  align-items: center;
  background: rgba(26, 31, 46, 0.5);
  border: 1px solid rgba(6, 182, 212, 0.1);
  border-radius: var(--radius-md);
  padding: 0 var(--spacing-md);
  gap: var(--spacing-sm);
}

.navbar-search input {
  background: none;
  border: none;
  color: var(--text-primary);
  outline: none;
  width: 200px;
  padding: var(--spacing-sm) 0;
}

.navbar-search input::placeholder {
  color: var(--text-tertiary);
}

.navbar-search input:focus {
  color: var(--accent-cyan);
}

/* Responsive */
@media (max-width: 1024px) {
  .navbar-search input {
    width: 150px;
  }
}

@media (max-width: 768px) {
  .navbar {
    padding: 0 var(--spacing-md);
  }

  .navbar-center {
    display: none;
  }

  .navbar-toggle {
    display: block;
  }

  .navbar-search {
    display: none;
  }

  .navbar-right {
    gap: var(--spacing-sm);
  }
}
```

---

## File 4: src/components/navigation/Sidebar.css

Enhanced with gradient background and improved styling:

```css
/* Sidebar Navigation */
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  background: linear-gradient(180deg, rgba(15, 20, 25, 0.98) 0%, rgba(15, 20, 25, 0.95) 100%);
  border-right: 1px solid rgba(6, 182, 212, 0.1);
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease-in-out;
  z-index: 999;
  overflow-y: auto;
  box-shadow: 4px 0 20px rgba(0, 0, 0, 0.3);
}

.sidebar.collapsed {
  width: 80px;
}

.sidebar.expanded {
  width: 250px;
}

.sidebar.hidden {
  transform: translateX(-100%);
}

/* Sidebar Header */
.sidebar-header {
  padding: var(--spacing-lg);
  border-bottom: 1px solid rgba(6, 182, 212, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  display: none;
}

.sidebar.expanded .sidebar-title {
  display: block;
}

.sidebar-close {
  display: none;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 24px;
  cursor: pointer;
}

/* Sidebar Content */
.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md) 0;
}

/* Sidebar Menu */
.sidebar-menu {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.sidebar-menu-item {
  padding: 0 var(--spacing-md);
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-md);
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: var(--radius-md);
  transition: all var(--transition-base);
  position: relative;
  overflow: hidden;
}

.sidebar-link::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 4px;
  background: linear-gradient(180deg, var(--accent-cyan) 0%, var(--accent-blue) 100%);
  opacity: 0;
  transition: opacity var(--transition-base);
}

.sidebar-link:hover {
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.1);
}

.sidebar-link:hover::before {
  opacity: 1;
}

.sidebar-link.active {
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.15);
}

.sidebar-link.active::before {
  opacity: 1;
}

.sidebar-icon {
  font-size: 20px;
  min-width: 20px;
  transition: transform var(--transition-base);
}

.sidebar-link:hover .sidebar-icon {
  transform: translateX(4px);
}

.sidebar-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar.collapsed .sidebar-label {
  display: none;
}

/* Sidebar Footer */
.sidebar-footer {
  padding: var(--spacing-lg);
  border-top: 1px solid rgba(6, 182, 212, 0.1);
}

/* Sidebar Toggle */
.sidebar-toggle-btn {
  display: none;
}

/* Responsive */
@media (max-width: 1024px) {
  .sidebar {
    width: 80px;
  }

  .sidebar-label {
    display: none;
  }

  .sidebar-title {
    display: none;
  }
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    height: 100vh;
    width: 250px;
    z-index: 1001;
  }

  .sidebar.hidden {
    transform: translateX(-100%);
  }

  .sidebar-toggle-btn {
    display: block;
  }

  .sidebar-label {
    display: block;
  }

  .sidebar-title {
    display: block;
  }

  .sidebar-close {
    display: block;
  }
}
```

---

## File 5: src/components/common/Input.css

Enhanced with glassmorphism and glow effects:

```css
/* Input Component */
.input-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.input-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-base);
  font-family: var(--font-family);
  color: var(--text-primary);
  background: linear-gradient(135deg, rgba(26, 31, 46, 0.5) 0%, rgba(26, 31, 46, 0.3) 100%);
  backdrop-filter: blur(5px);
  border: 1px solid rgba(6, 182, 212, 0.15);
  border-radius: var(--radius-md);
  outline: none;
  transition: all var(--transition-base);
}

.input:hover {
  border-color: rgba(6, 182, 212, 0.25);
  background: linear-gradient(135deg, rgba(26, 31, 46, 0.6) 0%, rgba(26, 31, 46, 0.4) 100%);
}

.input:focus {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.15), 0 0 20px rgba(6, 182, 212, 0.1);
  background: linear-gradient(135deg, rgba(26, 31, 46, 0.7) 0%, rgba(26, 31, 46, 0.5) 100%);
}

.input::placeholder {
  color: var(--text-tertiary);
}

.input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Input States */
.input.error {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}

.input.success {
  border-color: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}

/* Helper Text */
.input-helper {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin-top: var(--spacing-xs);
}

.input.error ~ .input-helper {
  color: #ef4444;
}

.input.success ~ .input-helper {
  color: #10b981;
}

/* Textarea */
.textarea {
  width: 100%;
  padding: var(--spacing-md);
  font-family: var(--font-family);
  color: var(--text-primary);
  background: linear-gradient(135deg, rgba(26, 31, 46, 0.5) 0%, rgba(26, 31, 46, 0.3) 100%);
  backdrop-filter: blur(5px);
  border: 1px solid rgba(6, 182, 212, 0.15);
  border-radius: var(--radius-md);
  outline: none;
  resize: vertical;
  min-height: 120px;
  transition: all var(--transition-base);
}

.textarea:hover {
  border-color: rgba(6, 182, 212, 0.25);
}

.textarea:focus {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.15), 0 0 20px rgba(6, 182, 212, 0.1);
}

/* Responsive */
@media (max-width: 640px) {
  .input,
  .textarea {
    font-size: 16px;
  }
}
```

---

## File 6: src/components/common/Modal.css

Enhanced with glassmorphism and premium animations:

```css
/* Modal Component */
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: var(--z-modal-backdrop);
  animation: fadeIn 0.25s ease-in-out;
}

.modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: linear-gradient(135deg, rgba(15, 20, 25, 0.9) 0%, rgba(15, 20, 25, 0.8) 100%);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(6, 182, 212, 0.2);
  border-radius: var(--radius-xl);
  z-index: var(--z-modal);
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(6, 182, 212, 0.15);
  animation: scaleIn 0.3s ease-out;
}

/* Modal Header */
.modal-header {
  padding: var(--spacing-lg);
  border-bottom: 1px solid rgba(6, 182, 212, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 24px;
  cursor: pointer;
  padding: var(--spacing-sm);
  border-radius: var(--radius-md);
  transition: all var(--transition-base);
}

.modal-close:hover {
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.1);
}

/* Modal Body */
.modal-body {
  padding: var(--spacing-lg);
}

/* Modal Footer */
.modal-footer {
  padding: var(--spacing-lg);
  border-top: 1px solid rgba(6, 182, 212, 0.1);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-md);
}

/* Modal Sizes */
.modal-sm {
  width: 90%;
  max-width: 400px;
}

.modal-md {
  width: 90%;
  max-width: 600px;
}

.modal-lg {
  width: 90%;
  max-width: 800px;
}

.modal-xl {
  width: 90%;
  max-width: 1000px;
}

/* Responsive */
@media (max-width: 768px) {
  .modal {
    width: 95%;
    max-width: 95%;
  }

  .modal-header {
    padding: var(--spacing-md);
  }

  .modal-body {
    padding: var(--spacing-md);
  }

  .modal-footer {
    padding: var(--spacing-md);
    flex-direction: column;
    align-items: stretch;
  }

  .modal-footer button {
    width: 100%;
  }
}
```

---

## File 7: src/components/dashboard/StatCard.css

Enhanced with glassmorphism and floating animations:

```css
/* StatCard Component */
.stat-card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  cursor: default;
  background: linear-gradient(135deg, rgba(15, 20, 25, 0.6) 0%, rgba(15, 20, 25, 0.4) 100%);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(6, 182, 212, 0.1);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  transition: all var(--transition-base);
}

.stat-card:hover {
  border-color: rgba(6, 182, 212, 0.3);
  background: linear-gradient(135deg, rgba(15, 20, 25, 0.7) 0%, rgba(15, 20, 25, 0.5) 100%);
  box-shadow: 0 8px 32px rgba(6, 182, 212, 0.15);
  transform: translateY(-3px);
}

/* Stat Card Icon */
.stat-card-icon {
  font-size: 36px;
  opacity: 0.9;
  transition: all var(--transition-base);
  animation: float 4s ease-in-out infinite;
}

.stat-card:hover .stat-card-icon {
  transform: scale(1.15);
}

/* Stat Card Label */
.stat-card-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Stat Card Value */
.stat-card-value {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  background: linear-gradient(135deg, var(--text-primary) 0%, var(--accent-cyan) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Stat Card Trend */
.stat-card-trend {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.stat-card-trend.positive {
  color: #10b981;
}

.stat-card-trend.negative {
  color: #ef4444;
}

.stat-card-trend.neutral {
  color: var(--text-tertiary);
}

/* Responsive */
@media (max-width: 1024px) {
  .stat-card {
    padding: var(--spacing-md);
  }

  .stat-card-icon {
    font-size: 28px;
  }

  .stat-card-value {
    font-size: var(--font-size-2xl);
  }
}

@media (max-width: 640px) {
  .stat-card {
    padding: var(--spacing-md);
  }

  .stat-card-icon {
    font-size: 24px;
  }

  .stat-card-value {
    font-size: var(--font-size-xl);
  }
}
```

---

## File 8: src/pages/public/Landing.css

Enhanced feature cards with hover animations:

```css
/* Landing Page */
.landing {
  width: 100%;
  min-height: 100vh;
  background-color: var(--bg-primary);
}

/* Hero Section */
.landing-hero {
  padding: 100px var(--spacing-lg) var(--spacing-xl);
  text-align: center;
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, rgba(0, 132, 255, 0.05) 100%);
}

.landing-hero h1 {
  font-size: var(--font-size-5xl);
  margin-bottom: var(--spacing-lg);
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
}

.landing-hero p {
  font-size: var(--font-size-lg);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-lg);
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.landing-hero-buttons {
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xl);
}

/* Features Section */
.landing-features {
  padding: var(--spacing-xl) var(--spacing-lg);
}

.landing-features-title {
  text-align: center;
  margin-bottom: var(--spacing-xl);
}

.landing-features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--spacing-lg);
  max-width: 1200px;
  margin: 0 auto;
}

.landing-feature-card {
  text-align: center;
  padding: var(--spacing-lg);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, rgba(0, 132, 255, 0.05) 100%);
  backdrop-filter: blur(10px);
  transition: all var(--transition-base);
  position: relative;
  overflow: hidden;
}

.landing-feature-card::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 70%);
  opacity: 0;
  transition: opacity var(--transition-base);
}

.landing-feature-card:hover {
  border-color: var(--accent-cyan);
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(0, 132, 255, 0.1) 100%);
  box-shadow: 0 8px 32px rgba(6, 182, 212, 0.15);
  transform: translateY(-4px);
}

.landing-feature-card:hover::before {
  opacity: 1;
}

.landing-feature-icon {
  font-size: 48px;
  margin-bottom: var(--spacing-md);
  display: block;
  animation: bounce 0.6s ease-in-out infinite;
}

.landing-feature-card:hover .landing-feature-icon {
  animation: none;
  transform: scale(1.15);
}

.landing-feature-card h3 {
  color: var(--text-primary);
  margin-bottom: var(--spacing-sm);
  font-weight: 600;
}

.landing-feature-card p {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.6;
}

/* Statistics Section */
.landing-stats {
  padding: var(--spacing-xl) var(--spacing-lg);
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, rgba(0, 132, 255, 0.05) 100%);
}

.landing-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacing-lg);
  max-width: 1200px;
  margin: 0 auto;
}

.landing-stat {
  text-align: center;
}

.landing-stat-number {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  color: var(--accent-cyan);
  margin-bottom: var(--spacing-sm);
}

.landing-stat-label {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
}

/* Categories Section */
.landing-categories {
  padding: var(--spacing-xl) var(--spacing-lg);
}

.landing-categories-title {
  text-align: center;
  margin-bottom: var(--spacing-xl);
}

.landing-categories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--spacing-lg);
  max-width: 1200px;
  margin: 0 auto;
}

.landing-category {
  padding: var(--spacing-lg);
  border: 1px solid rgba(6, 182, 212, 0.1);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(15, 20, 25, 0.5) 0%, rgba(15, 20, 25, 0.3) 100%);
  backdrop-filter: blur(10px);
  cursor: pointer;
  transition: all var(--transition-base);
}

.landing-category:hover {
  border-color: var(--accent-cyan);
  transform: translateY(-4px);
  box-shadow: 0 8px 32px rgba(6, 182, 212, 0.15);
}

.landing-category-icon {
  font-size: 36px;
  margin-bottom: var(--spacing-md);
}

.landing-category-name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin-bottom: var(--spacing-sm);
}

.landing-category-description {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

/* Testimonials Section */
.landing-testimonials {
  padding: var(--spacing-xl) var(--spacing-lg);
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, rgba(0, 132, 255, 0.05) 100%);
}

.landing-testimonials-title {
  text-align: center;
  margin-bottom: var(--spacing-xl);
}

.landing-testimonials-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--spacing-lg);
  max-width: 1200px;
  margin: 0 auto;
}

.landing-testimonial {
  padding: var(--spacing-lg);
  border: 1px solid rgba(6, 182, 212, 0.1);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(15, 20, 25, 0.5) 0%, rgba(15, 20, 25, 0.3) 100%);
  backdrop-filter: blur(10px);
}

.landing-testimonial-text {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-md);
  line-height: 1.8;
}

.landing-testimonial-author {
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.landing-testimonial-role {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

/* CTA Section */
.landing-cta {
  padding: var(--spacing-xl) var(--spacing-lg);
  text-align: center;
}

.landing-cta h2 {
  margin-bottom: var(--spacing-lg);
  font-size: var(--font-size-3xl);
}

.landing-cta p {
  font-size: var(--font-size-lg);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-lg);
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

/* Footer */
.landing-footer {
  padding: var(--spacing-lg);
  border-top: 1px solid rgba(6, 182, 212, 0.1);
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

/* Responsive */
@media (max-width: 768px) {
  .landing-hero {
    padding: 60px var(--spacing-md) var(--spacing-lg);
  }

  .landing-hero h1 {
    font-size: var(--font-size-3xl);
  }

  .landing-hero-buttons {
    flex-direction: column;
  }

  .landing-features,
  .landing-stats,
  .landing-categories,
  .landing-testimonials,
  .landing-cta {
    padding: var(--spacing-lg) var(--spacing-md);
  }
}

@media (max-width: 480px) {
  .landing-hero h1 {
    font-size: var(--font-size-2xl);
  }

  .landing-hero p {
    font-size: var(--font-size-base);
  }

  .landing-feature-icon {
    font-size: 32px;
  }

  .landing-stat-number {
    font-size: var(--font-size-2xl);
  }
}
```

---

## File 9: src/pages/dashboard/Dashboard.css

Enhanced activity items styling:

```css
/* Dashboard Page */
.dashboard {
  padding: 100px var(--spacing-lg) var(--spacing-lg);
}

/* Dashboard Header */
.dashboard-header {
  margin-bottom: var(--spacing-xl);
}

.dashboard-title {
  font-size: var(--font-size-3xl);
  margin-bottom: var(--spacing-sm);
}

.dashboard-subtitle {
  color: var(--text-secondary);
  font-size: var(--font-size-base);
}

/* Stats Grid */
.dashboard-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
}

/* Content Grid */
.dashboard-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-lg);
}

/* Activity Section */
.dashboard-activity {
  border: 1px solid rgba(6, 182, 212, 0.1);
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(15, 20, 25, 0.7) 0%, rgba(15, 20, 25, 0.5) 100%);
  backdrop-filter: blur(10px);
  overflow: hidden;
}

.activity-header {
  padding: var(--spacing-lg);
  border-bottom: 1px solid rgba(6, 182, 212, 0.1);
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, rgba(0, 132, 255, 0.05) 100%);
}

.activity-header h3 {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.activity-list {
  display: flex;
  flex-direction: column;
  max-height: 400px;
  overflow-y: auto;
}

.activity-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-lg);
  padding: var(--spacing-md);
  border-left: 2px solid var(--accent-cyan);
  border-radius: 4px;
  background: linear-gradient(90deg, rgba(6, 182, 212, 0.05) 0%, transparent 100%);
  transition: all var(--transition-base);
  border-bottom: 1px solid rgba(6, 182, 212, 0.05);
}

.activity-item:hover {
  background: linear-gradient(90deg, rgba(6, 182, 212, 0.1) 0%, transparent 100%);
  border-left-color: var(--accent-blue);
  padding-left: calc(var(--spacing-md) + 2px);
}

.activity-icon {
  font-size: 20px;
  min-width: 20px;
  color: var(--accent-cyan);
  margin-top: 4px;
  transition: all var(--transition-base);
}

.activity-item:hover .activity-icon {
  color: var(--accent-blue);
  transform: scale(1.2);
}

.activity-content {
  flex: 1;
  min-width: 0;
}

.activity-text {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.6;
}

.activity-text strong {
  color: var(--text-primary);
  font-weight: 600;
}

.activity-time {
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
  margin-top: var(--spacing-xs);
}

/* Responsive */
@media (max-width: 1024px) {
  .dashboard-content {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .dashboard {
    padding: 100px var(--spacing-md) var(--spacing-md);
  }

  .dashboard-stats {
    grid-template-columns: 1fr;
  }

  .dashboard-title {
    font-size: var(--font-size-2xl);
  }
}
```

---

## File 10: src/styles/animations.css (Additional Animations)

Add these new animations at the end of your animations.css file:

```css
/* Glow Effect */
@keyframes glow {
  0%, 100% {
    box-shadow: 0 0 10px rgba(6, 182, 212, 0.3);
  }
  50% {
    box-shadow: 0 0 20px rgba(6, 182, 212, 0.5);
  }
}

/* Scale Bounce */
@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Bounce Animation */
@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

/* Float Animation */
@keyframes float {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-20px);
  }
}
```

---

## How to Apply These Changes

1. **Back up your original files** before making changes
2. **Replace each CSS file** with the updated content provided above
3. **Clear browser cache** or do a hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
4. **Test all pages** to ensure animations and styles work correctly

## What's Improved

✨ **Glassmorphism Effects** - All major UI elements now have the glass effect with blur
✨ **Gradient Text** - H1 headings and branding have cyan-to-blue gradients
✨ **Enhanced Hover States** - Cards, buttons, and links have smooth hover animations
✨ **Glowing Effects** - Inputs and modals have neon glow on focus
✨ **Floating Animations** - Icons float smoothly
✨ **Premium Shadows** - Improved depth and layering
✨ **Better Transitions** - All interactions are smooth at 0.3s
✨ **Responsive Design** - All improvements work on mobile, tablet, and desktop
