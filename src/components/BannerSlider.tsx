'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronLeft, Search } from 'lucide-react';
import { Banner } from '@/types';

interface BannerSliderProps {
  position?: 'top' | 'below_categories' | 'middle' | 'bottom' | 'category' | 'all';
  category?: string;
  className?: string;
  aspectRatio?: 'standard' | 'compact' | 'wide';
  initialData?: Banner[];
}

export default function BannerSlider({ 
  position = 'top', 
  category = '', 
  className = '',
  aspectRatio,
  initialData
}: BannerSliderProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [banners, setBanners] = useState<Banner[]>(() => {
    if (initialData && initialData.length > 0) return initialData;
    return [];
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayIndex, setDisplayIndex] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !initialData || initialData.length === 0);

  // High performance touch and mouse drag physics
  const [isSwiping, setIsSwiping] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialData && initialData.length > 0) {
      setBanners(initialData);
      setIsLoading(false);
    }
  }, [initialData]);

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

  // Infinite loop cloned list: [last, ...banners, first]
  const extendedBanners = useMemo(() => {
    if (banners.length <= 1) return banners;
    const first = banners[0];
    const last = banners[banners.length - 1];
    return [last, ...banners, first];
  }, [banners]);

  // Active indicator dot index (0 to banners.length - 1)
  const activeDotIndex = useMemo(() => {
    if (banners.length <= 1) return 0;
    if (displayIndex <= 0) return banners.length - 1;
    if (displayIndex >= extendedBanners.length - 1) return 0;
    return displayIndex - 1;
  }, [displayIndex, banners.length, extendedBanners.length]);

  // Infinite Loop Navigation Handlers
  const slideNext = useCallback(() => {
    if (banners.length <= 1) return;
    setIsTransitioning(true);
    setDisplayIndex((prev) => prev + 1);
  }, [banners.length]);

  const slidePrev = useCallback(() => {
    if (banners.length <= 1) return;
    setIsTransitioning(true);
    setDisplayIndex((prev) => prev - 1);
  }, [banners.length]);

  const goToSlide = useCallback((index: number) => {
    if (banners.length <= 1) return;
    setIsTransitioning(true);
    setDisplayIndex(index + 1);
  }, [banners.length]);

  // Handle instant jump at the clone edges for seamless continuous loop
  const handleTransitionEnd = () => {
    setIsTransitioning(false);
    if (displayIndex >= extendedBanners.length - 1) {
      setDisplayIndex(1);
    } else if (displayIndex <= 0) {
      setDisplayIndex(banners.length);
    }
  };

  // Auto slide every 4.5 seconds in a continuous infinite forward motion
  useEffect(() => {
    if (banners.length <= 1 || isSwiping) return;
    const interval = setInterval(() => {
      if (isCompact) {
        setCurrentIndex((prev) => (prev + 1) % banners.length);
      } else {
        slideNext();
      }
    }, 4500);
    return () => clearInterval(interval);
  }, [banners.length, isSwiping, isCompact, slideNext]);

  // Dynamic theme-color sync (matches Hungerstation mobile status bar color behind clock and battery)
  useEffect(() => {
    if (position !== 'top') return;

    const updateThemeColor = () => {
      let metaTheme = document.querySelector('meta[name="theme-color"]');
      if (!metaTheme) {
        metaTheme = document.createElement('meta');
        metaTheme.setAttribute('name', 'theme-color');
        document.head.appendChild(metaTheme);
      }
      if (window.scrollY > 40) {
        metaTheme.setAttribute('content', '#ffffff');
      } else {
        const activeColor = banners[activeDotIndex]?.bannerBgColor || '#fff8c1';
        metaTheme.setAttribute('content', activeColor);
      }
    };

    updateThemeColor();
    window.addEventListener('scroll', updateThemeColor, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateThemeColor);
    };
  }, [position, activeDotIndex, banners]);

  // Touch handlers with real-time finger tracking & smart axis lock
  const handleTouchStart = (e: React.TouchEvent) => {
    if (banners.length <= 1) return;
    setIsTransitioning(false);
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
      if (Math.abs(diffX) > 6 || Math.abs(diffY) > 6) {
        isHorizontalSwipe.current = Math.abs(diffX) > Math.abs(diffY);
      }
    }

    if (isHorizontalSwipe.current) {
      setDragOffset(diffX);
    }
  };

  const handleTouchEnd = () => {
    if (banners.length <= 1) return;
    const minSwipeDistance = 30;

    if (isHorizontalSwipe.current && dragOffset !== 0) {
      if (isCompact) {
        if (dragOffset < -minSwipeDistance) {
          setCurrentIndex((prev) => (prev + 1) % banners.length);
        } else if (dragOffset > minSwipeDistance) {
          setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
        }
      } else {
        if (dragOffset < -minSwipeDistance) {
          // Swiped Left -> Move to next slide seamlessly
          slideNext();
        } else if (dragOffset > minSwipeDistance) {
          // Swiped Right -> Move to previous slide seamlessly
          slidePrev();
        } else {
          setIsTransitioning(true);
        }
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
    setIsTransitioning(false);
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
    const minSwipeDistance = 35;

    if (isCompact) {
      if (dragOffset < -minSwipeDistance) {
        setCurrentIndex((prev) => (prev + 1) % banners.length);
      } else if (dragOffset > minSwipeDistance) {
        setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
      }
    } else {
      if (dragOffset < -minSwipeDistance) {
        slideNext();
      } else if (dragOffset > minSwipeDistance) {
        slidePrev();
      } else {
        setIsTransitioning(true);
      }
    }

    setIsSwiping(false);
    setTouchStartX(null);
    setTouchStartY(null);
    setDragOffset(0);
    isHorizontalSwipe.current = null;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?query=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  if (isLoading && banners.length === 0) {
    if (position === 'top') {
      return (
        <div className={`w-full h-[calc(300px+env(safe-area-inset-top,0px))] sm:h-[340px] md:h-[390px] lg:h-[430px] bg-[#fff8c1] rounded-none animate-pulse ${className}`} />
      );
    }
    const aspectClass = isCompact
      ? 'aspect-[22/8] sm:aspect-[24/8] min-h-[140px] sm:min-h-[180px]'
      : 'aspect-[16/9] min-h-[250px] sm:min-h-[360px] md:min-h-[440px]';
    return (
      <div className={`w-full ${aspectClass} bg-white rounded-3xl animate-pulse border border-slate-100 shadow-sm ${className}`} />
    );
  }

  if (banners.length === 0) return null;

  // Single Banner Display
  if (banners.length === 1) {
    const singleBanner = banners[0];
    if (position === 'top') {
      return (
        <div
          className={`relative w-full overflow-hidden select-none rounded-none transition-colors duration-500 ease-out h-[calc(300px+env(safe-area-inset-top,0px))] sm:h-[340px] md:h-[390px] lg:h-[430px] ${className}`}
          style={{ backgroundColor: singleBanner.bannerBgColor || '#f8fafc' }}
        >
          {/* Floating Search Bar on Hero Background */}
          <div className="absolute top-[calc(60px+env(safe-area-inset-top,0px))] sm:top-[64px] md:top-[68px] left-0 right-0 z-20 pointer-events-none">
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
              <form onSubmit={handleSearch} className="relative w-full pointer-events-auto">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث عن المنتج الذي ترغب به"
                  className="w-full bg-white text-slate-800 text-xs sm:text-sm rounded-xl py-2.5 pr-10 pl-4 border border-slate-200/80 focus:border-brand-blue focus:outline-none transition shadow-[0_2px_10px_rgba(0,0,0,0.05)] placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-brand-blue transition cursor-pointer"
                  title="بحث"
                >
                  <Search className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

          <Link
            href={singleBanner.linkUrl || '/products'}
            className="block relative w-full h-full pointer-events-auto"
          >
            <div className="w-full max-w-5xl lg:max-w-6xl mx-auto px-0 sm:px-6 h-full flex items-center justify-center">
              <img
                src={singleBanner.image}
                alt={singleBanner.title || 'بنر إعلاني'}
                className="w-full h-full object-contain pointer-events-none drop-shadow-xs"
                draggable={false}
              />
            </div>
          </Link>
        </div>
      );
    }

    const aspectClass = isCompact
      ? 'aspect-[22/8] sm:aspect-[24/8] min-h-[140px] sm:min-h-[180px]'
      : 'aspect-[16/9] max-h-[360px] sm:max-h-[420px]';
    return (
      <div
        className={`relative w-full overflow-hidden rounded-2xl sm:rounded-3xl shadow-xs border border-slate-100 select-none ${aspectClass} ${className}`}
        style={{ backgroundColor: singleBanner.bannerBgColor || '#f8fafc' }}
      >
        <Link
          href={singleBanner.linkUrl || '/products'}
          className="block relative w-full h-full overflow-hidden"
        >
          <img
            src={singleBanner.image}
            alt={singleBanner.title || 'بنر إعلاني'}
            className="w-full h-full object-contain object-center pointer-events-none"
            draggable={false}
          />
        </Link>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // 1. COMPACT / SECONDARY PEEK CAROUSEL (وسط الشاشة مع ظهور طرف الإعلانين يميناً ويساراً)
  // ═══════════════════════════════════════════════════════════════════
  if (isCompact) {
    // عرض الكرت 84% مع مسافة 3% ليتوسط الكرت النشط وتظهر أطراف الإعلانات المتجاورة
    const cardWidthPercent = 84;
    const gapPercent = 2.5;
    const stepPercent = cardWidthPercent + gapPercent; // 86.5%
    const centerOffset = (100 - cardWidthPercent) / 2; // 8% مسافة متساوية يميناً ويساراً

    const compactTransform = dragOffset !== 0
      ? `translateX(calc(${centerOffset}% - ${currentIndex * stepPercent}% + ${dragOffset}px))`
      : `translateX(calc(${centerOffset}% - ${currentIndex * stepPercent}%))`;

    const compactTransition = isSwiping
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
        className={`relative w-full overflow-hidden select-none group cursor-grab active:cursor-grabbing touch-pan-y py-1 ${className}`}
      >
        {/* Track with live real-time finger tracking & centered peek effect */}
        <div
          className="flex items-center will-change-transform"
          style={{
            transform: compactTransform,
            transition: compactTransition,
            direction: 'ltr',
            gap: `${gapPercent}%`,
          }}
        >
          {banners.map((banner) => (
            <div
              key={banner.id}
              className="w-[84%] shrink-0 rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_3px_14px_rgba(0,0,0,0.07)] border border-slate-100/90 aspect-[22/8] sm:aspect-[24/8] min-h-[135px] sm:min-h-[175px] bg-white transition-transform active:scale-[0.99]"
            >
              <Link
                href={banner.linkUrl || '/products'}
                onClick={(e) => {
                  if (Math.abs(dragOffset) > 10) {
                    e.preventDefault();
                  }
                }}
                className="block relative w-full h-full overflow-hidden pointer-events-auto"
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

        {/* Navigation Arrows for Desktop Hover */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs opacity-0 group-hover:opacity-100 transition shadow z-20 cursor-pointer"
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
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
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

  // ═══════════════════════════════════════════════════════════════════
  // 2. STANDARD FULL-WIDTH SLIDER (ORIGINAL MAIN TOP BANNERS - INFINITE LOOP)
  // ═══════════════════════════════════════════════════════════════════
  const trackTransform = dragOffset !== 0
    ? `translateX(calc(-${displayIndex * 100}% + ${dragOffset}px))`
    : `translateX(-${displayIndex * 100}%)`;

  const trackTransition = isTransitioning && !isSwiping
    ? 'transform 0.42s cubic-bezier(0.25, 1, 0.5, 1)'
    : 'none';

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
      style={{ backgroundColor: banners[activeDotIndex]?.bannerBgColor || '#f8fafc' }}
      className={`relative w-full overflow-hidden select-none group cursor-grab active:cursor-grabbing touch-pan-y transition-colors duration-500 ease-out ${
        position === 'top'
          ? 'rounded-none h-[calc(300px+env(safe-area-inset-top,0px))] sm:h-[340px] md:h-[390px] lg:h-[430px]'
          : 'rounded-2xl sm:rounded-3xl shadow-xs border border-slate-100 aspect-[16/9]'
      } ${className}`}
    >
      {/* 0. Floating Search Bar over Hero Track (scrolls naturally with page) */}
      {position === 'top' && (
        <div className="absolute top-[calc(60px+env(safe-area-inset-top,0px))] sm:top-[64px] md:top-[68px] left-0 right-0 z-20 pointer-events-none">
          <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">
            <form onSubmit={handleSearch} className="relative w-full pointer-events-auto">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن المنتج الذي ترغب به"
                className="w-full bg-white text-slate-800 text-xs sm:text-sm rounded-xl py-2.5 pr-10 pl-4 border border-slate-200/80 focus:border-brand-blue focus:outline-none transition shadow-[0_2px_10px_rgba(0,0,0,0.05)] placeholder:text-slate-500"
              />
              <button
                type="submit"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-brand-blue transition cursor-pointer"
                title="بحث"
              >
                <Search className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Slides Track with infinite continuous loop */}
      <div
        className="flex flex-row flex-nowrap w-full h-full will-change-transform"
        onTransitionEnd={handleTransitionEnd}
        style={{
          transform: trackTransform,
          transition: trackTransition,
          direction: 'ltr',
        }}
      >
        {extendedBanners.map((banner, idx) => (
          <div
            key={`${banner.id}-${idx}`}
            className="w-full flex-shrink-0 relative overflow-hidden h-full"
            style={{ backgroundColor: banner.bannerBgColor || '#f8fafc' }}
          >
            <Link
              href={banner.linkUrl || '/products'}
              onClick={(e) => {
                if (Math.abs(dragOffset) > 10) {
                  e.preventDefault();
                }
              }}
              className="block relative w-full h-full pointer-events-auto"
            >
              {position === 'top' ? (
                <div className="w-full max-w-5xl lg:max-w-6xl mx-auto px-0 sm:px-6 h-full flex items-center justify-center">
                  <img
                    src={banner.image}
                    alt={banner.title || 'بنر إعلاني'}
                    className="w-full h-full object-contain pointer-events-none drop-shadow-xs"
                    draggable={false}
                  />
                </div>
              ) : (
                <img
                  src={banner.image}
                  alt={banner.title || 'بنر إعلاني'}
                  className="w-full h-full object-contain object-center pointer-events-none"
                  draggable={false}
                />
              )}
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
              slidePrev();
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
              slideNext();
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs opacity-0 group-hover:opacity-100 transition shadow z-20 cursor-pointer"
            aria-label="التالي"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Pagination Indicator Pills / Dots (Hungerstation Style Capsule) */}
      {banners.length > 1 && (
        <div className="absolute bottom-2 sm:bottom-3 md:bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-slate-200/80">
            {banners.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  goToSlide(idx);
                }}
                className={`rounded-full transition-all duration-300 cursor-pointer ${
                  activeDotIndex === idx
                    ? 'w-2 h-2 bg-slate-900 scale-110 shadow-2xs'
                    : 'w-1.5 h-1.5 bg-slate-300/90 hover:bg-slate-400'
                }`}
                aria-label={`انتقال للبنر ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
