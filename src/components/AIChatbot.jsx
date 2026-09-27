import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { getApiConfig, callAiProxy } from '../services/criteriaApiService';

const STORAGE_KEY = 'fairplay_chatbot_messages';
const GUEST_COUNT_KEY = 'fairplay_chatbot_guest_ai_count';
const GUEST_FREE_LIMIT = 5;

const FAQ_KNOWLEDGE_BASE = {
  admin: {
    'How do I manage users?': 'Open Admin > Users to manage accounts and role assignments. Use Approval Board for approval-role oversight.',
    'How do I view AI usage?': 'Open Admin > AI Usage Monitoring to review request volume, fallback rate, response time, and recent prompt logs.',
    'How do I audit platform activity?': 'Open Admin > Audit Logs to inspect account actions, event updates, and other traceable changes.',
  },
  organizer: {
    'How do I create an event?': 'Start in Organizer > Create Event. Complete event setup, schedule, AI criteria, judge access, then publish the draft.',
    'How do I generate judging criteria?': 'In Create Event Step 3, enter your prompt or paste a rubric template, then generate three rubric profiles and adjust weights before saving.',
    'How do I invite judges?': 'Open Organizer > Judges or the Judge Access step in event creation to prepare codes, links, and QR-based entry.',
    'How does QR attendance work?': 'Enable QR and attendance tracking in event setup, then use the organizer verification flow to check participants in during the event.',
    'How do I finalize results?': 'Monitor submissions in Live Scoring, confirm the rubric and judge activity, then publish or summarize results through Reports.',
  },
  judge: {
    'How do I score contestants?': 'Open Judge > Score Entry or a secure session link, choose the contestant, score each criterion, and save the submission.',
    'How do I review my scores?': 'Use Judge > Score Review to inspect saved submissions before the workflow is fully finalized.',
    'What should I look for in each criterion?': 'Open the criterion description and judge instruction fields in the scoring page; they explain what each score should represent.',
  },
  participant: {
    'How do I register for events?': 'Open Participant > Event Registration, choose an event, then submit the team or individual flow before the deadline.',
    'Where can I find my schedule?': 'Open Participant > Schedule for upcoming event times, venues, and attendance details.',
    'How do I see my scores?': 'Open Participant > Scores and Results to view current rankings and result summaries.',
  },
  public: {
    'What is FairPlay?': 'FairPlay is an event management and judging platform for competitions, live scoring, AI-generated rubrics, and role-based operations.',
    'How does the AI criteria maker work?': 'FairPlay can call an AI model to generate rubric profiles, then fall back to a local rubric generator if the API is unavailable.',
    'How do I get started?': 'Use the Get Started flow on the landing page to create an organizer account. Once an admin approves it, sign in and continue into your role dashboard.',
  },
};

const PLATFORM_KEYWORDS = [
  'event', 'events', 'criteria', 'criterion', 'rubric', 'score', 'scores', 'scoring',
  'judge', 'judges', 'judging', 'contestant', 'contestants', 'participant', 'participants',
  'register', 'registration', 'qr', 'attendance', 'report', 'reports', 'result', 'results',
  'leaderboard', 'certificate', 'certificates', 'account', 'accounts', 'role', 'roles',
  'dashboard', 'fairplay', 'submission', 'submissions', 'approve', 'approval', 'session',
  'invite', 'organizer', 'admin', 'weight', 'weights', 'tally', 'ranking', 'bracket',
];

