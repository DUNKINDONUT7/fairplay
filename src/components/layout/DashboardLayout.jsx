import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

const SIDEBAR_STATE_KEY = 'fairplay_sidebar_open';

function getInitialSidebarState() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SIDEBAR_STATE_KEY) === 'true';
}

export default function DashboardLayout({ children, title, subtitle }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarState);
  const [isMobile, setIsMobile] = useState(false);
  const sidebarWidth = isMobile ? 0 : sidebarOpen ? 250 : 76;
  const isHighContrastDashboard =
    location.pathname.startsWith('/admin') ||
    location.pathname === '/approvals';

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STATE_KEY, String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    const prevBodyBackground = document.body.style.background;
    const prevBodyBackgroundColor = document.body.style.backgroundColor;
    const prevBodyColor = document.body.style.color;
    const prevHtmlBackground = document.documentElement.style.background;
    const prevHtmlBackgroundColor = document.documentElement.style.backgroundColor;

    const lightBg = 'linear-gradient(180deg, #f8fbff 0%, #e0f2fe 100%)';
    document.body.style.background = lightBg;
    document.body.style.backgroundColor = '#f8fbff';
    document.body.style.color = isHighContrastDashboard ? '#000000' : '#1d4ed8';
    document.documentElement.style.background = lightBg;
    document.documentElement.style.backgroundColor = '#f8fbff';

    return () => {
      document.body.style.background = prevBodyBackground;
      document.body.style.backgroundColor = prevBodyBackgroundColor;
      document.body.style.color = prevBodyColor;
      document.documentElement.style.background = prevHtmlBackground;
      document.documentElement.style.backgroundColor = prevHtmlBackgroundColor;
    };
  }, [isHighContrastDashboard]);

  return (
    <div
      className={isHighContrastDashboard ? 'fairplay-admin-shell' : undefined}
      style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f8fbff 0%, #e0f2fe 100%)' }}
    >
      <Navbar isMobile={isMobile} onMenuToggle={() => setSidebarOpen((current) => !current)} />
      <Sidebar
        isOpen={sidebarOpen}
        isMobile={isMobile}
        onToggle={() => setSidebarOpen((current) => !current)}
      />

      <motion.main
        className="fairplay-dashboard-main"
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        style={{
          marginLeft: sidebarWidth,
          marginTop: 72,
          padding: isMobile ? '20px 14px' : '28px 32px',
          width: isMobile ? '100%' : `calc(100% - ${sidebarWidth}px)`,
          minHeight: 'calc(100vh - 72px)',
          transition: 'margin-left 0.22s ease, width 0.22s ease',
          boxSizing: 'border-box',
        }}
      >
        <div className="fairplay-dashboard-content" style={{ width: '100%', maxWidth: 1680, margin: '0 auto' }}>
          {(title || subtitle) && (
            <div style={{ marginBottom: 28 }}>
              {title && (
                <motion.h1
                  initial={{ y: -8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.18 }}
                  style={{
                    fontSize: 30,
                    fontWeight: 800,
                    letterSpacing: '-0.04em',
                    background: 'linear-gradient(135deg, #2563eb, #0ea5e9)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: subtitle ? 8 : 0,
                  }}
                >
                  {title}
                </motion.h1>
              )}
              {subtitle && (
                <p style={{ color: '#60a5fa', fontSize: 15, marginBottom: 0 }}>{subtitle}</p>
              )}
            </div>
          )}
          {children}
        </div>
      </motion.main>
    </div>
  );
}
