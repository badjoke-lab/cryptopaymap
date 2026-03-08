import type { MetadataRoute } from 'next';

const SITE_URL = 'https://www.cryptopaymap.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/_next/', '/internal', '/internal/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
