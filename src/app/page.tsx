import { pgGetBanners } from '@/lib/postgres-banners';
import HomePageClient from '@/components/HomePageClient';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const activeBanners = await pgGetBanners(true);

  return (
    <>
      <h1 className="sr-only">
        سوق الجملة - منصة التجارة الإلكترونية لبيع المواد الغذائية والحلويات بالجملة والمفرد
      </h1>
      <HomePageClient serverBanners={activeBanners} />
    </>
  );
}
