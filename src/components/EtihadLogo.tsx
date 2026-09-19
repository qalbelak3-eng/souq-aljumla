import React from 'react';
import Link from 'next/link';

interface EtihadLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  showTagline?: boolean;
}

export default function EtihadLogo({ className = '', size = 'md', href = '', showTagline = false }: EtihadLogoProps) {
  const sizeClasses = {
    sm: 'h-9 sm:h-10',
    md: 'h-11 sm:h-14',
    lg: 'h-14 sm:h-20',
  };

  const content = (
    <div className={`relative inline-flex items-center group transition-transform duration-300 hover:scale-[1.02] ${className}`}>
      {/* Official Souq Al-Jumla Logo Image */}
      <img
        src="/souq-aljumla-logo.png?v=3"
        alt="سوق جملة كربلاء"
        className={`${sizeClasses[size]} w-auto object-contain drop-shadow-xs transition-opacity`}
      />
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block focus:outline-none focus:ring-2 focus:ring-brand-blue/30 rounded-xl">
        {content}
      </Link>
    );
  }

  return content;
}
