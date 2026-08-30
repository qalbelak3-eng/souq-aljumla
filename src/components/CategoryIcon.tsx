'use client';

import React from 'react';
import {
  ShoppingBasket,
  Milk,
  CupSoda,
  Utensils,
  Egg,
  Beef,
  Drumstick,
  Cookie,
  Cake,
  Package,
  Sparkles,
  Coffee,
  Apple,
  Fish,
  Flame,
  Candy,
  Wheat,
  Pizza,
  Popcorn
} from 'lucide-react';

export interface CategoryIconPreset {
  id: string;
  name: string;
  categoryHint: string;
  iconName: string;
  color: string;
  bgLight: string;
  borderLight: string;
}

export const CATEGORY_ICON_PRESETS: CategoryIconPreset[] = [
  {
    id: 'meat',
    name: 'لحوم',
    categoryHint: 'اللحوم وأصنافه',
    iconName: 'beef',
    color: '#e11d48',
    bgLight: 'bg-rose-50',
    borderLight: 'border-rose-100',
  },
  {
    id: 'chicken',
    name: 'دجاج',
    categoryHint: 'الدجاج وأصنافه',
    iconName: 'drumstick',
    color: '#0284c7',
    bgLight: 'bg-sky-50',
    borderLight: 'border-sky-100',
  },
  {
    id: 'egg',
    name: 'بيض',
    categoryHint: 'البيض',
    iconName: 'egg',
    color: '#d97706',
    bgLight: 'bg-amber-50',
    borderLight: 'border-amber-100',
  },
  {
    id: 'groceries',
    name: 'غذائية',
    categoryHint: 'غذائية ومواد عامة',
    iconName: 'basket',
    color: '#16a34a',
    bgLight: 'bg-emerald-50',
    borderLight: 'border-emerald-100',
  },
  {
    id: 'dairy',
    name: 'ألبان',
    categoryHint: 'ألبان وأجبان',
    iconName: 'milk',
    color: '#2563eb',
    bgLight: 'bg-blue-50',
    borderLight: 'border-blue-100',
  },
  {
    id: 'drinks',
    name: 'مشروبات',
    categoryHint: 'مشروبات وعصائر',
    iconName: 'soda',
    color: '#06b6d4',
    bgLight: 'bg-cyan-50',
    borderLight: 'border-cyan-100',
  },
  {
    id: 'snacks',
    name: 'سناكات',
    categoryHint: 'سناكات وشيبس ومقرمشات',
    iconName: 'popcorn',
    color: '#f97316',
    bgLight: 'bg-orange-50',
    borderLight: 'border-orange-100',
  },
  {
    id: 'sweets',
    name: 'حلويات',
    categoryHint: 'بسكويت وحلويات وويفر',
    iconName: 'cookie',
    color: '#b45309',
    bgLight: 'bg-amber-50',
    borderLight: 'border-amber-100',
  },
  {
    id: 'bakery',
    name: 'مخبوزات',
    categoryHint: 'كرواسون وكيك',
    iconName: 'cake',
    color: '#ea580c',
    bgLight: 'bg-orange-50',
    borderLight: 'border-orange-100',
  },
  {
    id: 'grains',
    name: 'بقوليات ورز',
    categoryHint: 'أرز وبقوليات',
    iconName: 'wheat',
    color: '#ca8a04',
    bgLight: 'bg-yellow-50',
    borderLight: 'border-yellow-100',
  },
  {
    id: 'coffee',
    name: 'شاي وقهوة',
    categoryHint: 'شاي وقهوة ومشروبات ساخنة',
    iconName: 'coffee',
    color: '#78350f',
    bgLight: 'bg-amber-50',
    borderLight: 'border-amber-100',
  },
  {
    id: 'candy',
    name: 'شوكولاتة',
    categoryHint: 'شوكولاتة ونوتيلا',
    iconName: 'candy',
    color: '#db2777',
    bgLight: 'bg-pink-50',
    borderLight: 'border-pink-100',
  },
  {
    id: 'cleaning',
    name: 'منظفات',
    categoryHint: 'منظفات وعناية منزلية',
    iconName: 'sparkles',
    color: '#7c3aed',
    bgLight: 'bg-purple-50',
    borderLight: 'border-purple-100',
  },
  {
    id: 'wholesale',
    name: 'كراتين جملة',
    categoryHint: 'عروض كراتين الجملة',
    iconName: 'package',
    color: '#4f46e5',
    bgLight: 'bg-indigo-50',
    borderLight: 'border-indigo-100',
  },
];

