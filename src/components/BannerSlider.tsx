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
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Helper to scroll to specific slide in Hungerstation separated-card carousel
  const scrollToIndex = (idx: number) => {
    if (!scrollRef.current) return;
    const cards = scrollRef.current.querySelectorAll('.banner-slide-card');
    if (cards[idx]) {
      (cards[idx] as HTMLElement).scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
      setCurrentIndex(idx);
    }
  };

  // Detect active index on scroll for peek carousel
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const cards = container.querySelectorAll('.banner-slide-card');
    if (cards.length === 0) return;

    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.left + containerRect.width / 2;

    let closestIndex = 0;
    let minDistance = Infinity;

    cards.forEach((card, idx) => {
      const rect = (card as HTMLElement).getBoundingClientRect();
      const cardCenter = rect.left + rect.width / 2;
      const distance = Math.abs(containerCenter - cardCenter);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });

    setCurrentIndex(closestIndex);
  };

  // Auto slide every 4.5 seconds (paused while user is touching/swiping)
  useEffect(() => {
    if (banners.length <= 1 || isSwiping) return;
    const interval = setInterval(() => {
      const nextIdx = (currentIndex + 1) % banners.length;
      if (isCompact && scrollRef.current) {
        scrollToIndex(nextIdx);
      } else {
        setCurrentIndex(nextIdx);
      }
    }, 4500);
    return () => clearInterval(interval);
  }, [banners.length, currentIndex, isSwiping, isCompact]);

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
    const minSwipeDistance = 40;

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
    const minSwipeDistance = 45;

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
      ? 'aspect-[24/8] sm:aspect-[24/8]'
      : 'aspect-[16/9] sm:aspect-[16/9] min-h-[250px] sm:min-h-[360px] md:min-h-[440px]';
    return (
      <div className={`w-full ${aspectClass} bg-white rounded-3xl animate-pulse border border-slate-100 shadow-sm ${className}`} />
    );
  }

  if (banners.length === 0) return null;

  // 1. HUNGERSTATION STYLE SEPARATED CARDS PEEK CAROUSEL (FOR SECONDARY / COMPACT SLIDERS)
  if (isCompact) {
    if (banners.length === 1) {
      const singleBanner = banners[0];
      return (
        <div className={`relative w-full overflow-hidden rounded-2xl sm:rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-slate-100 bg-white aspect-[24/8] select-none ${className}`}>
          <Link
            href={singleBanner.linkUrl || '/products'}
            className="block relative w-full h-full overflow-hidden"
          >
            <img
              src={singleBanner.image}
              alt={singleBanner.title || 'بنر إعلاني'}
              className="w-full h-full object-cover"
              draggable={false}
            />
          </Link>
        </div>
      );
    }

    return (
      <div className={`relative w-full select-none group ${className}`}>
        {/* Scrollable Track with Peek Effect & Touch Swiping */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onTouchStart={() => setIsSwiping(true)}
          onTouchEnd={() => setTimeout(() => setIsSwiping(false), 2000)}
          className="flex items-center gap-3 sm:gap-4 overflow-x-auto scrollbar-none snap-x snap-mandatory py-1 px-1 sm:px-2 scroll-smooth"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {banners.map((banner) => (
            <div
              key={banner.id}
              className="banner-slide-card w-[87%] sm:w-[92%] shrink-0 snap-center rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_2px_14px_rgba(0,0,0,0.06)] border border-slate-100 aspect-[24/8] bg-white transition-transform active:scale-[0.99]"
            >
              <Link
                href={banner.linkUrl || '/products'}
                className="block relative w-full h-full overflow-hidden"
              >
                <img
                  src={banner.image}
                  alt={banner.title || 'بنر إعلاني'}
                  className="w-full h-full object-cover pointer-events-none"
                  draggable={false}
                />
              </Link>
            </div>
          ))}
        </div>

        {/* Navigation Arrows for Desktop Hover */}
        <button
          type="button"
          onClick={() => {
            const prevIdx = (currentIndex - 1 + banners.length) % banners.length;
            scrollToIndex(prevIdx);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs opacity-0 group-hover:opacity-100 transition shadow z-20 cursor-pointer"
          aria-label="السابق"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            const nextIdx = (currentIndex + 1) % banners.length;
            scrollToIndex(nextIdx);
          }}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs opacity-0 group-hover:opacity-100 transition shadow z-20 cursor-pointer"
          aria-label="التالي"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Pagination Indicator Dots */}
        <div className="flex items-center justify-center gap-1.5 pt-2">
          {banners.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => scrollToIndex(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                currentIndex === idx
                  ? 'w-6 bg-brand-blue shadow-xs'
                  : 'w-1.5 bg-slate-300 hover:bg-slate-400'
              }`}
              aria-label={`انتقال للبنر ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    );
  }

  // 2. STANDARD FULL-WIDTH SLIDER (SMOOTH REAL-TIME FINGER SWIPING & DRAGGING)
  const trackTransform = dragOffset !== 0
    ? `translateX(calc(-${currentIndex * 100}% + ${dragOffset}px))`
    : `translateX(-${currentIndex * 100}%)`;

  const trackTransition = isSwiping
    ? 'none'
    : 'transform 0.42s cubic-bezier(0.25, 1, 0.5, 1)';

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
      {/* Slides Track container with live real-time finger tracking */}
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
              className="block relative w-full aspect-[16/9] sm:aspect-[16/9] min-h-[250px] sm:min-h-[360px] md:min-h-[440px] lg:min-h-[480px] overflow-hidden pointer-events-auto"
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
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs opacity-0 group-hover:opacity-100 transition shadow z-20 cursor-pointer"
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
            className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs opacity-0 group-hover:opacity-100 transition shadow z-20 cursor-pointer"
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
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
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
