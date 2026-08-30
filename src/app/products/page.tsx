'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, ArrowRight, Building, Layers, Sparkles, Store, Package } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import CategoryIcon from '@/components/CategoryIcon';
import { Product, Category, Company } from '@/types';
import { useAuth } from '@/context/AuthContext';

// Intelligent product-to-company matcher
function checkProductMatchesCompany(product: Product, companyName: string): boolean {
  if (!product) return false;

  const pComp = (product.company || '').trim().toLowerCase();
  const cName = (companyName || '').trim().toLowerCase();
  const pName = (product.name || '').trim().toLowerCase();

  // 1. Direct or partial exact match
  if (pComp && (pComp === cName || pComp.includes(cName) || cName.includes(pComp))) {
    return true;
  }

  // 2. Specific Brand & Keyword Rules
  if (cName.includes('إيتوز') || cName.includes('ايتوز') || cName.includes('سويس رول')) {
    if (
      pComp.includes('إيتوز') || pComp.includes('ايتوز') || pComp.includes('سويس') ||
      pName.includes('سويس رول') || pName.includes('إيتوز') || pName.includes('ايتوز') ||
      pName.includes('سويس')
    ) {
      return true;
    }
  }

  if (cName.includes('سفن دايز') || cName.includes('7days')) {
    if (
      pComp.includes('سفن دايز') || pComp.includes('7days') ||
      pName.includes('كرواسون') || pName.includes('سفن دايز') || pName.includes('7days')
    ) {
      return true;
    }
  }

  if (cName.includes('بارني') || cName.includes('العائلة')) {
    if (
      pComp.includes('بارني') || pComp.includes('العائلة') ||
      pName.includes('بارني') || pName.includes('العائلة')
    ) {
      return true;
    }
  }

  if (cName.includes('لواكر') || cName.includes('loacker')) {
    if (
      pComp.includes('لواكر') || pComp.includes('loacker') ||
      pName.includes('لواكر') || pName.includes('loacker') ||
      pName.includes('ويفر') || pName.includes('كوكيز')
    ) {
      return true;
    }
  }

  if (cName.includes('أولكر') || cName.includes('اولكر') || cName.includes('ulker')) {
    if (
      pComp.includes('أولكر') || pComp.includes('اولكر') || pComp.includes('ulker') ||
      pName.includes('أولكر') || pName.includes('اولكر') || pName.includes('ulker') ||
      pName.includes('بسكويت')
    ) {
      return true;
    }
  }

  if (cName.includes('أوريو') || cName.includes('اوريو') || cName.includes('oreo')) {
    if (
      pComp.includes('أوريو') || pComp.includes('اوريو') || pComp.includes('oreo') ||
      pName.includes('أوريو') || pName.includes('اوريو') || pName.includes('oreo')
    ) {
      return true;
    }
  }

  if (cName.includes('ليز') || cName.includes('lay')) {
    if (
      pComp.includes('ليز') || pComp.includes('lay') ||
      pName.includes('ليز') || pName.includes('بطاطا') || pName.includes('شيبس')
    ) {
      return true;
    }
  }

  if (cName.includes('برينجلز') || cName.includes('pringles')) {
    if (
      pComp.includes('برينجلز') || pComp.includes('pringles') ||
      pName.includes('برينجلز') || pName.includes('pringles')
    ) {
      return true;
    }
  }

  if (cName.includes('بوز') || cName.includes('pozz')) {
    if (
      pComp.includes('بوز') || pComp.includes('pozz') ||
      pName.includes('بوز') || pName.includes('pozz')
    ) {
      return true;
    }
  }

  if (cName.includes('وايلد تايجر') || cName.includes('tiger')) {
    if (
      pComp.includes('تايجر') || pComp.includes('tiger') ||
      pName.includes('وايلد تايجر') || pName.includes('تايجر') || pName.includes('tiger')
    ) {
      return true;
    }
  }

  if (cName.includes('ريد بول') || cName.includes('red bull')) {
    if (
      pComp.includes('ريد بول') || pComp.includes('red bull') ||
      pName.includes('ريد بول') || pName.includes('red bull')
    ) {
      return true;
    }
  }

  if (cName.includes('راني') || cName.includes('rani')) {
    if (
      pComp.includes('راني') || pComp.includes('rani') ||
      pName.includes('راني') || pName.includes('rani') ||
      pName.includes('عصير')
    ) {
      return true;
    }
  }

  if (cName.includes('ألتونسا') || cName.includes('التونسا') || cName.includes('altunsa')) {
    if (
      pComp.includes('التونسا') || pComp.includes('ألتونسا') || pComp.includes('altunsa') ||
      pName.includes('التونسا') || pName.includes('ألتونسا') || pName.includes('altunsa')
    ) {
      return true;
    }
  }

  if (cName.includes('الدرة') || cName.includes('درة')) {
    if (
      pComp.includes('الدرة') || pComp.includes('درة') ||
      pName.includes('الدرة') || pName.includes('درة')
    ) {
      return true;
    }
  }

  if (cName.includes('لونا') || cName.includes('luna')) {
    if (
      pComp.includes('لونا') || pComp.includes('luna') ||
      pName.includes('لونا') || pName.includes('luna')
    ) {
      return true;
    }
  }

  if (cName.includes('الكفيل')) {
    if (pComp.includes('الكفيل') || pName.includes('الكفيل')) return true;
  }
  if (cName.includes('المراعي')) {
    if (pComp.includes('المراعي') || pName.includes('المراعي')) return true;
  }
  if (cName.includes('جيكور')) {
    if (pComp.includes('جيكور') || pName.includes('جيكور')) return true;
  }

  return false;
}