function isLikelyOffTopic(question) {
  const normalized = question.toLowerCase();
  return !PLATFORM_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

const PAGE_HINTS = [
  {
    match: (pathname) => pathname.includes('/organizer/create-event'),
    quickPrompts: ['Help me generate judging criteria', 'Suggest event setup automations', 'How do I invite judges?', 'How does QR attendance work?'],
    pageLabel: 'Create Event',
  },
  {
    match: (pathname) => pathname.includes('/judge/scoring') || pathname.includes('/judge/session/'),
    quickPrompts: ['How should I score this criterion?', 'What happens after I save a score?', 'How do I review my submissions?'],
    pageLabel: 'Judge Scoring',
  },
  {
    match: (pathname) => pathname.includes('/reports'),
    quickPrompts: ['Where can I find reports?', 'How do I summarize event performance?', 'What can I export from this page?'],
    pageLabel: 'Reports',
  },
  {
    match: (pathname) => true,
    quickPrompts: ['How do I create an event?', 'How do I generate judging criteria?', 'How do I finalize results?'],
    pageLabel: 'General',
  },
];

function getPageContext(pathname) {
  return PAGE_HINTS.find((hint) => hint.match(pathname)) || PAGE_HINTS[PAGE_HINTS.length - 1];
}

function buildFallbackAnswer(question, roleFaq, pageLabel) {
  const normalizedQuestion = question.toLowerCase();

  for (const [prompt, answer] of Object.entries(roleFaq)) {
    if (normalizedQuestion.includes(prompt.toLowerCase().replace('?', '')) || prompt.toLowerCase().includes(normalizedQuestion)) {
      return answer;
    }
  }

  const keywords = normalizedQuestion.split(/\s+/).filter((word) => word.length > 3);
  for (const [prompt, answer] of Object.entries(roleFaq)) {
    if (keywords.some((keyword) => prompt.toLowerCase().includes(keyword))) {
      return answer;
    }
  }

  if (isLikelyOffTopic(question)) {
    return "That's outside what I can help with here — I can only help with FairPlay's events, judging, scoring, and reports. Ask me something about those and I'll point you in the right direction.";
  }

  return `I could not find a direct answer for that yet. Since you are on ${pageLabel}, check the visible actions on this page first, then open the matching dashboard section if you need the full workflow.`;
}

function readGuestAiCount() {
  if (typeof window === 'undefined') return 0;
  try {
    return Number(window.localStorage.getItem(GUEST_COUNT_KEY)) || 0;
  } catch (error) {
    return 0;
  }
}

// Injected once for hover/focus states and motion that inline styles can't
// express (pseudo-classes, keyframes, prefers-reduced-motion).
const WIDGET_STYLES = `
@keyframes fpPanelIn { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes fpLauncherIn { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
@keyframes fpBounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.5; } 40% { transform: translateY(-4px); opacity: 1; } }
.fp-panel { animation: fpPanelIn 0.2s ease-out; }
.fp-launcher { animation: fpLauncherIn 0.2s ease-out; transition: transform 0.15s ease; }
.fp-launcher:hover, .fp-launcher:focus-visible { transform: scale(1.06); }
.fp-icon-btn { transition: background-color 0.15s ease, color 0.15s ease; }
.fp-icon-btn:hover, .fp-icon-btn:focus-visible { background: rgba(148,163,184,0.16); color: #f8fafc; }
.fp-quick-prompt { transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease; }
.fp-quick-prompt:hover:not(:disabled) { background: rgba(8,47,73,0.6); border-color: rgba(103,232,249,0.4); }
.fp-quick-prompt:active:not(:disabled) { transform: scale(0.97); }
.fp-quick-prompt:disabled { opacity: 0.4; cursor: not-allowed; }
.fp-chat-input:focus { outline: none; border-color: rgba(103,232,249,0.65); box-shadow: 0 0 0 3px rgba(103,232,249,0.18); }
.fp-send-btn { transition: transform 0.1s ease, opacity 0.15s ease; }
.fp-send-btn:active:not(:disabled) { transform: scale(0.96); }
.fp-login-pill { transition: filter 0.15s ease, transform 0.1s ease; cursor: pointer; }
.fp-login-pill:hover { filter: brightness(1.15); }
.fp-login-pill:active { transform: scale(0.97); }
@media (prefers-reduced-motion: reduce) {
  .fp-panel, .fp-launcher, .fp-bounce-dot { animation: none !important; }
}
`;

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="fp-bounce-dot"
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#67e8f9',
              display: 'inline-block',
              animation: 'fpBounce 1.1s ease-in-out infinite',
              animationDelay: `${index * 0.15}s`,
            }}
          />
        ))}
      </div>
      <span style={{ color: '#94a3b8', fontSize: 12 }}>FairPlay is typing</span>
    </div>
  );
}

