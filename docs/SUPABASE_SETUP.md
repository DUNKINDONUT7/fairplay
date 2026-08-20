# Supabase Setup

Ito ang step-by-step para ma-connect ang FairPlay sa Supabase database.

## 1. Confirm ang env values

Sa local `.env`, ilagay ang project URL at anon key:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_DEMO_MODE=false
```

Note:
- `VITE_DEMO_MODE=false` para hindi lang demo mode ang app flow.
- Public key lang ang gamitin dito, hindi `service_role`.

## 2. Gumawa o buksan ang Supabase project

Sa Supabase dashboard:

1. Open `https://supabase.com/dashboard`
2. Gumawa ng new project kung wala pa
3. Sa `Project Settings > API`, kopyahin ang:
   - `Project URL`
   - `anon public` key
4. I-paste ang values sa local `.env`

## 3. Gumawa ng tables

Sa Supabase dashboard:

1. Pumunta sa `SQL Editor`
2. Create `New query`
3. Kopyahin ang laman ng [supabase/schema.sql](/c:/Users/Carlo/fairplay/supabase/schema.sql)
4. I-click ang `Run`

Kung na-run mo na dati ang old schema:
- I-run mo ulit ang latest [supabase/schema.sql](/c:/Users/Carlo/fairplay/supabase/schema.sql:1)
- Safe ito dahil gumagamit ito ng `if not exists` at `alter table ... add column if not exists` para i-upgrade ang existing tables

Sakop na nito ang tables na gamit ng app:
- `events`
- `teams`
- `registrations`
- `scores`
- `judges`
- `judge_assignments`
- `attendance`
- `certificates`
- `tournaments`

Important:
- Ang included policies sa schema ay starter policies para gumana agad ang app habang nagse-setup tayo.
- Bago mag-production, higpitan natin ang RLS para per-user/per-role lang ang access.

## 4. I-restart ang app

Pagkatapos i-save ang `.env`, i-restart ang dev server:

```powershell
npm run dev
```

## 5. Quick test sa app

Subukan ito:

1. Gumawa ng bagong event
2. I-refresh ang page
3. Tingnan kung nandiyan pa rin ang event
4. Sa Supabase `Table Editor`, check `events` table

Kapag pumasok ang record doon, connected na ang database.

## 6. Important note sa auth

Ang kasalukuyang app auth ay local/demo pa sa [src/store/authStore.js](/c:/Users/Carlo/fairplay/src/store/authStore.js:1).

Ibig sabihin:
- Ang event, score, registration, attendance, team, judge, certificate, at tournament data ay pwede nang gumamit ng Supabase
- Pero ang login/register ay hindi pa Supabase Auth

Kung gusto mo, pwede nating sunod na ikabit din ang `login/register` sa Supabase Auth at gumawa ng `profiles` table.
