import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://souqaljomla.com';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin/',
        '/api/',
        '/cart',
        '/checkout',
        '/orders',
        '/order-success/',
        '/profile',
        '/driver/',
        '/statement',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
