import React from 'react';
import { Crown, Star, Award, Sparkles } from 'lucide-react';
import { MerchantTier } from '@/types';

interface MerchantTierBadgeProps {
  tier?: MerchantTier;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export default function MerchantTierBadge({
  tier = 'bronze',
  size = 'md',
  showIcon = true,
  className = '',
}: MerchantTierBadgeProps) {
  if (tier === 'gold') {
    const sizeClasses =
      size === 'sm'
        ? 'text-[10px] px-2 py-0.5 gap-1'
        : size === 'lg'
        ? 'text-xs sm:text-sm px-3.5 py-1.5 gap-1.5 font-black'
        : 'text-[11px] px-2.5 py-1 gap-1 font-black';

    return (
      <span
        className={`inline-flex items-center rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 text-slate-950 font-black shadow-[0_2px_8px_rgba(245,158,11,0.35)] border border-amber-300/80 animate-pulse-slow ${sizeClasses} ${className}`}
        title="حساب تاجر ذهبي VIP - أعلى فئة تخفيضات"
      >
        {showIcon && <Crown className={size === 'lg' ? 'w-4 h-4 text-amber-950' : 'w-3 h-3 text-amber-950'} />}
        <span>تاجر ذهبي (VIP) 👑</span>
      </span>
    );
  }

  if (tier === 'silver') {
    const sizeClasses =
      size === 'sm'
        ? 'text-[10px] px-2 py-0.5 gap-1'
        : size === 'lg'
        ? 'text-xs sm:text-sm px-3.5 py-1.5 gap-1.5 font-black'
        : 'text-[11px] px-2.5 py-1 gap-1 font-black';

    return (
      <span
        className={`inline-flex items-center rounded-full bg-gradient-to-r from-slate-200 via-slate-100 to-slate-300 text-slate-900 font-black shadow-[0_2px_8px_rgba(148,163,184,0.35)] border border-slate-300 ${sizeClasses} ${className}`}
        title="حساب تاجر فضي - أسعار خاصة"
      >
        {showIcon && <Star className={size === 'lg' ? 'w-4 h-4 text-slate-700 fill-slate-700' : 'w-3 h-3 text-slate-700 fill-slate-700'} />}
        <span>تاجر فضي (خاص) ⭐</span>
      </span>
    );
  }

  // Default: Bronze
  const sizeClasses =
    size === 'sm'
      ? 'text-[10px] px-2 py-0.5 gap-1'
      : size === 'lg'
      ? 'text-xs sm:text-sm px-3.5 py-1.5 gap-1.5 font-black'
      : 'text-[11px] px-2.5 py-1 gap-1 font-black';

  return (
    <span
      className={`inline-flex items-center rounded-full bg-gradient-to-r from-[#b46536] via-[#cd7f32] to-[#9c4d21] text-amber-50 font-black shadow-[0_2px_8px_rgba(180,101,54,0.35)] border border-amber-600/60 ${sizeClasses} ${className}`}
      title="حساب تاجر برونزي - أسعار جملة"
    >
      {showIcon && <Award className={size === 'lg' ? 'w-4 h-4 text-amber-200' : 'w-3 h-3 text-amber-200'} />}
      <span>تاجر برونزي (جملة) 🥉</span>
    </span>
  );
}
