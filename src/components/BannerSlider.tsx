'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { Banner } from '@/types';

interface BannerSliderProps {
  position?: 'top' | 'middle' | 'all';
  className?: string;
}

export default function BannerSlider({ position = 'top', className = '' }: BannerSliderProps) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Touch and drag states
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/banners?position=${encodeURIComponent(position)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.banners)) {
          setBanners(data.banners);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, [position]);

  // Auto slide every 4.5 seconds (paused while user is touching/swiping)
  useEffect(() => {
    if (banners.length <= 1 || isSwiping) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [banners.length, isSwiping]);

  // Touch Swipe Handlers for Mobile (سحب وتحريك يدوي سلس بالأصبع)
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsSwiping(true);
    setTouchStartX(e.targetTouches[0].clientX);
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const currentX = e.targetTouches[0].clientX;
    setTouchEndX(currentX);
    const diff = currentX - touchStartX;
    setDragOffset(diff);
  };

  const handleTouchEnd = () => {
    if (touchStartX !== null && touchEndX !== null) {
      const distance = touchStartX - touchEndX;
      const minSwipeDistance = 45; // pixels needed to trigger swipe

      if (distance > minSwipeDistance) {
        // Swiped Left -> Next Banner in RTL
        setCurrentIndex((prev) => (prev + 1) % banners.length);
      } else if (distance < -minSwipeDistance) {
        // Swiped Right -> Previous Banner in RTL
        setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
      }
    }

    setIsSwiping(false);
    setTouchStartX(null);
    setTouchEndX(null);
    setDragOffset(0);
  };

  // Mouse Drag Handlers for Desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsSwiping(true);
    setTouchStartX(e.clientX);
    setTouchEndX(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSwiping || touchStartX === null) return;
    setTouchEndX(e.clientX);
    setDragOffset(e.clientX - touchStartX);
  };

  const handleMouseUp = () => {
    if (isSwiping && touchStartX !== null && touchEndX !== null) {
      const distance = touchStartX - touchEndX;
      const minSwipeDistance = 50;

      if (distance > minSwipeDistance) {
        setCurrentIndex((prev) => (prev + 1) % banners.length);
      } else if (distance < -minSwipeDistance) {
        setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
      }
    }

    setIsSwiping(false);
    setTouchStartX(null);
    setTouchEndX(null);
    setDragOffset(0);
  };

  const isMiddle = position === 'middle';
  const aspectClass = isMiddle
    ? 'aspect-[21/9] sm:aspect-[24/8] min-h-[140px] sm:min-h-[200px] md:min-h-[250px]'
    : 'aspect-[16/9] sm:aspect-[16/9] min-h-[250px] sm:min-h-[360px] md:min-h-[440px] lg:min-h-[480px]';

  if (isLoading) {
    return (
      <div className={`w-full ${aspectClass} bg-white rounded-3xl animate-pulse border border-slate-100 shadow-sm ${className}`} />
    );
  }

  if (banners.length === 0) return null;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={`relative w-full overflow-hidden rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-slate-100 select-none group bg-white cursor-grab active:cursor-grabbing touch-pan-y ${className}`}
    >
      {/* Slides Track container */}
      <div
        className="flex w-full transition-transform duration-500 ease-out"
        style={{
          transform: `translateX(-${currentIndex * 100}%)`,
          direction: 'ltr',
        }}
      >
        {banners.map((banner, index) => (
          <div key={banner.id} className="w-full flex-shrink-0 relative">
            <Link
              href={banner.linkUrl || '/products'}
              onClick={(e) => {
                // If user dragged/swiped, don't trigger navigation
                if (Math.abs(dragOffset) > 10) {
                  e.preventDefault();
                }
              }}
              className={`block relative w-full ${aspectClass} overflow-hidden`}
            >
              <img
                src={banner.image}
                alt={banner.title || 'بنر إعلاني'}
                className="w-full h-full object-cover object-center pointer-events-none"
                draggable={false}
              />
            </Link>
          </div>
        ))}
      </div>

      {/* Navigation Arrows (Desktop) */}
      {banners.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs opacity-0 group-hover:opacity-100 transition shadow z-20"
            aria-label="السابق"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentIndex((prev) => (prev + 1) % banners.length);
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs opacity-0 group-hover:opacity-100 transition shadow z-20"
            aria-label="التالي"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Pagination Indicator Pills / Dots */}
      {banners.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20 bg-black/30 backdrop-blur-xs px-2.5 py-1 rounded-full pointer-events-auto">
          {banners.map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentIndex === idx
                  ? 'w-6 bg-white shadow-xs'
                  : 'w-1.5 bg-white/50 hover:bg-white'
              }`}
              aria-label={`انتقال للبنر ${idx + 1}`}
            />
          ))}
        </div>
      )}

    </div>
  );
}
