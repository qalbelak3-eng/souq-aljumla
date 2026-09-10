'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { Banner } from '@/types';

interface BannerSliderProps {
  position?: 'top' | 'below_categories' | 'middle' | 'bottom' | 'category' | 'all';
  category?: string;
  className?: string;
  aspectRatio?: 'standard' | 'compact' | 'wide';
}

export default function BannerSlider({ 
  position = 'top', 
  category = '', 
  className = '',
  aspectRatio
}: BannerSliderProps) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Silky Smooth Touch & Drag gesture states
  const [isSwiping, setIsSwiping] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let url = `/api/banners?position=${encodeURIComponent(position)}`;
    if (category) {
      url += `&category=${encodeURIComponent(category)}`;
    }

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.banners)) {
          // Filter out campaign showcases that have product sliders
          const regularBanners = data.banners.filter((b: Banner) => !b.isCampaignShowcase);
          setBanners(regularBanners);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, [position, category]);

  const isCompact = aspectRatio === 'compact' || position === 'middle' || position === 'bottom' || position === 'category' || position === 'below_categories';

  // Auto slide every 4.5 seconds (paused while user is touching/swiping)
  useEffect(() => {
    if (banners.length <= 1 || isSwiping) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [banners.length, isSwiping]);

  // Touch handlers with real-time finger tracking & smart axis lock
  const handleTouchStart = (e: React.TouchEvent) => {
    if (banners.length <= 1) return;
    setIsSwiping(true);
    setTouchStartX(e.targetTouches[0].clientX);
    setTouchStartY(e.targetTouches[0].clientY);
    isHorizontalSwipe.current = null;
    setDragOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null || banners.length <= 1) return;
    const currentX = e.targetTouches[0].clientX;
    const currentY = e.targetTouches[0].clientY;
    const diffX = currentX - touchStartX;
    const diffY = currentY - touchStartY;

    if (isHorizontalSwipe.current === null) {
      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        isHorizontalSwipe.current = Math.abs(diffX) > Math.abs(diffY);
      }
    }

    if (isHorizontalSwipe.current) {
      // Finger follows live horizontally
      setDragOffset(diffX);
    }
  };

  const handleTouchEnd = () => {
    if (banners.length <= 1) return;
    const minSwipeDistance = 35;

    if (isHorizontalSwipe.current && dragOffset !== 0) {
      if (dragOffset < -minSwipeDistance) {
        // Swiped Left -> Go Next
        setCurrentIndex((prev) => (prev + 1) % banners.length);
      } else if (dragOffset > minSwipeDistance) {
        // Swiped Right -> Go Prev
        setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
      }
    }

    setIsSwiping(false);
    setTouchStartX(null);
    setTouchStartY(null);
    setDragOffset(0);
    isHorizontalSwipe.current = null;
  };

  // Mouse Drag handlers for Desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if (banners.length <= 1) return;
    setIsSwiping(true);
    setTouchStartX(e.clientX);
    setTouchStartY(e.clientY);
    isHorizontalSwipe.current = true;
    setDragOffset(0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSwiping || touchStartX === null || banners.length <= 1) return;
    const diffX = e.clientX - touchStartX;
    setDragOffset(diffX);
  };

  const handleMouseUp = () => {
    if (!isSwiping || banners.length <= 1) return;
    const minSwipeDistance = 40;

    if (dragOffset < -minSwipeDistance) {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    } else if (dragOffset > minSwipeDistance) {
      setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
    }

    setIsSwiping(false);
    setTouchStartX(null);
    setTouchStartY(null);
    setDragOffset(0);
    isHorizontalSwipe.current = null;
  };

  if (isLoading) {
    const aspectClass = isCompact
      ? 'aspect-[21/8] sm:aspect-[24/8] min-h-[140px] sm:min-h-[180px]'
      : 'aspect-[16/9] min-h-[250px] sm:min-h-[360px] md:min-h-[440px]';
    return (
      <div className={`w-full ${aspectClass} bg-white rounded-3xl animate-pulse border border-slate-100 shadow-sm ${className}`} />
    );
  }

  if (banners.length === 0) return null;

  // Single Banner Display
  if (banners.length === 1) {
    const singleBanner = banners[0];
    const aspectClass = isCompact
      ? 'aspect-[21/8] sm:aspect-[24/8] min-h-[140px] sm:min-h-[180px]'
      : 'aspect-[16/9] min-h-[250px] sm:min-h-[360px] md:min-h-[440px] lg:min-h-[480px]';
    return (
      <div className={`relative w-full overflow-hidden rounded-2xl sm:rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-slate-100 bg-white ${aspectClass} select-none ${className}`}>
        <Link
          href={singleBanner.linkUrl || '/products'}
          className="block relative w-full h-full overflow-hidden"
        >
          <img
            src={singleBanner.image}
            alt={singleBanner.title || 'بنر إعلاني'}
            className="w-full h-full object-cover object-center"
            draggable={false}
          />
        </Link>
      </div>
    );
  }

  // Multi-Banner Slider (Used for both Primary & Secondary Banners with Real-time Touch Swipe)
  const trackTransform = dragOffset !== 0
    ? `translateX(calc(-${currentIndex * 100}% + ${dragOffset}px))`
    : `translateX(-${currentIndex * 100}%)`;

  const trackTransition = isSwiping
    ? 'none'
    : 'transform 0.42s cubic-bezier(0.25, 1, 0.5, 1)';

  const aspectClass = isCompact
    ? 'aspect-[21/8] sm:aspect-[24/8] min-h-[140px] sm:min-h-[180px]'
    : 'aspect-[16/9] min-h-[250px] sm:min-h-[360px] md:min-h-[440px] lg:min-h-[480px]';

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
      className={`relative w-full overflow-hidden rounded-2xl sm:rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-slate-100 select-none group bg-white cursor-grab active:cursor-grabbing touch-pan-y ${className}`}
    >
      {/* Slides Track with live real-time finger tracking */}
      <div
        className="flex w-full will-change-transform"
        style={{
          transform: trackTransform,
          transition: trackTransition,
          direction: 'ltr',
        }}
      >
        {banners.map((banner) => (
          <div key={banner.id} className="w-full flex-shrink-0 relative">
            <Link
              href={banner.linkUrl || '/products'}
              onClick={(e) => {
                // Prevent accidental navigation if the user was swiping/dragging
                if (Math.abs(dragOffset) > 12) {
                  e.preventDefault();
                }
              }}
              className={`block relative w-full ${aspectClass} overflow-hidden pointer-events-auto`}
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

      {/* Navigation Arrows (Desktop Hover) */}
      {banners.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
            }}
            className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs opacity-0 group-hover:opacity-100 transition shadow z-20 cursor-pointer"
            aria-label="السابق"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCurrentIndex((prev) => (prev + 1) % banners.length);
            }}
            className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs opacity-0 group-hover:opacity-100 transition shadow z-20 cursor-pointer"
            aria-label="التالي"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Pagination Indicator Pills / Dots */}
      {banners.length > 1 && (
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20 bg-black/30 backdrop-blur-xs px-2.5 py-0.5 rounded-full pointer-events-auto">
          {banners.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                currentIndex === idx
                  ? 'w-5 sm:w-6 bg-white shadow-xs'
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
