import { useState, useEffect } from 'react';

export function useTVMode() {
  const [isTVMode, setIsTVMode] = useState(false);

  useEffect(() => {
    // Detect if user is on Android TV / FireStick
    const detectTV = () => {
      const userAgent = navigator.userAgent.toLowerCase();

      // aftm/aftt/aftb/aftso are the various fire tv device codes
      const isAndroidTV =
        userAgent.includes('android') &&
        (userAgent.includes('tv') ||
         userAgent.includes('aftm') ||
         userAgent.includes('aftt') ||
         userAgent.includes('aftb') ||
         userAgent.includes('aftso'));

      const isSmartTV =
        userAgent.includes('smart-tv') ||
        userAgent.includes('smarttv') ||
        userAgent.includes('web0s') ||
        userAgent.includes('tizen') ||
        userAgent.includes('netcast');

      const isLargeScreen = window.innerWidth >= 1280;
      
      return (isAndroidTV || isSmartTV) && isLargeScreen;
    };

    const tvMode = detectTV();
    setIsTVMode(tvMode);

    if (tvMode) {
      localStorage.setItem('tv_mode', 'true');
    }

    // ctrl+shift+t manually toggles it
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        setIsTVMode((prev) => {
          const newValue = !prev;
          localStorage.setItem('tv_mode', newValue ? 'true' : 'false');
          return newValue;
        });
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return isTVMode;
}
