import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import * as THREE from 'three';
import gsap from 'gsap';
import {
  BrainCircuit, ChartNoAxesCombined, ClipboardList,
  QrCode, Sparkles, Trophy, Users,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../utils/supabaseClient';

// ─── Data ─────────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: BrainCircuit,        title: 'AI Criteria Generator', body: 'Generate three polished rubric profiles from event context, prompts, and uploaded rubric templates.' },
  { icon: Trophy,              title: 'Real-Time Scoring',     body: 'Track judge submissions, live rankings, and weighted scoring updates in one workflow.' },
  { icon: QrCode,              title: 'QR Attendance',         body: 'Run secure check-ins, judge access, and verification flows with QR-supported operations.' },
  { icon: ClipboardList,       title: 'Approval Workflow',     body: 'Support institute-level review, routing, and operational visibility across stakeholders.' },
  { icon: Users,               title: 'Role-Based Dashboards', body: 'Give admins, organizers, judges, and participants purpose-built experiences.' },
  { icon: ChartNoAxesCombined, title: 'Reports & Analytics',  body: 'Summarize performance, activity, and judging outcomes with operational data.' },
];
const STEPS = [
  { num: '01', title: 'Create the Event',      body: 'Set up structure, schedule, formats, and participant flow in the organizer dashboard.' },
  { num: '02', title: 'Generate AI Criteria',  body: 'Auto-generate weighted rubric profiles or refine an uploaded judging template.' },
  { num: '03', title: 'Deploy Judge Access',   body: 'Issue QR codes, secure scoring links, and session-based judge assignments.' },
  { num: '04', title: 'Run & Publish Results', body: 'Monitor live submissions, lock scores, and publish fair event results.' },
];
const ROLES = [
  { role: 'Organizers',   body: 'Launch events faster, automate rubric setup, and coordinate judges without spreadsheet chaos.' },
  { role: 'Judges',       body: 'Score quickly from mobile-friendly workflows with clear criteria and guided instructions.' },
  { role: 'Participants', body: 'Register, follow schedules, and review results from a single event portal.' },
  { role: 'Admins',       body: 'Monitor AI usage, approvals, audit trails, and overall platform health in one place.' },
];

