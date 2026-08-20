import { useState, useEffect } from 'react';

// Custom hook to detect responsive breakpoints
export const useResponsive = () => {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0
  });

  useEffect(() => {
    // Handler to call on window resize
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    // Add event listener
    window.addEventListener('resize', handleResize);

    // Remove event listener on cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Breakpoints
  const isMobile = windowSize.width < 641;
  const isTablet = windowSize.width >= 641 && windowSize.width < 1025;
  const isDesktop = windowSize.width >= 1025;
  const isLargeDesktop = windowSize.width >= 1440;

  return {
    width: windowSize.width,
    height: windowSize.height,
    isMobile,
    isTablet,
    isDesktop,
    isLargeDesktop
  };
};