function normalizeCat(cat: string): string {
  if (!cat) return '';
  return cat.replace('طماطم', 'طماطة').trim();
}

function ProductsCatalog() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const categoryParam = searchParams.get('category') || '';
  const companyParam = searchParams.get('company') || '';
  const queryParam = searchParams.get('query') || '';
  const filterParam = searchParams.get('filter') || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dbCompanies, setDbCompanies] = useState<Company[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(categoryParam);
  const [selectedCompany, setSelectedCompany] = useState<string>(companyParam);
  const [selectedFilter, setSelectedFilter] = useState<string>(filterParam);
  const [searchQuery, setSearchQuery] = useState<string>(queryParam);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (categoryParam) setSelectedCategory(categoryParam);
    if (companyParam) setSelectedCompany(companyParam);
    if (queryParam) setSearchQuery(queryParam);
    if (filterParam) setSelectedFilter(filterParam);
  }, [categoryParam, companyParam, queryParam, filterParam]);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetch('/api/products').then((r) => r.json()),
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/companies').then((r) => r.json()),
    ])
      .then(([prodData, catData, compData]) => {
        if (prodData.success) setProducts(prodData.products || []);
        if (catData.success) setCategories(catData.categories || []);
        if (compData.success) setDbCompanies(compData.companies || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, []);

  // Products in current category
  const categoryProducts = selectedCategory && selectedCategory !== 'الكل'
    ? products.filter((p) => normalizeCat(p.category) === normalizeCat(selectedCategory))
    : products;

  // Real Dynamic Companies for this category from database
  const categoryDbCompanies = selectedCategory && selectedCategory !== 'الكل'
    ? dbCompanies.filter((c) =>
        (c.categories && c.categories.some((cat) => normalizeCat(cat) === normalizeCat(selectedCategory))) ||
        normalizeCat(c.category) === normalizeCat(selectedCategory)
      )
    : dbCompanies;

  // Also collect any company names attached directly to products in this category
  const productCompanyNames = Array.from(
    new Set(categoryProducts.map((p) => p.company?.trim()).filter(Boolean) as string[])
  );

  // Build the unified list of companies for this category
  const dynamicCompanies: Company[] = [];
  
  // 1. Add DB companies
  categoryDbCompanies.forEach((c) => {
    const pCount = categoryProducts.filter((p) => checkProductMatchesCompany(p, c.name)).length;
    dynamicCompanies.push({
      ...c,
      productsCount: pCount,
    });
  });

  // 2. Add product companies if not already in list
  productCompanyNames.forEach((compName) => {
    if (!dynamicCompanies.some((c) => c.name.toLowerCase() === compName.toLowerCase())) {
      const pCount = categoryProducts.filter((p) => checkProductMatchesCompany(p, compName)).length;
      dynamicCompanies.push({
        id: `comp-${compName}`,
        name: compName,
        category: selectedCategory,
        icon: '🏢',
        color: 'bg-blue-50 text-brand-blue',
        productsCount: pCount,
      });
    }
  });

  const filteredCompanies = dynamicCompanies.filter((c) =>
    !searchQuery.trim() || c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter products for view
  const filteredProducts = products.filter((p) => {
    const matchCategory =
      !selectedCategory || selectedCategory === 'الكل' || normalizeCat(p.category) === normalizeCat(selectedCategory);

    if (!matchCategory) return false;

    let matchCompany = true;
    if (selectedCompany && selectedCompany !== 'الكل') {
      matchCompany = checkProductMatchesCompany(p, selectedCompany);
    }

    let matchFilter = true;
    if (selectedFilter === 'offers') {
      matchFilter = Boolean(
        p.isOnOffer || 
        p.offerBadge || 
        (p.originalPrice && p.originalPrice > p.price) || 
        (p.originalWholesalePrice && p.originalWholesalePrice > p.wholesalePrice)
      );
    } else if (selectedFilter === 'bestsellers') {
      matchFilter = Boolean(p.isBestSeller || p.isFeatured);
    } else if (selectedFilter === 'new') {
      matchFilter = Boolean(p.isNew);
    }

    const matchSearch =
      !searchQuery.trim() ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.company && p.company.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchCompany && matchFilter && matchSearch;
  });

  // Handle Back Actions
  const handleBackToCompanies = () => {
    setSelectedCompany('');
    setSearchQuery('');
  };

  const handleBackToHome = () => {
    router.push('/');
  };

  // Only show company picker if there are multiple companies registered for this category
  const isShowingCompanies =
    selectedCategory &&
    selectedCategory !== 'الكل' &&
    !selectedCompany &&
    !queryParam &&
    dynamicCompanies.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-3 select-none">
      {isShowingCompanies ? (
        <div className="space-y-3">
          {/* Top Sticky Bar: Back Arrow + Category Title */}
          <div className="sticky top-0 z-40 bg-[#f3f8fc]/90 backdrop-blur-md pt-1 pb-2 space-y-2.5">
            <div className="flex items-center justify-between">
              <button
                onClick={handleBackToHome}
                className="flex items-center gap-2.5 text-slate-900 hover:text-brand-blue font-black text-xl sm:text-2xl transition group cursor-pointer"
              >
                <ArrowRight className="w-5 h-5 text-slate-900 group-hover:-translate-x-1 transition-transform" />
                <CategoryIcon name={selectedCategory} size="sm" animate={true} />
                <span>{selectedCategory}</span>
              </button>
            </div>

            {/* Search Bar for Companies */}
            <div className="relative w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن شركة..."
                className="w-full bg-white text-slate-800 text-xs sm:text-sm rounded-full py-2.5 pr-10 pl-4 border border-slate-200/80 focus:border-brand-blue focus:outline-none transition shadow-xs placeholder:text-slate-600"
              />
              <Search className="w-4 h-4 text-slate-600 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Subtitle */}
          <p className="text-xs text-slate-500 font-bold text-center sm:text-right pt-0.5">
            اختر الشركة لعرض منتجاتها ({filteredCompanies.length} شركة)
          </p>

          {/* Grid of Companies with REAL Product Counts */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 pb-12">
            {filteredCompanies.map((company) => (
              <div
                key={company.id}
                onClick={() => {
                  setSelectedCompany(company.name);
                  setSearchQuery('');
                }}
                className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col group transform active:scale-98"
              >
                {/* Company Logo / Illustration Banner */}
                <div className="bg-[#f0f7ff] aspect-[4/3] flex items-center justify-center p-3 relative group-hover:bg-blue-50/80 transition overflow-hidden">
                  {company.logo ? (
                    <img
                      src={company.logo}
                      alt={company.name}
                      className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className={'w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl shadow-xs ' + (company.color || 'bg-white')}>
                      <span>{company.icon || '🏢'}</span>
                    </div>
                  )}
                </div>

                {/* Company Name & Accurate Products Count */}
                <div className="p-3 sm:p-4 text-center bg-white border-t border-slate-50 space-y-0.5">
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 line-clamp-1 group-hover:text-brand-blue transition">
                    {company.name}
                  </h3>
                  <span className="text-[11px] text-slate-500 block font-mono font-bold">
                    منتج {company.productsCount ?? 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Top Sticky Bar: Back Arrow + Category — Company */}
          <div className="sticky top-0 z-40 bg-[#f3f8fc]/90 backdrop-blur-md pt-1 pb-2 space-y-2.5">
            <div className="flex items-center justify-between">
              <button
                onClick={selectedCompany ? handleBackToCompanies : handleBackToHome}
                className="flex items-center gap-2 text-slate-900 hover:text-brand-blue font-black text-lg sm:text-xl transition group cursor-pointer"
              >
                <ArrowRight className="w-5 h-5 text-slate-900 group-hover:-translate-x-1 transition-transform" />
                <span>
                  {selectedCategory || 'جميع الأقسام'}
                  {selectedCompany ? ' — ' + selectedCompany : ''}
                </span>
              </button>
            </div>

            {/* Search Input for Products */}
            <div className="relative w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث عن منتج بالاسم أو الباركود..."
                className="w-full bg-white text-slate-800 text-xs sm:text-sm rounded-full py-2.5 pr-10 pl-4 border border-slate-200/80 focus:border-brand-blue focus:outline-none transition shadow-xs placeholder:text-slate-600"
              />
              <Search className="w-4 h-4 text-slate-600 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Products 2-Column Mobile Grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-white rounded-3xl p-3 border border-slate-100 shadow-sm animate-pulse space-y-2">
                  <div className="aspect-square bg-slate-100 rounded-2xl" />
                  <div className="h-3 bg-slate-200 rounded w-3/4" />
                  <div className="h-4 bg-slate-200 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-3">
              <div className="text-4xl">📦</div>
              <h3 className="text-sm font-black text-slate-800">لا توجد منتجات مسجلة في هذه الشركة حالياً</h3>
              <button
                onClick={handleBackToCompanies}
                className="bg-brand-blue hover:bg-brand-blueDark text-white text-xs font-bold py-2 px-4 rounded-xl cursor-pointer"
              >
                رجوع لقائمة الشركات
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 pb-12">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500">جاري تحميل المنتجات والشركات...</p>
        </div>
      }
    >
      <ProductsCatalog />
    </Suspense>
  );
}
