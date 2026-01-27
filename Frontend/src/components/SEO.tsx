import { Helmet } from 'react-helmet-async';
import { getCanonicalUrl, DEFAULT_OG_IMAGE } from '../utils/seo';

export type SEOProps = {
  title: string;
  description: string;
  url?: string;
  image?: string;
  type?: 'website' | 'article' | 'profile';
  noindex?: boolean;
  structuredData?: object | object[] | null;
  preloadImages?: string[];
};

/**
 * Reusable SEO component for all pages
 * Handles meta tags, OpenGraph, Twitter Cards, and structured data
 */
export default function SEO({
  title,
  description,
  url,
  image = DEFAULT_OG_IMAGE,
  type = 'website',
  noindex = false,
  structuredData,
  preloadImages = [],
}: SEOProps) {
  const canonicalUrl = url ? getCanonicalUrl(url) : getCanonicalUrl(window.location.pathname);
  const ogImage = image?.startsWith('http') ? image : getCanonicalUrl(image || DEFAULT_OG_IMAGE);

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Canonical URL */}
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="Tunect" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={canonicalUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* Structured Data (JSON-LD) */}
      {structuredData && (
        <>
          {Array.isArray(structuredData) ? (
            structuredData.map((data, idx) => (
              <script key={idx} type="application/ld+json">
                {JSON.stringify(data)}
              </script>
            ))
          ) : (
            <script type="application/ld+json">
              {JSON.stringify(structuredData)}
            </script>
          )}
        </>
      )}
      {/* Preload images for performance (hero/critical images) */}
      {Array.isArray(preloadImages) && preloadImages.map((img, i) => (
        <link key={i} rel="preload" as="image" href={img.startsWith('http') ? img : getCanonicalUrl(img)} />
      ))}
    </Helmet>
  );
}
