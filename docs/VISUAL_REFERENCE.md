# Visual Reference & Component Gallery

## Color Scheme

### Primary Colors
```
Cyan (Accent):     #06b6d4  ████████████████
Blue (Secondary):  #0084ff  ████████████████
Purple:            #9333ea  ████████████████
```

### Background Colors
```
Primary:   #000000  ████████████████
Secondary: #0f1419  ████████████████
Tertiary:  #1a1f2e  ████████████████
```

### Text Colors
```
Primary:   #ffffff  ████████████████
Secondary: #a0aec0  ████████████████
Tertiary:  #7c8998  ████████████████
```

### Status Colors
```
Success:   #10b981  ████████████████ (Green)
Warning:   #f59e0b  ████████████████ (Amber)
Error:     #ef4444  ████████████████ (Red)
Gold:      #ffc107  ████████████████ (1st Place)
Silver:    #c0c0c0  ████████████████ (2nd Place)
Bronze:    #cd7f32  ████████████████ (3rd Place)
```

---

## Typography Hierarchy

### H1 - Hero Titles
```
Font Size:  72px
Weight:     800
Style:      Gradient (white → cyan → blue)
Letter Spacing: -1px
Example:    "Fair Play"
```

### H2 - Section Titles
```
Font Size:  48px
Weight:     700
Color:      #ffffff
Letter Spacing: normal
Example:    "Event Management"
```

### H3 - Component Titles
```
Font Size:  24px
Weight:     600
Color:      #ffffff
Example:    "Create New Event"
```

### Body Text
```
Font Size:  16px
Weight:     400
Color:      #a0aec0
Line Height: 1.6
Example:    "Event description text"
```

### Small Text
```
Font Size:  14px
Weight:     500
Color:      #a0aec0
Example:    "Helper text"
```

---

## Component Styles

### Cards (Glassmorphism)
```
Background:     linear-gradient(135deg, rgba(15, 20, 25, 0.7), rgba(15, 20, 25, 0.5))
Backdrop Filter: blur(10px)
Border:         1px solid rgba(6, 182, 212, 0.1)
Border Radius:  16px
Padding:        20-30px
Shadow:         0 8px 32px rgba(6, 182, 212, 0.15)
Transition:     all 0.3s ease
Hover Shadow:   0 12px 40px rgba(6, 182, 212, 0.25)
```

### Buttons

#### Primary Button
```
Background:     linear-gradient(135deg, #06b6d4, #0084ff)
Color:          #ffffff
Padding:        12px 24px
Font Weight:    600
Border Radius:  8px
Cursor:         pointer
Hover Transform: translateY(-2px)
Hover Shadow:   0 8px 24px rgba(6, 182, 212, 0.3)
```

#### Secondary Button
```
Background:     rgba(6, 182, 212, 0.1)
Border:         1px solid rgba(6, 182, 212, 0.2)
Color:          #a0aec0
Padding:        12px 24px
Hover Background: rgba(6, 182, 212, 0.15)
Hover Color:    #06b6d4
```

### Inputs
```
Background:     linear-gradient(135deg, rgba(26, 31, 46, 0.5), rgba(26, 31, 46, 0.3))
Backdrop Filter: blur(5px)
Border:         1px solid rgba(6, 182, 212, 0.15)
Border Radius:  8px
Padding:        10px 12px
Color:          #ffffff
Font Size:      14px
Focus Border:   rgba(6, 182, 212, 1)
Focus Shadow:   0 0 0 3px rgba(6, 182, 212, 0.15), 0 0 20px rgba(6, 182, 212, 0.1)
```

### Badges & Status

#### Status Badge - Success
```
Background:     rgba(16, 185, 129, 0.2)
Color:          #10b981
Border:         1px solid rgba(16, 185, 129, 0.3)
Padding:        4px 12px
Border Radius:  20px
Font Size:      12px
Font Weight:    600
```

#### Status Badge - Active
```
Background:     rgba(6, 182, 212, 0.2)
Color:          #06b6d4
Border:         1px solid rgba(6, 182, 212, 0.3)
```

#### Status Badge - Pending
```
Background:     rgba(245, 158, 11, 0.2)
Color:          #f59e0b
Border:         1px solid rgba(245, 158, 11, 0.3)
```

---

## Animations

### Glow Effect
```css
@keyframes glow {
  0%, 100% { box-shadow: 0 0 10px rgba(6, 182, 212, 0.3); }
  50% { box-shadow: 0 0 20px rgba(6, 182, 212, 0.5); }
}
Duration: 1.5s
Timing: ease-in-out
Iteration: infinite
```

### Scale In
```css
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}
Duration: 0.6s
Timing: ease-out
```

### Bounce
```css
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
Duration: varies
Timing: ease-in-out
Iteration: infinite
```

### Float
```css
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-20px); }
}
Duration: 4s
Timing: ease-in-out
Iteration: infinite
```

---

## Spacing System

```
xs: 4px   - Minimal spacing (borders, padding)
sm: 8px   - Small gaps between elements
md: 16px  - Standard padding/margins
lg: 24px  - Large spacing between sections
xl: 32px  - Extra large spacing
2xl: 48px - Massive spacing
3xl: 64px - Page-level spacing
```

---

## Shadow System

