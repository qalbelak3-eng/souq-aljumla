'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShoppingBag,
  Star,
  ShieldCheck,
  Truck,
  ArrowRight,
  MessageCircle,
  Package,
  Plus,
  Minus,
  Check,
  Lock,
  Store,
  Sparkles,
  ChevronLeft
} from 'lucide-react';
import { Product, SaleType } from '@/types';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import ProductCard from '@/components/ProductCard';

export default function ProductDetailPage() {
  const params = useParams();
  const productId = params.id as string;
  const { addToCart } = useCart();
  const { isApprovedMerchant } = useAuth();

  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [saleType, setSaleType] = useState<SaleType>(isApprovedMerchant ? 'wholesale' : 'retail');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSaleType(isApprovedMerchant ? 'wholesale' : 'retail');
  }, [isApprovedMerchant]);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/products/${productId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.product) {
          setProduct(data.product);
          setSelectedImage(data.product.images[0] || '');

          fetch(`/api/products?category=${encodeURIComponent(data.product.category)}`)
            .then((r) => r.json())
            .then((relData) => {
              if (relData.success) {
                setRelatedProducts(
                  relData.products.filter((p: Product) => p.id !== data.product.id).slice(0, 4)
                );
              }
            });
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, [productId]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <div className="w-10 h-10 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-slate-500 font-bold">جاري تحميل بيانات الصنف...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="text-4xl">📦</div>
        <h2 className="text-xl font-black text-slate-800">الصنف غير موجود</h2>
        <Link
          href="/products"
          className="inline-block bg-brand-blue text-white font-bold text-xs py-2.5 px-6 rounded-xl shadow"
        >
          العودة لقائمة الأصناف
        </Link>
      </div>
    );
  }

  const activePrice = saleType === 'wholesale' ? product.wholesalePrice : product.price;
  const activeUnit = saleType === 'wholesale' ? product.wholesaleUnit : product.retailUnit;
  const totalPrice = activePrice * quantity;

  const handleAddToCart = () => {
    addToCart(product, quantity, saleType);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 text-xs">
      
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-slate-600">
        <Link href="/" className="hover:text-brand-blue transition">الرئيسية</Link>
        <span>/</span>
        <Link href={`/products?category=${encodeURIComponent(product.category)}`} className="hover:text-brand-blue transition">
          {product.category}
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-bold truncate max-w-xs">{product.name}</span>
      </nav>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Product Image */}
        <div className="lg:col-span-6">
          <div className="aspect-square bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex items-center justify-center relative">
            <img
              src={selectedImage || product.images[0]}
              alt={product.name}
              className="w-full h-full object-contain max-h-[400px]"
            />
            {product.origin && (
              <span className="absolute top-4 right-4 bg-slate-100 text-slate-700 text-xs font-bold px-3 py-1 rounded-full border border-slate-200">
                📍 {product.origin}
              </span>
            )}
          </div>
        </div>

        {/* Product Info & Actions */}
        <div className="lg:col-span-6 space-y-5">
          
          <div>
            <span className="inline-block bg-sky-50 text-brand-blue border border-sky-100 text-xs font-black px-3 py-1 rounded-full mb-2">
              {product.category}
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
              {product.name}
            </h1>
          </div>

          {/* Pricing Box */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            
            {isApprovedMerchant ? (
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Store className="w-5 h-5 text-emerald-700" />
                  <div>
                    <span className="text-xs font-black text-emerald-800 block">حساب تاجر معتمد 👑</span>
                    <span className="text-[11px] text-emerald-600">سعر كرتون الجملة مفعّل تلقائياً</span>
                  </div>
                </div>
                <span className="text-base font-black text-slate-900">{product.wholesalePrice.toLocaleString()} د.ع</span>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex items-center justify-between text-xs text-amber-900 gap-2">
                <div className="space-y-0.5">
                  <span className="font-bold text-[11px] block">👑 هل أنت صاحب محل أو سوبرماركت؟</span>
                  <span className="text-[10px] text-amber-700 block">سجل حساب ماركت للحصول على خصومات إضافية على الكراتين.</span>
                </div>
                <Link
                  href="/register?type=merchant"
                  className="shrink-0 bg-amber-400 hover:bg-amber-300 text-slate-900 font-black text-[11px] py-1.5 px-3 rounded-xl shadow-xs transition"
                >
                  تسجيل ماركت ⚡
                </Link>
              </div>
            )}

            {/* Packaging Unit Switcher (مفرد vs كرتون) */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setSaleType('retail')}
                className={`p-3 rounded-2xl border text-right transition cursor-pointer flex flex-col justify-between ${
                  saleType === 'retail'
                    ? 'border-brand-blue bg-blue-50/50 text-slate-900 font-bold ring-2 ring-blue-200'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div>
                  <span className="text-xs font-black block text-slate-800">شراء بالمفرد 🛒</span>
                  <span className="text-[11px] text-slate-500 block">({product.retailUnit || 'قطعة'})</span>
                </div>
                <span className="text-sm font-black text-brand-blue font-mono mt-1">
                  {product.price.toLocaleString()} د.ع
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSaleType('wholesale')}
                className={`p-3 rounded-2xl border text-right transition cursor-pointer flex flex-col justify-between ${
                  saleType === 'wholesale'
                    ? 'border-emerald-500 bg-emerald-50/50 text-slate-900 font-bold ring-2 ring-emerald-200'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div>
                  <span className="text-xs font-black block text-slate-800">شراء بالكرتون 📦</span>
                  <span className="text-[11px] text-slate-500 block">({product.wholesaleUnit || 'كرتون'})</span>
                </div>
                <span className="text-sm font-black text-emerald-700 font-mono mt-1">
                  {activePrice.toLocaleString()} د.ع
                </span>
              </button>
            </div>

            {/* Total Calculation */}
            <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-600 block">الإجمالي:</span>
                <span className="text-xl font-black text-brand-coral">
                  {totalPrice.toLocaleString()} <span className="text-xs font-normal text-slate-600">د.ع</span>
                </span>
              </div>

              {/* Quantity Selector */}
              <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-8 h-8 rounded-lg bg-white flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 transition shadow-xs cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  min="1"
                  value={quantity === 0 ? '' : quantity}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                    if (isNaN(val)) {
                      setQuantity(1);
                    } else {
                      setQuantity(Math.max(0, val));
                    }
                  }}
                  onBlur={() => {
                    if (!quantity || quantity < 1) setQuantity(1);
                  }}
                  onFocus={(e) => e.target.select()}
                  className="w-16 h-8 text-center text-sm font-black text-slate-900 font-mono bg-white border border-slate-200 rounded-lg focus:border-brand-blue focus:outline-none transition shadow-inner"
                  title="اضغط لكتابة العدد المطلوب مباشرة"
                />
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-8 h-8 rounded-lg bg-white flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 transition shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <button
              onClick={handleAddToCart}
              className={`w-full text-white font-black py-3.5 px-6 rounded-2xl shadow-md transition flex items-center justify-center gap-2 text-xs sm:text-sm transform active:scale-98 cursor-pointer ${
                product.originalPrice && product.originalPrice > product.price
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 shadow-rose-200'
                  : 'bg-[#16a34a] hover:bg-[#15803d] shadow-sm'
              }`}
            >
              {added ? <Check className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
              <span>{added ? 'تمت الإضافة للسلة بنجاح!' : `اشتري الآن (${quantity})`}</span>
            </button>

            <a
              href={`https://api.whatsapp.com/send?phone=9647700000000&text=${encodeURIComponent(
                `مرحباً مؤسسة الاتحاد 🇮🇶، أود الاستفسار عن الصنف: ${product.name} - الكمية: ${quantity}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-2xl transition flex items-center justify-center gap-2 text-xs shadow-xs"
            >
              <MessageCircle className="w-4 h-4" />
              <span>طلب واستفسار مباشر عبر واتساب</span>
            </a>
          </div>

          {/* Description */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-2">
            <h3 className="font-bold text-slate-900 text-xs">تفاصيل الصنف:</h3>
            <p className="text-slate-600 leading-relaxed text-xs">
              {product.description}
            </p>
          </div>

        </div>
      </div>

      {/* Related Products: 2 Columns Grid on Mobile */}
      {relatedProducts.length > 0 && (
        <div className="space-y-4 border-t border-slate-200 pt-8">
          <h2 className="text-base sm:text-lg font-black text-slate-900">
            أصناف وسناكات أخرى قد تعجبك ✦
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
