'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { X, ExternalLink } from 'lucide-react';
import { PopupAdSettings } from '@/types';

export default function PopupAdvertisement() {
  const [queue, setQueue] = useState<PopupAdSettings[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isOpen, setIsOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.settings) {
          const rawAds: PopupAdSettings[] = Array.isArray(data.settings.popupAds) && data.settings.popupAds.length > 0
            ? data.settings.popupAds
            : (data.settings.popupAd ? [data.settings.popupAd] : []);

          // Filter only enabled ads and check localStorage for seen status
          const activeEligibleAds = rawAds
            .filter((ad) => ad && ad.isEnabled)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .filter((ad) => {
              if (ad.showOncePerUser) {
                const storageKey = `etihad_popup_ad_seen_${ad.id || 'default'}`;
                const seen = localStorage.getItem(storageKey);
                return !seen;
              }
              return true;
            });

          if (activeEligibleAds.length > 0) {
            setQueue(activeEligibleAds);
            setCurrentIndex(0);
            const timer = setTimeout(() => {
              setIsOpen(true);
            }, 400);
            return () => clearTimeout(timer);
          }
        }
      })
      .catch((err) => console.error(err));
  }, []);

  const currentAd: PopupAdSettings | undefined = queue[currentIndex];

  const handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    
    if (currentAd) {
      const storageKey = `etihad_popup_ad_seen_${currentAd.id || 'default'}`;
      localStorage.setItem(storageKey, 'true');
    }

    setIsOpen(false);
    setImgError(false);

    // If there is another ad in queue, open it sequentially after a brief smooth transition
    if (currentIndex + 1 < queue.length) {
      setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
        setIsOpen(true);
      }, 350);
    }
  };

  if (!isOpen || !currentAd || !currentAd.isEnabled) return null;

  const targetImage = imgError
    ? '/sample-iraq-banner.jpg'
    : (currentAd.image || '/sample-iraq-banner.jpg');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6 select-none animate-in fade-in duration-300 print:hidden">
      
      {/* Dark Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs transition-opacity cursor-pointer"
        onClick={handleClose}
      />

      {/* Modal Poster Container (Clean Vertical Image) */}
      <div className="relative max-w-xs sm:max-w-sm w-full z-10 my-auto animate-in zoom-in-95 duration-300 group">
        
        {/* Sequence Indicator badge if multiple ads in queue */}
        {queue.length > 1 && (
          <div className="absolute top-3 right-3 z-30 bg-slate-900/80 text-white text-[10px] font-black px-2.5 py-1 rounded-full border border-white/30 backdrop-blur-md shadow-md pointer-events-none">
            {currentIndex + 1} / {queue.length}
          </div>
        )}

        {/* Floating Top Close Button (X) */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute -top-3.5 -left-3.5 sm:-top-4 sm:-left-4 z-30 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-900/90 hover:bg-brand-coral text-white flex items-center justify-center backdrop-blur-md transition-all shadow-xl cursor-pointer border-2 border-white active:scale-95"
          aria-label="إغلاق الإعلان"
          title="إغلاق (X)"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Clickable Image Poster */}
        <Link
          href={currentAd.linkUrl || '/products'}
          onClick={() => handleClose()}
          className="block relative rounded-3xl overflow-hidden shadow-2xl border-2 border-white/40 bg-slate-900 active:scale-[0.99] transition-transform cursor-pointer"
        >
          <div className="relative w-full aspect-[3/4] sm:aspect-[4/5] max-h-[82vh] overflow-hidden bg-slate-800 flex items-center justify-center">
            <img
              src={targetImage}
              alt={currentAd.title || 'إعلان ترويجي'}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
            />

            {/* Subtle Click Cue Overlay */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 text-center pointer-events-none">
              <span className="inline-flex items-center gap-1.5 bg-brand-coral/95 text-white font-black text-xs px-4 py-1.5 rounded-full shadow-lg backdrop-blur-xs">
                <span>اضغط هنا لمشاهدة العرض</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </Link>

      </div>

    </div>
  );
}