export default function AIChatbot() {
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    if (typeof window === 'undefined') {
      return [];
    }
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      return [];
    }
  });
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [guestAiCount, setGuestAiCount] = useState(readGuestAiCount);
  const [guestNoticeShown, setGuestNoticeShown] = useState(false);
  const messagesEndRef = useRef(null);
  const prevUserIdRef = useRef(undefined);

  const userRole = user?.role || 'public';
  const roleFaq = FAQ_KNOWLEDGE_BASE[userRole] || FAQ_KNOWLEDGE_BASE.public;
  const pageContext = useMemo(() => getPageContext(location.pathname), [location.pathname]);
  const quickPrompts = pageContext.quickPrompts;
  const isGuest = userRole === 'public';
  const guestQuestionsLeft = Math.max(0, GUEST_FREE_LIMIT - guestAiCount);
  const guestLimitReached = isGuest && guestQuestionsLeft <= 0;

  // Every login/logout/account-switch starts a clean chat session — no old
  // history is resent as context on future requests, which keeps each
  // request's token usage small, and a guest's free-question count resets
  // once they've actually signed in.
  useEffect(() => {
    const currentId = user?.id ?? null;
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== currentId) {
      setMessages([]);
      setGuestAiCount(0);
      setGuestNoticeShown(false);
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(GUEST_COUNT_KEY);
      } catch (error) {
        // Ignore storage failures (private browsing, etc.).
      }
    }
    prevUserIdRef.current = currentId;
  }, [user?.id]);

  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage = {
        id: `msg-${Date.now()}`,
        type: 'bot',
        text: `FairPlay support is ready. I can help with ${pageContext.pageLabel.toLowerCase()} and ${userRole} workflows.`,
        time: new Date().toISOString(),
        mode: 'faq',
      };
      setMessages([welcomeMessage]);
    }
  }, [messages.length, pageContext.pageLabel, userRole]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(GUEST_COUNT_KEY, String(guestAiCount));
    } catch (error) {
      // Ignore storage failures (private browsing, etc.).
    }
  }, [guestAiCount]);

  const appendMessage = (message) => {
    setMessages((current) => [...current, message]);
  };

  const goToLogin = () => {
    setIsOpen(false);
    navigate('/login');
  };

  const askAssistant = async (question) => {
    setIsLoading(true);

    if (guestLimitReached && !guestNoticeShown) {
      setGuestNoticeShown(true);
      appendMessage({
        id: `msg-${Date.now()}-limit`,
        type: 'bot',
        text: `You've used all ${GUEST_FREE_LIMIT} free AI answers as a guest. I can still help with quick FAQ answers below — log in for unlimited AI support.`,
        time: new Date().toISOString(),
        mode: 'faq',
      });
    }

    try {
      const apiConfig = getApiConfig(import.meta.env.VITE_AI_CHATBOT_MODEL);
      if (apiConfig.enabled && !guestLimitReached) {
        const json = await callAiProxy({
          model: apiConfig.model,
          temperature: 0.4,
          messages: [
            {
              role: 'system',
              content: `You are the FairPlay Support Assistant, embedded in FairPlay — an event and competition management platform for organizers running pageants, singing contests, sportsfests, esports, and tournaments. Organizers create events, define judging criteria, and register contestants. Judges score contestants live (via QR code, invite link, or account login). Participants register and view schedules/results. Results roll up into leaderboards or brackets, and organizers can issue certificates.

The current user's role is ${userRole}. They are viewing: ${pageContext.pageLabel}.

Known workflows for this role:
${Object.entries(roleFaq).map(([q, a]) => `- ${q} ${a}`).join('\n')}

SCOPE RULES:
- Only answer questions about using FairPlay: events, judging criteria/rubrics, scoring, QR attendance, judges, participants, registration, reports, certificates, accounts, and roles.
- If the question is unrelated to FairPlay (recipes, general trivia, coding help unrelated to this platform, personal advice, etc.), do not answer it. Reply briefly that it's outside what you help with here and redirect to platform topics.
- You have no access to live data (no real scores, rankings, or per-judge records). Never invent or guess an actual value for a live-data question (e.g. "what is Judge A's score"). Instead act as a navigator: name the exact in-app page or section where the user can see that themselves (e.g. Live Scoring, Reports, Judge Activity).
- Do not invent unrelated product features (e.g. this is not an ESG, sustainability, or generic SaaS tool). Keep answers concise and specific.`,
            },
            ...messages.slice(-6).map((message) => ({ role: message.type === 'user' ? 'user' : 'assistant', content: message.text })),
            { role: 'user', content: question },
          ],
        });

        const content = json?.choices?.[0]?.message?.content;
        if (content) {
          appendMessage({
            id: `msg-${Date.now()}-bot`,
            type: 'bot',
            text: content,
            time: new Date().toISOString(),
            mode: 'ai',
          });
          if (isGuest) {
            setGuestAiCount((count) => count + 1);
          }
          setIsLoading(false);
          return;
        }
      }
    } catch (error) {
      // Fallback handled below.
    }

    const answer = buildFallbackAnswer(question, roleFaq, pageContext.pageLabel);
    appendMessage({
      id: `msg-${Date.now()}-bot`,
      type: 'bot',
      text: answer,
      time: new Date().toISOString(),
      mode: 'faq',
    });
    setIsLoading(false);
  };

  const handleQuickPrompt = async (prompt) => {
    appendMessage({ id: `msg-${Date.now()}-user`, type: 'user', text: prompt, time: new Date().toISOString() });
    setUserInput('');
    await askAssistant(prompt);
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    const question = userInput.trim();
    if (!question) return;

    appendMessage({ id: `msg-${Date.now()}-user`, type: 'user', text: question, time: new Date().toISOString() });
    setUserInput('');
    await askAssistant(question);
  };

  return (
    <>
      <style>{WIDGET_STYLES}</style>

      {!isOpen && (
        <button
          className="fp-launcher"
          onClick={() => setIsOpen(true)}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #06b6d4, #2563eb)',
            border: '1px solid rgba(103,232,249,0.35)',
            color: '#eff6ff',
            fontSize: 22,
            cursor: 'pointer',
            boxShadow: '0 18px 45px rgba(14, 116, 233, 0.35)',
            zIndex: 1300,
          }}
          aria-label="Open FairPlay support assistant"
        >
          ?
        </button>
      )}

      {isOpen && (
        <div
          className="fp-panel"
          role="dialog"
          aria-label="FairPlay support chat"
          style={{ position: 'fixed', right: 20, bottom: 20, width: 'min(420px, calc(100vw - 24px))', height: 'min(680px, calc(100vh - 40px))', background: 'rgba(3, 10, 24, 0.98)', border: '1px solid rgba(103,232,249,0.18)', borderRadius: 22, display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.55)', zIndex: 1300 }}
        >
          <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(103,232,249,0.12)', background: 'linear-gradient(180deg, rgba(8,47,73,0.65), rgba(3,10,24,0.65))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <img src="/icon.svg" alt="" style={{ width: 36, height: 36, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#f8fafc', fontWeight: 800 }}>FairPlay Support</div>
                <div style={{ color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pageContext.pageLabel} · {userRole}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {isGuest && (
                <button
                  type="button"
                  onClick={goToLogin}
                  className="fp-login-pill"
                  style={{
                    border: 'none',
                    borderRadius: 999,
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    background: guestLimitReached ? 'rgba(248,113,113,0.16)' : guestQuestionsLeft <= 2 ? 'rgba(251,191,36,0.16)' : 'rgba(103,232,249,0.14)',
                    color: guestLimitReached ? '#fca5a5' : guestQuestionsLeft <= 2 ? '#fcd34d' : '#67e8f9',
                  }}
                  title="Log in for unlimited AI support"
                >
                  {guestLimitReached ? 'Log in for AI' : `${guestQuestionsLeft} free AI left`}
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="fp-icon-btn" aria-label="Close support chat" style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 16, width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="bi bi-x-lg" aria-hidden="true" /></button>
            </div>
          </div>

          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(103,232,249,0.08)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {quickPrompts.map((prompt) => (
              <button key={prompt} className="fp-quick-prompt" onClick={() => handleQuickPrompt(prompt)} disabled={isLoading} style={{ borderRadius: 999, border: '1px solid rgba(103,232,249,0.18)', background: 'rgba(8,47,73,0.38)', color: '#c6f7ff', fontSize: 12, padding: '8px 12px', cursor: 'pointer' }}>
                {prompt}
              </button>
            ))}
          </div>

          <div aria-live="polite" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((message) => (
              <div key={message.id} style={{ display: 'flex', justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8 }}>
                {message.type === 'bot' && (
                  <img src="/icon.svg" alt="" style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(103,232,249,0.14)', padding: 3, flexShrink: 0 }} />
                )}
                <div style={{
                  maxWidth: '78%',
                  padding: '12px 14px',
                  borderRadius: 16,
                  borderBottomLeftRadius: message.type === 'bot' ? 4 : 16,
                  borderBottomRightRadius: message.type === 'user' ? 4 : 16,
                  background: message.type === 'user' ? 'rgba(37,99,235,0.24)' : 'rgba(15,23,42,0.92)',
                  border: `1px solid ${message.type === 'user' ? 'rgba(96,165,250,0.28)' : 'rgba(103,232,249,0.14)'}`,
                  color: '#f8fafc',
                }}>
                  <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{message.text}</div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span>{new Date(message.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    {message.mode && (
                      <span style={{
                        padding: '1px 7px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        background: message.mode === 'ai' ? 'rgba(103,232,249,0.14)' : 'rgba(148,163,184,0.14)',
                        color: message.mode === 'ai' ? '#67e8f9' : '#94a3b8',
                      }}>
                        {message.mode === 'ai' ? 'AI' : 'FAQ'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '12px 14px', borderRadius: 16, borderBottomLeftRadius: 4, background: 'rgba(15,23,42,0.92)', border: '1px solid rgba(103,232,249,0.14)' }}>
                  <TypingIndicator />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} style={{ padding: 16, borderTop: '1px solid rgba(103,232,249,0.08)', display: 'flex', gap: 10 }}>
            <input
              value={userInput}
              onChange={(event) => setUserInput(event.target.value)}
              placeholder="Ask about events, criteria, scoring, QR, or reports"
              disabled={isLoading}
              className="fp-chat-input"
              style={{ flex: 1, minWidth: 0, padding: '12px 14px', borderRadius: 14, background: 'rgba(2, 6, 23, 0.72)', border: '1px solid rgba(103,232,249,0.18)', color: '#f8fafc', fontSize: 16 }}
            />
            <button type="submit" disabled={isLoading || !userInput.trim()} className="fp-send-btn" style={{ minWidth: 96, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #06b6d4, #2563eb)', color: '#03111c', fontWeight: 800, cursor: isLoading || !userInput.trim() ? 'not-allowed' : 'pointer', opacity: isLoading || !userInput.trim() ? 0.55 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <i className="bi bi-send-fill" aria-hidden="true" style={{ fontSize: 13 }} />
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
