import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductById } from '@/lib/db';
import { Product, PublicProduct } from '@/types';
import ProductDetailClient from './ProductDetailClient';

// ⚡ FRESHNESS STRATEGY (CURRENT ARCHITECTURE):
// Using force-dynamic ensures that product price, active promotional offers, and stock
// reflect real-time updates from store_db.json without serving stale cached prices to Google or users.
// Note: When migrating to a multi-vendor scalable database in future phases, this can be transitioned
// to targeted on-demand revalidation (e.g. revalidateTag / revalidatePath).
export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

/**
 * Strips internal cost and administrative fields before sending data to client components.
 */
function sanitizeProductForPublic(product: Product): PublicProduct {
  const {
    costPrice,
    boxCostPrice,
    pieceCostPrice,
    minStockAlert,
    expiryAlertDays,
    orderedWholesaleQty,
    orderedMarketQty,
    orderedRetailQty,
    orderedTotalQty,
    ...publicProduct
  } = product;

  return publicProduct;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const product = getProductById(params.id);
  if (!product) {
    return {
      title: 'الصنف غير موجود | سوق جملة كربلاء',
      description: 'الصنف المطلوب غير متوفر حالياً في سوق جملة كربلاء.',
    };
  }

  const title = `${product.name} | سوق جملة كربلاء`;
  const description = product.description && product.description.trim().length > 0
    ? product.description.slice(0, 160)
    : `تسوق ${product.name} بالجملة والمفرد من سوق جملة كربلاء بأفضل الأسعار المباشرة في كربلاء والعراق.`;

  const imageUrl = product.images && product.images.length > 0
    ? (product.images[0].startsWith('http') ? product.images[0] : `https://souqaljomla.com${product.images[0]}`)
    : 'https://souqaljomla.com/app-icon.png';

  return {
    title,
    description,
    alternates: {
      canonical: `https://souqaljomla.com/product/${product.id}`,
    },
    openGraph: {
      title,
      description,
      url: `https://souqaljomla.com/product/${product.id}`,
      siteName: 'سوق جملة كربلاء',
      images: [
        {
          url: imageUrl,
          alt: product.name,
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const product = getProductById(params.id);
  if (!product) {
    notFound();
  }

  const safeProduct = sanitizeProductForPublic(product);

  const productImageUrl = safeProduct.images && safeProduct.images.length > 0
    ? (safeProduct.images[0].startsWith('http') ? safeProduct.images[0] : `https://souqaljomla.com${safeProduct.images[0]}`)
    : 'https://souqaljomla.com/app-icon.png';

  // 1. كود Schema للمنتج والعرض (بيانات حقيقية 100% ومطابقة لسعر المفرد الظاهر للزبائن)
  const productJsonLd: any = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: safeProduct.name,
    description: safeProduct.description && safeProduct.description.trim().length > 0
      ? safeProduct.description
      : `${safeProduct.name} - متوفر في سوق جملة كربلاء`,
    image: productImageUrl,
    sku: safeProduct.id,
    category: safeProduct.category,
    offers: {
      '@type': 'Offer',
      url: `https://souqaljomla.com/product/${safeProduct.id}`,
      priceCurrency: 'IQD',
      price: safeProduct.price,
      availability: (typeof safeProduct.stock === 'number' && safeProduct.stock > 0)
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };

  if (safeProduct.company && safeProduct.company.trim().length > 0) {
    productJsonLd.brand = {
      '@type': 'Brand',
      name: safeProduct.company,
    };
  }

  // 2. كود مسار التنقل BreadcrumbList باستخدام الروابط الكنسية الصريحة
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'الرئيسية',
        item: 'https://souqaljomla.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'المنتجات',
        item: 'https://souqaljomla.com/products',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: safeProduct.name,
        item: `https://souqaljomla.com/product/${safeProduct.id}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <ProductDetailClient initialProduct={safeProduct} productId={params.id} />
    </>
  );
}
