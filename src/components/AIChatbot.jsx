import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { getApiConfig, callAiProxy } from '../services/criteriaApiService';

const STORAGE_KEY = 'fairplay_chatbot_messages';

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
    'How do I get started?': 'Use the Get Started flow on the landing page, sign in with a demo role if needed, and continue into your role dashboard.',
  },
};

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

  return `I could not find a direct answer for that yet. Since you are on ${pageLabel}, check the visible actions on this page first, then open the matching dashboard section if you need the full workflow.`;
}

export default function AIChatbot() {
  const { user } = useAuthStore();
  const location = useLocation();
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
  const messagesEndRef = useRef(null);

  const userRole = user?.role || 'public';
  const roleFaq = FAQ_KNOWLEDGE_BASE[userRole] || FAQ_KNOWLEDGE_BASE.public;
  const pageContext = useMemo(() => getPageContext(location.pathname), [location.pathname]);
  const quickPrompts = pageContext.quickPrompts;

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

  const appendMessage = (message) => {
    setMessages((current) => [...current, message]);
  };

  const askAssistant = async (question) => {
    setIsLoading(true);

    try {
      const apiConfig = getApiConfig(import.meta.env.VITE_AI_CHATBOT_MODEL);
      if (apiConfig.enabled) {
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

Answer using this context. If a question is about a workflow not listed above, give your best practical guidance consistent with how the platform works — do not invent unrelated product features (e.g. this is not an ESG, sustainability, or generic SaaS tool). Keep answers concise and specific.`,
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
      {!isOpen && (
        <button
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
        <div style={{ position: 'fixed', right: 20, bottom: 20, width: 'min(420px, calc(100vw - 24px))', height: 'min(680px, calc(100vh - 40px))', background: 'rgba(3, 10, 24, 0.98)', border: '1px solid rgba(103,232,249,0.18)', borderRadius: 22, display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.55)', zIndex: 1300 }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(103,232,249,0.12)', background: 'linear-gradient(180deg, rgba(8,47,73,0.65), rgba(3,10,24,0.65))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src="/icon.svg" alt="FairPlay" style={{ width: 36, height: 36 }} />
              <div>
                <div style={{ color: '#f8fafc', fontWeight: 800 }}>FairPlay Support</div>
                <div style={{ color: '#94a3b8', fontSize: 12 }}>{pageContext.pageLabel} · {userRole}</div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}><i className="bi bi-x-lg" /></button>
          </div>

          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(103,232,249,0.08)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {quickPrompts.map((prompt) => (
              <button key={prompt} onClick={() => handleQuickPrompt(prompt)} style={{ borderRadius: 999, border: '1px solid rgba(103,232,249,0.18)', background: 'rgba(8,47,73,0.38)', color: '#c6f7ff', fontSize: 12, padding: '8px 12px', cursor: 'pointer' }}>
                {prompt}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((message) => (
              <div key={message.id} style={{ display: 'flex', justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '82%', padding: '12px 14px', borderRadius: 16, background: message.type === 'user' ? 'rgba(37,99,235,0.24)' : 'rgba(15,23,42,0.92)', border: `1px solid ${message.type === 'user' ? 'rgba(96,165,250,0.28)' : 'rgba(103,232,249,0.14)'}`, color: '#f8fafc' }}>
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>{message.text}</div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span>{new Date(message.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    {message.mode && <span>{message.mode.toUpperCase()}</span>}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(15,23,42,0.92)', border: '1px solid rgba(103,232,249,0.14)', color: '#94a3b8', fontSize: 13 }}>
                  FairPlay is typing...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} style={{ padding: 16, borderTop: '1px solid rgba(103,232,249,0.08)', display: 'flex', gap: 10 }}>
            <input value={userInput} onChange={(event) => setUserInput(event.target.value)} placeholder="Ask about events, criteria, scoring, QR, or reports" disabled={isLoading} style={{ flex: 1, padding: '12px 14px', borderRadius: 14, background: 'rgba(2, 6, 23, 0.72)', border: '1px solid rgba(103,232,249,0.18)', color: '#f8fafc', outline: 'none' }} />
            <button type="submit" disabled={isLoading || !userInput.trim()} style={{ minWidth: 96, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #06b6d4, #2563eb)', color: '#03111c', fontWeight: 800, cursor: isLoading || !userInput.trim() ? 'not-allowed' : 'pointer', opacity: isLoading || !userInput.trim() ? 0.55 : 1 }}>
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
