'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

interface ScrollNavContextType {
  isNavVisible: boolean;
  setIsNavVisible: (visible: boolean) => void;
}

const ScrollNavContext = createContext<ScrollNavContextType>({
  isNavVisible: true,
  setIsNavVisible: () => {},
});

export function ScrollNavProvider({ children }: { children: React.ReactNode }) {
  const [isNavVisible, setIsNavVisible] = useState(true);
  const pathname = usePathname();

  // Reset visibility to true whenever the user changes pages
  useEffect(() => {
    setIsNavVisible(true);
  }, [pathname]);

  useEffect(() => {
    let lastScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;

          // Always show when near top of the page
          if (currentScrollY <= 60) {
            setIsNavVisible(true);
          } else if (currentScrollY > lastScrollY + 10) {
            // User scrolled down -> hide bottom nav smoothly
            setIsNavVisible(false);
          } else if (currentScrollY < lastScrollY - 10) {
            // User scrolled up -> show bottom nav smoothly
            setIsNavVisible(true);
          }

          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <ScrollNavContext.Provider value={{ isNavVisible, setIsNavVisible }}>
      {children}
    </ScrollNavContext.Provider>
  );
}

export const useScrollNav = () => useContext(ScrollNavContext);
