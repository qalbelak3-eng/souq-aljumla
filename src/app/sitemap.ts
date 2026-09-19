import { MetadataRoute } from 'next';
import { getProducts } from '@/lib/db';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://souqaljomla.com';

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/products`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];

  try {
    const products = getProducts();
    const productRoutes: MetadataRoute.Sitemap = products
      .filter((p) => typeof p.id === 'string' && p.id.trim().length > 0)
      .map((p) => ({
        url: `${baseUrl}/product/${p.id}`,
        lastModified: p.createdAt ? new Date(p.createdAt) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.7,
      }));

    return [...staticRoutes, ...productRoutes];
  } catch (error) {
    console.error('Sitemap generation error:', error);
    return staticRoutes;
  }
}
