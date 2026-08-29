// src/hooks/useTVMode.ts
import { useState, useEffect } from 'react';

export function useTVMode() {
  const [isTVMode, setIsTVMode] = useState(false);

  useEffect(() => {
    // Detect if user is on Android TV / FireStick
    const detectTV = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      
      // Check for Android TV
      const isAndroidTV = 
        userAgent.includes('android') && 
        (userAgent.includes('tv') || 
         userAgent.includes('aftm') ||  // Fire TV Model
         userAgent.includes('aftt') ||  // Fire TV Stick
         userAgent.includes('aftb') ||  // Fire TV Box
         userAgent.includes('aftso'));  // Fire TV Stick 4K
      
      // Check for other Smart TVs
      const isSmartTV = 
        userAgent.includes('smart-tv') ||
        userAgent.includes('smarttv') ||
        userAgent.includes('web0s') ||  // LG WebOS
        userAgent.includes('tizen') ||  // Samsung Tizen
        userAgent.includes('netcast');  // LG NetCast
      
      // Check screen size (TVs are usually 720p+)
      const isLargeScreen = window.innerWidth >= 1280;
      
      return (isAndroidTV || isSmartTV) && isLargeScreen;
    };

    const tvMode = detectTV();
    setIsTVMode(tvMode);

    // Store in localStorage for persistence
    if (tvMode) {
      localStorage.setItem('tv_mode', 'true');
    }

    // Allow manual override with keyboard shortcut
    const handleKeyPress = (e: KeyboardEvent) => {
      // Press Ctrl+Shift+T to toggle TV mode
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