function formatEventDate(raw) {
  if (!raw) return 'Schedule to be announced';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Schedule to be announced';
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizePublicEvent(event) {
  const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  const startDate = event.start_date || metadata.startDate || event.startDate || null;
  const endDate = event.end_date || metadata.endDate || event.endDate || null;
  const now = Date.now();
  const startTime = startDate ? new Date(startDate).getTime() : 0;
  const endTime = endDate ? new Date(endDate).getTime() : startTime;
  const status = String(event.status || '').toLowerCase();
  const isOngoing = ['active', 'ongoing', 'live'].includes(status) || (startTime && startTime <= now && (!endTime || endTime >= now));
  const isUpcoming = ['upcoming', 'approved', 'published'].includes(status) || (startTime && startTime > now);

  return {
    id: event.id,
    title: event.title || metadata.title || 'Untitled Event',
    description: event.description || metadata.description || 'Event details will be announced soon.',
    category: event.type || metadata.eventType || metadata.category || 'Event',
    location: event.location || metadata.location || 'Venue to be announced',
    startDate,
    endDate,
    status,
    isOngoing,
    isUpcoming,
    participants: Number(event.participants || 0),
    maxParticipants: Number(event.max_participants || event.maxParticipants || 0),
    startTime: startTime || Number.MAX_SAFE_INTEGER,
  };
}

// ─── Animated Particles ───────────────────────────────────────────────────────
function calculateScoreValue(score) {
  const criteriaScores = score.criteria_scores || score.criteriaScores || {};
  const values = Object.values(criteriaScores)
    .map(value => Number(value))
    .filter(value => Number.isFinite(value));
  if (values.length > 0) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  const directTotal = Number(score.total_score || score.totalScore);
  return Number.isFinite(directTotal) ? directTotal : null;
}

function buildLiveDashboardData({ events = [], judges = [], scores = [], teams = [] }) {
  const scoredRows = scores
    .map(score => ({ ...score, scoreValue: calculateScoreValue(score) }))
    .filter(score => Number.isFinite(score.scoreValue));
  const scoreValues = scoredRows.map(score => score.scoreValue);
  const avgScore = scoreValues.length ? scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length : null;
  const lockedCount = scoredRows.filter(score => score.locked).length;
  const completionRate = scoredRows.length ? Math.round((lockedCount / scoredRows.length) * 100) : null;
  const eventTitleById = new Map(events.map(event => [String(event.id), event.title || `Event ${event.id}`]));

  const latestScores = [...scoredRows]
    .sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime())
    .slice(0, 5)
    .map(score => ({
      id: score.id,
      event: score.event_title || eventTitleById.get(String(score.event_id)) || 'Live Event',
      contestant: score.contestant_name || score.participant_name || (score.team_id ? `Team ${score.team_id}` : `Contestant ${score.contestant_id || score.participant_id || ''}`.trim()),
      judge: score.judge_name || (score.judge_id ? `Judge ${score.judge_id}` : 'Judge'),
      value: score.scoreValue,
    }));

  const seriesMap = new Map();
  scoredRows.forEach(score => {
    const label = score.event_title || eventTitleById.get(String(score.event_id));
    if (!label) return;
    const next = seriesMap.get(label) || { label, sum: 0, count: 0 };
    next.sum += score.scoreValue;
    next.count += 1;
    seriesMap.set(label, next);
  });
  const scoreSeries = Array.from(seriesMap.values())
    .map(item => ({ label: item.label, avg: item.sum / item.count, count: item.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const teamNameById = new Map(teams.map(team => [String(team.id), team.name || `Team ${team.id}`]));
  const teamAgg = new Map();
  scoredRows.forEach(score => {
    const key = score.team_id ? `team:${score.team_id}` : `contestant:${score.contestant_id || score.participant_id || score.contestant_name || score.participant_name || score.id}`;
    const name = score.team_id ? teamNameById.get(String(score.team_id)) || `Team ${score.team_id}` : score.contestant_name || score.participant_name || 'Contestant';
    const next = teamAgg.get(key) || { name, sum: 0, count: 0 };
    next.sum += score.scoreValue;
    next.count += 1;
    teamAgg.set(key, next);
  });
  const topTeams = Array.from(teamAgg.values())
    .map(item => ({ name: item.name, avg: item.sum / item.count, count: item.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);

  const judgeNameById = new Map(judges.map(judge => [String(judge.id), judge.name || `Judge ${judge.id}`]));
  const judgeAgg = new Map();
  scoredRows.forEach(score => {
    const key = score.judge_id ? String(score.judge_id) : score.judge_name || 'Judge';
    const next = judgeAgg.get(key) || { name: score.judge_name || judgeNameById.get(key) || `Judge ${key}`, count: 0 };
    next.count += 1;
    judgeAgg.set(key, next);
  });
  const judgeCounts = Array.from(judgeAgg.values()).sort((a, b) => b.count - a.count).slice(0, 24);
  const maxJudgeCount = judgeCounts.reduce((max, item) => Math.max(max, item.count), 1);
  const judgeActivity = judgeCounts.map(item => ({ name: item.name, count: item.count, intensity: item.count / maxJudgeCount }));

  const publicEvents = events.map(normalizePublicEvent).filter(event => event.status !== 'archived' && event.status !== 'rejected');
  const ongoing = publicEvents.filter(event => event.isOngoing).sort((a, b) => a.startTime - b.startTime).slice(0, 3);
  const upcoming = publicEvents.filter(event => event.isUpcoming && !event.isOngoing).sort((a, b) => a.startTime - b.startTime).slice(0, 4);

  return {
    dashboard: {
      loading: false,
      error: null,
      eventsCount: events.length,
      judgesCount: judges.length,
      avgScore,
      completionRate,
      latestScores,
      scoreSeries,
      topTeams,
      judgeActivity,
      scoreCount: scoredRows.length,
    },
    eventShowcase: { loading: false, ongoing, upcoming },
  };
}

function initParticles(canvas) {
  const W = canvas.offsetWidth, H = canvas.offsetHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
  camera.position.z = 5;

  const N   = 2800;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const sz  = new Float32Array(N);
  const vel = new Float32Array(N * 3);

  const pal = [
    [0.58, 0.77, 1.00],
    [0.36, 0.51, 0.95],
    [0.83, 0.91, 1.00],
    [1.00, 1.00, 1.00],
    [0.23, 0.51, 0.96],
    [0.70, 0.85, 1.00],
  ];

  for (let i = 0; i < N; i++) {
    pos[i*3]   = (Math.random() - 0.5) * 10;
    pos[i*3+1] = (Math.random() - 0.5) * 10;
    pos[i*3+2] = (Math.random() - 0.5) * 4;

    vel[i*3]   = (Math.random() - 0.5) * 0.0012;
    vel[i*3+1] = Math.random() * 0.005 + 0.001;
    vel[i*3+2] = (Math.random() - 0.5) * 0.0008;

    const c = pal[Math.floor(Math.random() * pal.length)];
    col[i*3] = c[0]; col[i*3+1] = c[1]; col[i*3+2] = c[2];

    sz[i] = Math.random() * 2.0 + 0.5;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor',   new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(sz,  1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: `
      attribute float aSize;
      attribute vec3  aColor;
      varying   vec3  vColor;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (42.0 / -mv.z);
        gl_Position  = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.05, d) * 0.9;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const pts = new THREE.Points(geo, mat);
  scene.add(pts);

  let rafId;
  const tick = () => {
    rafId = requestAnimationFrame(tick);
    const p = geo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      p[i*3]   += vel[i*3];
      p[i*3+1] += vel[i*3+1];
      p[i*3+2] += vel[i*3+2];
      if (p[i*3+1] > 5) {
        p[i*3+1] = -5;
        p[i*3]   = (Math.random() - 0.5) * 10;
        p[i*3+2] = (Math.random() - 0.5) * 4;
      }
    }
    geo.attributes.position.needsUpdate = true;
    pts.rotation.y += 0.0004;
    renderer.render(scene, camera);
  };
  tick();

  const onResize = () => {
    renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
    camera.aspect = canvas.offsetWidth / canvas.offsetHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    renderer.dispose();
  };
}

// ─── Scroll reveal hook ───────────────────────────────────────────────────────
function useReveal(selector, buildAnim) {
  useEffect(() => {
    const els = document.querySelectorAll(selector);
    if (!els.length) return;
    const ctxs = [];
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const c = gsap.context(() => buildAnim(e.target), e.target);
        ctxs.push(c); io.unobserve(e.target);
      });
    }, { threshold: 0.12 });
    els.forEach(el => io.observe(el));
    return () => { io.disconnect(); ctxs.forEach(c => c.revert()); };
  }, []);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate  = useNavigate();
  const location = useLocation();
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [location.hash]);

  const [dashboard, setDashboard] = useState({
    loading: true,
    error: null,
    eventsCount: 0,
    judgesCount: 0,
    avgScore: null,
    completionRate: null,
    latestScores: [],
    scoreSeries: [],
    topTeams: [],
    judgeActivity: [],
    scoreCount: 0,
  });
  const [eventShowcase, setEventShowcase] = useState({
    loading: true,
    ongoing: [],
    upcoming: [],
  });

  useEffect(() => {
    let isActive = true;

    let refreshTimer = null;
    const loadDashboard = async () => {
      if (!supabase) {
        if (isActive) {
          setDashboard(prev => ({
            ...prev,
            loading: false,
            error: isSupabaseConfigured ? 'Supabase client unavailable.' : 'Supabase not configured.',
          }));
          setEventShowcase({ loading: false, ongoing: [], upcoming: [] });
        }
        return;
      }

      const [eventsRes, judgesRes, scoresRes, teamsRes] = await Promise.all([
        supabase.from('events').select('id,title,type,status,description,location,start_date,end_date,participants,max_participants,metadata'),
        supabase.from('judges').select('id,name'),
        supabase.from('scores').select('id,total_score,criteria_scores,team_id,participant_id,contestant_id,contestant_name,judge_id,judge_name,locked,event_title,event_id,created_at,updated_at'),
        supabase.from('teams').select('id,name'),
      ]);

      const firstError = eventsRes.error || judgesRes.error || scoresRes.error || teamsRes.error;
      if (firstError) {
        if (isActive) {
          setDashboard(prev => ({
            ...prev,
            loading: false,
            error: firstError.message || 'Failed to load dashboard data.',
          }));
          setEventShowcase({ loading: false, ongoing: [], upcoming: [] });
        }
        return;
      }

      if (isActive) {
        const liveData = buildLiveDashboardData({
          events: eventsRes.data || [],
          judges: judgesRes.data || [],
          scores: scoresRes.data || [],
          teams: teamsRes.data || [],
        });
        setDashboard(liveData.dashboard);
        setEventShowcase(liveData.eventShowcase);
      }
    };

    const scheduleReload = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(loadDashboard, 250);
    };

    loadDashboard();
    const intervalId = window.setInterval(loadDashboard, 15000);
    const channel = supabase
      ? supabase
          .channel('fairplay-public-live-dashboard')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, scheduleReload)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, scheduleReload)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'judges' }, scheduleReload)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, scheduleReload)
          .subscribe()
      : null;

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
      window.clearTimeout(refreshTimer);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => { if (canvasRef.current) return initParticles(canvasRef.current); }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('.fp-nav',        { y: -56, opacity: 0, duration: 0.5 })
        .from('.fp-badge',      { y: 22, opacity: 0, duration: 0.55 }, '-=0.18')
        .from('.fp-h1',         { y: 34, opacity: 0, duration: 0.65 }, '-=0.38')
        .from('.fp-sub',        { y: 22, opacity: 0, duration: 0.60 }, '-=0.40')
        .from('.fp-cta-row',    { y: 18, opacity: 0, duration: 0.55 }, '-=0.40')
        .from('.fp-stats-row',  { y: 14, opacity: 0, duration: 0.50 }, '-=0.35')
        .from('.fp-canvas-wrap',{ opacity: 0, scale: 0.94, duration: 0.9 }, '-=0.70');
    });
    return () => ctx.revert();
  }, []);

  useReveal('.fp-sec-hdr', el => gsap.from(el, { y: 28, opacity: 0, duration: 0.65, ease: 'power3.out' }));
  useReveal('.fp-feat',    el => gsap.from(el, { y: 40, opacity: 0, duration: 0.55, ease: 'power3.out', delay: Number(el.dataset.i || 0) * 0.08 }));
  useReveal('.fp-step',    el => gsap.from(el, { x: -24, opacity: 0, duration: 0.50, ease: 'power3.out', delay: Number(el.dataset.i || 0) * 0.10 }));
  useReveal('.fp-role',    el => gsap.from(el, { y: 32, opacity: 0, duration: 0.55, ease: 'power3.out', delay: Number(el.dataset.i || 0) * 0.08 }));
  useReveal('.fp-cta-box', el => gsap.from(el, { scale: 0.95, opacity: 0, duration: 0.70, ease: 'power3.out' }));

  return (
    <div style={{ width: '100%', fontFamily: "'Inter','Manrope',system-ui,sans-serif", overflowX: 'hidden', background: '#03070f' }}>
      <style>{`
        .lp-light h2,.lp-light h3,.lp-light h4 { color:#0f172a!important; -webkit-text-fill-color:#0f172a!important; background:none!important; }
        .lp-light p { color:#475569!important; margin-bottom:0!important; }
        .lp-dark h2 { color:#fff!important; -webkit-text-fill-color:#fff!important; background:none!important; }
        .lp-dark p  { color:rgba(255,255,255,0.72)!important; margin-bottom:0!important; }
        .feat-grid  { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; }
        .steps-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:32px; }
        .roles-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:18px; }
        @media(max-width:1024px){ .feat-grid{ grid-template-columns:repeat(2,1fr)!important; } .steps-grid,.roles-grid{ grid-template-columns:repeat(2,1fr)!important; } }
        @media(max-width:768px) { .hero-grid{ grid-template-columns:1fr!important; } .fp-canvas-wrap{ height:340px!important; } .feat-grid,.steps-grid,.roles-grid{ grid-template-columns:1fr!important; } }
      `}</style>

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <nav className="fp-nav" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200, backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)', background: 'rgba(255,255,255,0.96)', borderBottom: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 28px', height: 66, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <img src="/logo.svg" alt="FairPlay" style={{ height: 42, width: 'auto', display: 'block' }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => navigate('/?modal=login')} style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 20px', background: 'transparent', color: '#1e3a8a', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Sign In</button>
            <button onClick={() => navigate('/?modal=register')} style={{ border: 'none', borderRadius: 8, padding: '9px 20px', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14, boxShadow: '0 2px 14px rgba(37,99,235,0.4)' }}>Get Started</button>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', background: 'linear-gradient(160deg,#0f2a6b 0%,#0d2159 40%,#091540 75%,#060e2e 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '10%', left: '25%', width: 700, height: 600, background: 'radial-gradient(ellipse,rgba(59,130,246,0.22) 0%,transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '40%', right: '5%', width: 400, height: 400, background: 'radial-gradient(ellipse,rgba(37,99,235,0.14) 0%,transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 130, background: 'linear-gradient(to bottom,transparent,#060e2e)', pointerEvents: 'none' }} />

        <div className="hero-bg" style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>

        <div className="hero-grid" style={{ position: 'relative', zIndex: 1, width: '100%', padding: '110px clamp(20px,4vw,64px) 80px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 56, alignItems: 'center' }}>

          {/* Left — Text */}
          <div>
            <div className="fp-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderRadius: 999, background: 'rgba(37,99,235,0.16)', border: '1px solid rgba(96,165,250,0.32)', color: '#93c5fd', fontSize: 12, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 26 }}>
              <Sparkles size={13} /> AI-Powered Event Platform
            </div>

            <h1 className="fp-h1" style={{ fontSize: 'clamp(36px,5.5vw,68px)', lineHeight: 1.05, fontWeight: 900, letterSpacing: '-0.05em', marginBottom: 22, color: '#fff', WebkitTextFillColor: '#fff', background: 'none' }}>
              The intelligent event{' '}
              <span style={{ background: 'linear-gradient(120deg,#93c5fd 0%,#ffffff 50%,#bfdbfe 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>management</span>
              {' '}&amp; judging platform.
            </h1>

            <p className="fp-sub" style={{ fontSize: 17, color: '#94a3b8', lineHeight: 1.74, marginBottom: 34, maxWidth: 480 }}>
              Manage competitions, automate judging workflows, generate AI-based rubrics, and deliver fair real-time results in one premium event workspace.
            </p>

            <div className="fp-cta-row" style={{ display: 'flex', gap: 14, marginBottom: 44, flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/?modal=register')} style={{ border: 'none', borderRadius: 10, padding: '14px 28px', background: '#2563eb', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 15, boxShadow: '0 6px 26px rgba(37,99,235,0.45)' }}>
                Launch FairPlay
              </button>
              <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} style={{ border: '1px solid rgba(255,255,255,0.18)', borderRadius: 10, padding: '14px 28px', background: 'rgba(255,255,255,0.06)', color: '#f8fafc', fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
                Explore Features
              </button>
            </div>

            <div className="fp-stats-row" style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
              {[['7','User Roles'],['12','State Stores'],['50+','Routes']].map(([v,l]) => (
                <div key={l}>
                  <div style={{ fontSize: 30, fontWeight: 900, color: '#60a5fa', letterSpacing: '-0.04em' }}>{v}</div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginTop: 3 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Live Dashboard */}
          <div className="fp-canvas-wrap" style={{ minHeight: 420, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: '100%', maxWidth: 560, borderRadius: 18, padding: 18, background: 'rgba(15,23,42,0.72)', border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 24px 70px rgba(7,12,24,0.55)', backdropFilter: 'blur(10px)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ color: '#e2e8f0', fontWeight: 800, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Live Dashboard Overview</div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>{dashboard.loading ? 'Loading...' : dashboard.error ? 'Data unavailable' : `Live - ${dashboard.scoreCount || 0} scores`}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
                <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(148,163,184,0.15)' }}>
                  <div style={{ color: '#93c5fd', fontWeight: 800, fontSize: 16 }}>{dashboard.eventsCount}</div>
                  <div style={{ color: '#94a3b8', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Events</div>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(148,163,184,0.15)' }}>
                  <div style={{ color: '#93c5fd', fontWeight: 800, fontSize: 16 }}>{dashboard.judgesCount}</div>
                  <div style={{ color: '#94a3b8', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Judges</div>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(148,163,184,0.15)' }}>
                  <div style={{ color: '#93c5fd', fontWeight: 800, fontSize: 16 }}>{dashboard.avgScore !== null ? dashboard.avgScore.toFixed(1) : 'N/A'}</div>
                  <div style={{ color: '#94a3b8', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Avg Score</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
                <div style={{ borderRadius: 14, padding: 12, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.12)' }}>
                  <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Latest Scores</div>
                  {dashboard.latestScores.length ? (
                    <div style={{ display: 'grid', gap: 7 }}>
                      {dashboard.latestScores.slice(0, 4).map(item => (
                        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.contestant}</div>
                            <div style={{ color: '#94a3b8', fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.judge} - {item.event}</div>
                          </div>
                          <div style={{ color: '#93c5fd', fontWeight: 900, fontSize: 14 }}>{item.value.toFixed(1)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: 11 }}>No judge scores yet.</div>
                  )}
                </div>

                <div style={{ borderRadius: 14, padding: 12, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.12)', display: 'grid', gap: 10 }}>
                  <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 12 }}>Judging Completion</div>
                  <div style={{ width: 92, height: 92, borderRadius: '50%', margin: '0 auto', background: `conic-gradient(#60a5fa ${dashboard.completionRate || 0}%, rgba(148,163,184,0.2) 0)`, display: 'grid', placeItems: 'center' }}>
                    <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#0f172a', display: 'grid', placeItems: 'center', color: '#e2e8f0', fontWeight: 800, fontSize: 14 }}>
                      {dashboard.completionRate !== null ? `${dashboard.completionRate}%` : 'N/A'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 10 }}>Locked judge scores vs total</div>
                </div>

                <div style={{ borderRadius: 14, padding: 12, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.12)', display: 'grid', gap: 8 }}>
                  <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 12 }}>Leading Teams</div>
                  {dashboard.topTeams.length ? (
                    dashboard.topTeams.map(item => (
                      <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#cbd5f5', fontSize: 11 }}>
                        <span>{item.name}</span>
                        <span style={{ color: '#93c5fd', fontWeight: 700 }}>{item.avg.toFixed(1)}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: 11 }}>No team scores yet.</div>
                  )}
                </div>

                <div style={{ borderRadius: 14, padding: 12, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.12)', display: 'grid', gap: 8 }}>
                  <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 12 }}>Judge Activity</div>
                  {dashboard.judgeActivity.length ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
                      {dashboard.judgeActivity.map((item, index) => (
                        <div key={`${item.name}-${index}`} title={`${item.name} (${item.count})`} style={{ width: '100%', paddingBottom: '100%', borderRadius: 6, background: `rgba(96,165,250,${0.2 + item.intensity * 0.8})` }} />
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: 11 }}>No judge activity yet.</div>
                  )}
                </div>
              </div>

              {dashboard.error && (
                <div style={{ marginTop: 12, color: '#fca5a5', fontSize: 11 }}>{dashboard.error}</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────────── */}
      <section id="features" className="lp-light" style={{ background: '#fff', padding: '96px 28px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div className="fp-sec-hdr" style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ color: '#2563eb', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 10 }}>Live Events</div>
            <h2 style={{ fontSize: 'clamp(26px,4.5vw,44px)', fontWeight: 900, letterSpacing: '-0.04em', marginBottom: 12, color: '#0f172a' }}>Ongoing events you can join now.</h2>
            <p style={{ fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto', color: '#475569' }}>Visitors can see active competitions immediately, register, and preview what is coming next.</p>
          </div>

          {eventShowcase.loading ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>Loading public events...</div>
          ) : eventShowcase.ongoing.length > 0 ? (
            <div className="feat-grid" style={{ marginBottom: 42 }}>
              {eventShowcase.ongoing.map((event, i) => (
                <div key={event.id} className="fp-feat" data-i={i}
                  style={{ background: '#f8fafc', border: '1px solid rgba(37,99,235,0.14)', borderRadius: 20, padding: '26px 24px', transition: 'transform .22s ease,box-shadow .22s ease', minHeight: 260, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                  onMouseEnter={e => { e.currentTarget.style.transform='translateY(-5px)'; e.currentTarget.style.boxShadow='0 14px 40px rgba(37,99,235,0.12)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: '#dcfce7', color: '#15803d', fontSize: 12, fontWeight: 900 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
                        Ongoing
                      </span>
                      <span style={{ color: '#2563eb', fontSize: 12, fontWeight: 800, textTransform: 'capitalize' }}>{event.category}</span>
                    </div>
                    <h3 style={{ fontSize: 20, lineHeight: 1.15, fontWeight: 900, marginBottom: 10, color: '#0f172a' }}>{event.title}</h3>
                    <p style={{ color: '#475569', lineHeight: 1.6, margin: 0, fontSize: 14 }}>{event.description.length > 105 ? `${event.description.slice(0, 102)}...` : event.description}</p>
                    <div style={{ display: 'grid', gap: 8, marginTop: 18, color: '#334155', fontSize: 13, fontWeight: 700 }}>
                      <span><i className="bi bi-calendar-event" style={{ color: '#2563eb', marginRight: 8 }} />{formatEventDate(event.startDate)}</span>
                      <span><i className="bi bi-geo-alt" style={{ color: '#2563eb', marginRight: 8 }} />{event.location}</span>
                      <span><i className="bi bi-people" style={{ color: '#2563eb', marginRight: 8 }} />{event.participants}{event.maxParticipants ? ` / ${event.maxParticipants}` : ''} participants</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
                    <button onClick={() => navigate(`/events/${event.id}`)} style={{ flex: '1 1 130px', border: 'none', borderRadius: 12, padding: '12px 14px', background: 'linear-gradient(135deg,#2563eb,#0ea5e9)', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>
                      View Live Preview
                    </button>
                    <button onClick={() => navigate(`/events/${event.id}/leaderboard`)} style={{ flex: '1 1 130px', border: '1px solid #bfdbfe', borderRadius: 12, padding: '12px 14px', background: '#fff', color: '#1d4ed8', fontWeight: 800, cursor: 'pointer' }}>
                      Leaderboard
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: '#f8fafc', border: '1px dashed #bfdbfe', borderRadius: 20, padding: 34, textAlign: 'center', marginBottom: 42 }}>
              <h3 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>No ongoing events right now</h3>
              <p style={{ color: '#64748b', fontSize: 14 }}>Check the upcoming previews below or come back once an event goes live.</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'end', marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#2563eb', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8 }}>Upcoming Preview</div>
              <h3 style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', margin: 0 }}>Next events on deck</h3>
            </div>
          </div>

          {eventShowcase.upcoming.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              {eventShowcase.upcoming.map(event => (
                <button key={event.id} onClick={() => navigate(`/events/${event.id}`)}
                  style={{ textAlign: 'left', background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 18, padding: 18, cursor: 'pointer', boxShadow: '0 12px 28px rgba(37,99,235,0.06)' }}>
                  <span style={{ display: 'inline-flex', marginBottom: 12, padding: '5px 9px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
                    {formatEventDate(event.startDate)}
                  </span>
                  <h4 style={{ fontSize: 16, lineHeight: 1.25, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>{event.title}</h4>
                  <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>{event.location}</p>
                  <span style={{ color: '#2563eb', fontSize: 13, fontWeight: 900 }}>View preview <i className="bi bi-arrow-right" /></span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ color: '#64748b', fontSize: 14, padding: '18px 0' }}>No upcoming events have been published yet.</div>
          )}
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────────── */}
      <section id="how" className="lp-light" style={{ background: '#eff6ff', padding: '96px 28px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <div className="fp-sec-hdr" style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ color: '#2563eb', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 10 }}>How It Works</div>
            <h2 style={{ fontSize: 'clamp(26px,4.5vw,44px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#0f172a' }}>A clean four-step event flow.</h2>
          </div>
          <div className="steps-grid">
            {STEPS.map(({ num, title, body }, i) => (
              <div key={num} className="fp-step" data-i={i}>
                <div style={{ width: 50, height: 50, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, marginBottom: 18, boxShadow: '0 5px 18px rgba(37,99,235,0.36)' }}>{num}</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, color: '#0f172a' }}>{title}</h3>
                <p style={{ color: '#475569', lineHeight: 1.65, margin: 0, fontSize: 14 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROLES ───────────────────────────────────────────────────────────── */}
      <section id="roles" className="lp-light" style={{ background: '#fff', padding: '96px 28px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <div className="fp-sec-hdr" style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={{ color: '#2563eb', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 10 }}>Role Benefits</div>
            <h2 style={{ fontSize: 'clamp(26px,4.5vw,44px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#0f172a' }}>One platform, tuned for every stakeholder.</h2>
          </div>
          <div className="roles-grid">
            {ROLES.map(({ role, body }, i) => (
              <div key={role} className="fp-role" data-i={i}
                style={{ background: '#f8fafc', border: '1px solid rgba(37,99,235,0.11)', borderTop: '3px solid #2563eb', borderRadius: 15, padding: '22px 20px' }}>
                <div style={{ color: '#2563eb', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>{role}</div>
                <p style={{ color: '#475569', lineHeight: 1.65, margin: 0, fontSize: 14 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section id="cta" className="lp-dark" style={{ background: 'linear-gradient(135deg,#0c1e52 0%,#1d4ed8 100%)', padding: '96px 28px' }}>
        <div className="fp-cta-box" style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: '1px solid rgba(255,255,255,0.25)' }}>
              <Trophy size={26} color="#fff" />
            </div>
          <h2 style={{ fontSize: 'clamp(26px,4.5vw,48px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', marginBottom: 14, lineHeight: 1.08 }}>
            Run a stronger event demo with real AI-assisted workflows.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 16, lineHeight: 1.72, maxWidth: 580, margin: '0 auto 30px' }}>
            FairPlay supports the full event lifecycle. Show it with confidence: real rubric generation, live role flows, and premium product-level presentation.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/?modal=register')} style={{ border: 'none', borderRadius: 10, padding: '14px 28px', background: '#fff', color: '#1d4ed8', fontWeight: 800, cursor: 'pointer', fontSize: 15 }}>
              Create Your Account
            </button>
            <button onClick={() => navigate('/?modal=login')} style={{ border: '1px solid rgba(255,255,255,0.28)', borderRadius: 10, padding: '14px 28px', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>
              Use Demo Access
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer style={{ background: '#03070f', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '26px 28px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ background: '#fff', borderRadius: 6, padding: '4px 10px', display: 'inline-flex' }}>
            <img src="/logo.svg" alt="FairPlay" style={{ height: 28, width: 'auto', display: 'block' }} />
          </div>
          <span style={{ color: '#475569', fontSize: 13 }}>© {new Date().getFullYear()} FairPlay. Built for fair competition.</span>
        </div>
      </footer>
    </div>
  );
}
