import { getBanners } from '@/lib/db';
import HomePageClient from '@/components/HomePageClient';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const activeBanners = getBanners(true);
  return <HomePageClient serverBanners={activeBanners} />;
}