export function getCategoryPreset(catName: string, iconKey?: string): CategoryIconPreset {
  if (iconKey) {
    const found = CATEGORY_ICON_PRESETS.find((p) => p.id === iconKey || p.iconName === iconKey);
    if (found) return found;
  }

  const nameLower = (catName || '').toLowerCase();

  if (nameLower.includes('لحم') || nameLower.includes('لحوم')) {
    return CATEGORY_ICON_PRESETS[0];
  }
  if (nameLower.includes('دجاج') || nameLower.includes('طيور')) {
    return CATEGORY_ICON_PRESETS[1];
  }
  if (nameLower.includes('بيض')) {
    return CATEGORY_ICON_PRESETS[2];
  }
  if (nameLower.includes('لبن') || nameLower.includes('ألبان') || nameLower.includes('حليب') || nameLower.includes('جبن')) {
    return CATEGORY_ICON_PRESETS[4];
  }
  if (nameLower.includes('شرب') || nameLower.includes('عصير') || nameLower.includes('مشروب') || nameLower.includes('طاقة')) {
    return CATEGORY_ICON_PRESETS[5];
  }
  if (nameLower.includes('سناك') || nameLower.includes('شيبس') || nameLower.includes('مقرمش')) {
    return CATEGORY_ICON_PRESETS[6];
  }
  if (nameLower.includes('بسكويت') || nameLower.includes('حلو') || nameLower.includes('ويفر') || nameLower.includes('كوكيز')) {
    return CATEGORY_ICON_PRESETS[7];
  }
  if (nameLower.includes('كيك') || nameLower.includes('كرواسون') || nameLower.includes('مخبوز')) {
    return CATEGORY_ICON_PRESETS[8];
  }
  if (nameLower.includes('رز') || nameLower.includes('أرز') || nameLower.includes('بقول')) {
    return CATEGORY_ICON_PRESETS[9];
  }
  if (nameLower.includes('قهوة') || nameLower.includes('شاي')) {
    return CATEGORY_ICON_PRESETS[10];
  }
  if (nameLower.includes('شوكو') || nameLower.includes('كاكاو')) {
    return CATEGORY_ICON_PRESETS[11];
  }
  if (nameLower.includes('نظاف') || nameLower.includes('غسيل')) {
    return CATEGORY_ICON_PRESETS[12];
  }
  if (nameLower.includes('كرتون') || nameLower.includes('جملة')) {
    return CATEGORY_ICON_PRESETS[13];
  }

  // Default to groceries basket
  return CATEGORY_ICON_PRESETS[3];
}

interface CategoryIconProps {
  name: string;
  icon?: string;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  className?: string;
}

export default function CategoryIcon({
  name,
  icon,
  size = 'md',
  animate = true,
  className = '',
}: CategoryIconProps) {
  const preset = getCategoryPreset(name, icon);

  let iconSize = 'w-7 h-7 sm:w-8 sm:h-8';
  if (size === 'sm') iconSize = 'w-5 h-5';
  if (size === 'lg') iconSize = 'w-9 h-9 sm:w-11 sm:h-11';

  const animationClass = animate ? 'animate-icon-sway' : '';

  const renderVector = () => {
    switch (preset.iconName) {
      case 'beef':
        return <Beef className={iconSize} style={{ color: preset.color }} />;
      case 'drumstick':
        return <Drumstick className={iconSize} style={{ color: preset.color }} />;
      case 'egg':
        return <Egg className={iconSize} style={{ color: preset.color }} />;
      case 'milk':
        return <Milk className={iconSize} style={{ color: preset.color }} />;
      case 'soda':
        return <CupSoda className={iconSize} style={{ color: preset.color }} />;
      case 'popcorn':
        return <Popcorn className={iconSize} style={{ color: preset.color }} />;
      case 'cookie':
        return <Cookie className={iconSize} style={{ color: preset.color }} />;
      case 'cake':
        return <Cake className={iconSize} style={{ color: preset.color }} />;
      case 'wheat':
        return <Wheat className={iconSize} style={{ color: preset.color }} />;
      case 'coffee':
        return <Coffee className={iconSize} style={{ color: preset.color }} />;
      case 'candy':
        return <Candy className={iconSize} style={{ color: preset.color }} />;
      case 'sparkles':
        return <Sparkles className={iconSize} style={{ color: preset.color }} />;
      case 'package':
        return <Package className={iconSize} style={{ color: preset.color }} />;
      default:
        return <ShoppingBasket className={iconSize} style={{ color: preset.color }} />;
    }
  };

  return (
    <div className={`flex items-center justify-center ${animationClass} ${className}`}>
      {renderVector()}
    </div>
  );
}
