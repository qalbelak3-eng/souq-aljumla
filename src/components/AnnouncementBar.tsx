'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Megaphone, Truck, Tag } from 'lucide-react';

export default function AnnouncementBar() {
  const [bannerText, setBannerText] = useState<string>('');
  const [isVisible, setIsVisible] = useState<boolean>(true);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.settings?.bannerText) {
          setBannerText(data.settings.bannerText);
        }
      })
      .catch((err) => console.error(err));
  }, []);

  if (!bannerText || !isVisible) return null;

  return (
    <div className="bg-gradient-to-r from-brand-blue via-indigo-700 to-brand-blue text-white py-1.5 px-4 text-xs font-bold shadow-xs relative z-50 overflow-hidden print:hidden">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 text-center">
        
        <div className="flex-1 flex items-center justify-center gap-2 truncate">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-yellow-300 shrink-0 animate-pulse">
            <Sparkles className="w-3 h-3" />
          </span>
          <span className="text-[11px] sm:text-xs text-white font-medium tracking-wide">
            {bannerText}
          </span>
        </div>

      </div>
    </div>
  );
}