```
Shadow Light:   0 4px 6px rgba(0, 0, 0, 0.1)
Shadow Medium:  0 8px 16px rgba(0, 0, 0, 0.2)
Shadow Large:   0 12px 24px rgba(0, 0, 0, 0.3)
Shadow XL:      0 20px 40px rgba(0, 0, 0, 0.4)
Cyan Glow:      0 8px 32px rgba(6, 182, 212, 0.15)
Cyan Glow XL:   0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(6, 182, 212, 0.15)
```

---

## Layout Grid

### Desktop (1025px+)
```
- 12 column grid
- Gap: 24px
- Max width: 1400px
- Padding: 40px sides
```

### Tablet (641px-1024px)
```
- 8 column grid
- Gap: 20px
- Padding: 30px sides
```

### Mobile (0-640px)
```
- Single column
- Gap: 16px
- Padding: 20px sides
```

---

## Component Patterns

### Landing Page Hero
```
Layout:         Flex row (desktop), column (mobile)
Content Width:  600px max
Spacing:        60px between sections
Animation:      slideInLeft (content), float (visual)
```

### Feature Cards Grid
```
Columns:        3 (desktop), 2 (tablet), 1 (mobile)
Gap:            30px
Card Height:    auto
Hover Effect:   translateY(-8px), shadow increase
```

### Leaderboard
```
Layout:         Table with 5 columns
Header:         Sticky top, glassmorphic
Rows:           Striped, hover highlight
Status:         Color coded by type
Animation:      slideInRight (rows)
```

### Bracket
```
Layout:         Horizontal scroll container
Match Boxes:    Fixed 200px width
Spacing:        30px between columns
Hover:          Highlight with shadow
Interactive:    Clickable, advance buttons
```

---

## Button Sizes

### Small
```
Padding:  8px 16px
Font:     14px
Height:   32px
```

### Medium (Default)
```
Padding:  12px 24px
Font:     16px
Height:   40px
```

### Large
```
Padding:  16px 32px
Font:     18px
Height:   48px
```

---

## Border Radius

```
sm: 4px    - Small buttons, inputs
md: 8px    - Form elements, small cards
lg: 12px   - Medium cards, modals
xl: 16px   - Large components
full: 50%  - Circles, avatars
```

---

## Transitions & Durations

```
Fast:     0.15s (hover effects)
Base:     0.3s (standard transitions)
Slow:     0.5s (entrance animations)
XSlow:    0.8s (hero animations)
```

---

## Cursor States

```
Default:      pointer
Interactive:  pointer
Disabled:     not-allowed
Loading:      wait
Text:         text
Grab:         grab (draggable)
```

---

## Z-Index Scale

```
Base:          0
Dropdown:      10
Sticky:        20
Fixed:         30
Modal Backdrop: 40
Modal:         41
Tooltip:       50
Notification:  60
```

---

## Responsive Text Sizes

```
Desktop:
  H1: 72px
  H2: 48px
  H3: 24px
  Body: 16px

Tablet:
  H1: 48px
  H2: 36px
  H3: 20px
  Body: 15px

Mobile:
  H1: 36px
  H2: 28px
  H3: 18px
  Body: 14px
```

---

## Focus States

All interactive elements have focus states:

```css
Default State:
  outline: none
  border-color: rgba(6, 182, 212, 0.2)

Focus State:
  border-color: var(--accent-cyan)
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.15), 
              0 0 20px rgba(6, 182, 212, 0.1)
```

---

## Accessibility Features

- ✅ High contrast text (#ffffff on dark backgrounds)
- ✅ Focus indicators on all interactive elements
- ✅ Proper semantic HTML (button, input, label)
- ✅ ARIA labels where needed
- ✅ Color not only indicator (icons, text)
- ✅ Sufficient touch target sizes (44px minimum)

---

## Design Tokens Quick Reference

| Token | Value | Usage |
|-------|-------|-------|
| --accent-cyan | #06b6d4 | Primary accent, borders |
| --accent-blue | #0084ff | Secondary accent, gradients |
| --bg-secondary | #0f1419 | Card backgrounds |
| --text-primary | #ffffff | Main text |
| --text-secondary | #a0aec0 | Secondary text |
| --radius-lg | 16px | Large rounded corners |
| --shadow-lg | 0 12px 40px rgba... | Large shadow |
| --transition-base | 0.3s ease | Standard animation |

---

## Example Color Combinations

### Primary CTA
```
Background: linear-gradient(135deg, #06b6d4, #0084ff)
Text:       #ffffff
Border:     none
```

### Secondary Info
```
Background: rgba(6, 182, 212, 0.1)
Text:       #06b6d4
Border:     1px solid rgba(6, 182, 212, 0.3)
```

### Success State
```
Background: rgba(16, 185, 129, 0.1)
Text:       #10b981
Border:     1px solid rgba(16, 185, 129, 0.3)
```

### Error State
```
Background: rgba(239, 68, 68, 0.1)
Text:       #ef4444
Border:     1px solid rgba(239, 68, 68, 0.3)
```

---

## Print Styles (if needed)

```css
@media print {
  /* Hide navigation, buttons, etc */
  .navbar, .sidebar, .actions { display: none; }
  
  /* Dark text on white background */
  body { background: white; color: black; }
  
  /* Remove shadows and effects */
  * { box-shadow: none !important; }
}
```

---

This visual reference ensures consistency across all components and pages. Use it as a guide when creating or modifying components to maintain the premium FairPlay design system.
