import { getBanners } from '@/lib/db';
import HomePageClient from '@/components/HomePageClient';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const activeBanners = getBanners(true);
  return (
    <>
      <h1 className="sr-only">
        سوق جملة كربلاء — منصة تجارة المواد الغذائية والمنزلية بالجملة
      </h1>
      <HomePageClient serverBanners={activeBanners} />
    </>
  );
}
