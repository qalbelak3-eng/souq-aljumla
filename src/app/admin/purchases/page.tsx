'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Package,
  Plus,
  Search,
  Printer,
  Trash2,
  Eye,
  Building2,
  DollarSign,
  Calendar,
  CreditCard,
  FileText,
  X,
  Check,
  AlertTriangle,
  Layers,
  ArrowRight,
  TrendingDown,
  UserCheck,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { PurchaseInvoice, PurchaseInvoiceItem, Company, Product, CustomerAccountSummary } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';
import EtihadLogo from '@/components/EtihadLogo';

interface SupplierAccount {
  name: string;
  businessName?: string;
  phone: string;
  city?: string;
  address?: string;
  pricingTier?: string;
  category?: string;
}

export default function AdminPurchasesPage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('souq_admin_purchases_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
    }
    return [];
  });

  const [suppliers, setSuppliers] = useState<SupplierAccount[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('souq_admin_suppliers_cache');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return [];
  });

  const [allAccounts, setAllAccounts] = useState<CustomerAccountSummary[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('souq_admin_accounts_cache');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return [];
  });

  const [companies, setCompanies] = useState<Company[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('souq_admin_companies_cache');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return [];
  });

  const [products, setProducts] = useState<Product[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('souq_admin_products_cache');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return [];
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('الكل');
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('souq_admin_purchases_cache');
        if (cached && JSON.parse(cached).length > 0) return false;
      } catch (e) {}
    }
    return true;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // New Invoice Modal State
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [invSupplierName, setInvSupplierName] = useState('');
  const [invSupplierPhone, setInvSupplierPhone] = useState('');
  const [invDate, setInvDate] = useState(new Date().toISOString().split('T')[0]);
  const [invPaymentMethod, setInvPaymentMethod] = useState<'cash' | 'credit' | 'partial'>('cash');
  const [invPaidAmount, setInvPaidAmount] = useState<string>('');
  const [invNotes, setInvNotes] = useState('');
  const [invItems, setInvItems] = useState<Array<{
    productId: string;
    productName: string;
    company: string;
    unit: string;
    quantity: number;
    costPrice: number;
    boxesPerCarton: number;
    itemsPerBox: number;
  }>>([
    { productId: '', productName: '', company: '', unit: 'كرتون', quantity: 10, costPrice: 0, boxesPerCarton: 1, itemsPerBox: 1 }
  ]);

  // View Invoice Modal
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);

  const fetchData = async () => {
    if (invoices.length === 0) setIsLoading(true);
    if (invoices.length > 0) setIsRefreshing(true);
    try {
      const [invRes, compRes, prodRes, accRes] = await Promise.all([
        fetch('/api/purchases', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/companies', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/products', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ success: false })),
        fetch('/api/accounting/accounts', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ success: false })),
      ]);

      if (invRes && invRes.success) {
        setInvoices(invRes.invoices || []);
        if (typeof window !== 'undefined') {
          localStorage.setItem('souq_admin_purchases_cache', JSON.stringify(invRes.invoices || []));
        }
      }
      if (compRes && compRes.success) {
        setCompanies(compRes.companies || []);
        if (typeof window !== 'undefined') {
          localStorage.setItem('souq_admin_companies_cache', JSON.stringify(compRes.companies || []));
        }
      }
      if (prodRes && prodRes.success && Array.isArray(prodRes.products)) {
        setProducts(prodRes.products);
        if (typeof window !== 'undefined') {
          localStorage.setItem('souq_admin_products_cache', JSON.stringify(prodRes.products));
        }
      }
      if (accRes && accRes.success && Array.isArray(accRes.accounts)) {
        setAllAccounts(accRes.accounts);
        if (typeof window !== 'undefined') {
          localStorage.setItem('souq_admin_accounts_cache', JSON.stringify(accRes.accounts));
        }
        const supAccounts: SupplierAccount[] = accRes.accounts
          .filter((a: CustomerAccountSummary) => a.category === 'supplier')
          .map((a: CustomerAccountSummary) => ({
            name: a.name,
            businessName: a.businessName,
            phone: a.phone,
            city: a.city,
            address: a.address,
            pricingTier: a.pricingTier,
            category: a.category,
          }));
        setSuppliers(supAccounts);
        if (typeof window !== 'undefined') {
          localStorage.setItem('souq_admin_suppliers_cache', JSON.stringify(supAccounts));
        }
      }
    } catch (e) {
      console.error('Error loading purchases data:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openNewModal = () => {
    if (products.length === 0) {
      fetch('/api/products')
        .then(r => r.json())
        .then(d => d.success && setProducts(d.products || []));
    }
    if (allAccounts.length === 0) {
      fetch('/api/accounting/accounts')
        .then(r => r.json())
        .then(d => d.success && setAllAccounts(d.accounts || []));
    }

    const firstSup = suppliers[0]?.name || (invoices[0]?.companyName) || '';
    const supPhone = suppliers.find(s => s.name === firstSup)?.phone || '';
    setInvSupplierName(firstSup);
    setInvSupplierPhone(supPhone);
    setInvDate(new Date().toISOString().split('T')[0]);
    setInvPaymentMethod('cash');
    setInvPaidAmount('');
    setInvNotes('');
    
    // First product in system or empty item
    const firstProd = products[0];
    if (firstProd) {
      setInvItems([
        {
          productId: firstProd.id,
          productName: firstProd.name,
          company: firstProd.company || '',
          unit: firstProd.wholesaleUnit || 'كرتون',
          quantity: 10,
          costPrice: firstProd.costPrice || 7000,
          boxesPerCarton: firstProd.boxesPerCarton || 6,
          itemsPerBox: firstProd.itemsPerBox || 24,
        }
      ]);
    } else {
      setInvItems([
        {
          productId: '',
          productName: '',
          company: '',
          unit: 'كرتون',
          quantity: 10,
          costPrice: 0,
          boxesPerCarton: 1,
          itemsPerBox: 1,
        }
      ]);
    }
    setIsNewModalOpen(true);
  };

  const addItemRow = () => {
    setInvItems(prev => [
      ...prev,
      {
        productId: '',
        productName: '',
        company: '',
        unit: 'كرتون',
        quantity: 10,
        costPrice: 0,
        boxesPerCarton: 1,
        itemsPerBox: 1,
      }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (invItems.length <= 1) return;
    setInvItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItemRow = (index: number, field: string, value: any) => {
    setInvItems(prev => {
      const next = [...prev];
      if (field === 'productId') {
        const prod = products.find(p => p.id === value);
        if (prod) {
          next[index] = {
            ...next[index],
            productId: prod.id,
            productName: prod.name,
            company: prod.company || '',
            unit: prod.wholesaleUnit || 'كرتون',
            costPrice: prod.costPrice || next[index].costPrice || 0,
            boxesPerCarton: prod.boxesPerCarton || 1,
            itemsPerBox: prod.itemsPerBox || 1,
          };

          // ⚡ يفتح سطر جديد تلقائياً بمجرد اختيار صنف في آخر سطر
          if (index === next.length - 1) {
            next.push({
              productId: '',
              productName: '',
              company: '',
              unit: 'كرتون',
              quantity: 10,
              costPrice: 0,
              boxesPerCarton: 1,
              itemsPerBox: 1,
            });
          }
        }
      } else {
        next[index] = { ...next[index], [field]: value };
      }
      return next;
    });
  };

  const calculateModalTotal = () => {
    return invItems.reduce((sum, item) => {
      if (!item.productId) return sum;
      return sum + (Number(item.quantity) || 0) * (Number(item.costPrice) || 0);
    }, 0);
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = invItems.filter(it => it.productId && it.productId.trim() !== '');
    if (!invSupplierName || !invSupplierName.trim()) {
      toast.error('يرجى تحديد أو إدخال الشركة المجهزة');
      return;
    }
    if (validItems.length === 0) {
      toast.error('يرجى اختيار صنف واحد على الأقل في الفاتورة');
      return;
    }

    const total = calculateModalTotal();
    let paid = total;
    let remaining = 0;

    if (invPaymentMethod === 'credit') {
      paid = 0;
      remaining = total;
    } else if (invPaymentMethod === 'partial') {
      paid = Number(invPaidAmount.replace(/\D/g, '')) || 0;
      remaining = Math.max(0, total - paid);
    }

    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: invSupplierName.trim(),
          supplierPhone: invSupplierPhone,
          date: invDate,
          paymentMethod: invPaymentMethod,
          paidAmount: paid,
          remainingAmount: remaining,
          notes: invNotes,
          items: validItems,
        }),
      });
      const data = await res.json();
      if (data.success && data.invoice) {
        setInvoices(prev => [data.invoice, ...prev]);
        setIsNewModalOpen(false);
        toast.success('تم تسجيل فاتورة الشراء وتحديث المخزون بنجاح ✅');
        // Refresh products to show updated stock
        fetch('/api/products')
          .then(r => r.json())
          .then(d => d.success && setProducts(d.products || []));
      } else {
        toast.error(data.error || 'فشل حفظ الفاتورة');
      }
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء حفظ الفاتورة');
    }
  };

  const handleDeleteInvoice = async (id: string, invoiceNumber?: string) => {
    const isConfirmed = await confirm({
      title: 'حذف فاتورة الشراء',
      message: `هل أنت متأكد من حذف فاتورة الشراء ${invoiceNumber ? `(#${invoiceNumber})` : ''} نهائياً؟\nسيتم إرجاع الكميات وضبط المخزون وفقاً لذلك.`,
      confirmText: 'نعم، احذف الفاتورة',
      cancelText: 'تراجع',
      type: 'danger',
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/purchases/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setInvoices(prev => prev.filter(inv => inv.id !== id));
        toast.info('تم حذف فاتورة الشراء بنجاح');
      }
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء حذف الفاتورة');
    }
  };

  // KPI Calculations
  const totalPurchasesAmount = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalItemsSupplied = invoices.reduce((sum, inv) => sum + inv.items.reduce((s, it) => s + it.quantity, 0), 0);
  const lowStockCount = products.filter(p => p.stock <= (p.minStockAlert ?? 15)).length;

  // Build unique supplier list for filters (combining registered suppliers and invoice records)
  const uniqueSuppliersList = Array.from(
    new Set([
      ...suppliers.map(s => s.name),
      ...invoices.map(inv => inv.companyName).filter(Boolean)
    ])
  );

  const filteredInvoices = invoices.filter(inv => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.companyName.toLowerCase().includes(q) ||
      inv.items.some(it => it.productName.toLowerCase().includes(q));

    if (!matchesSearch) return false;
    if (selectedSupplier !== 'الكل' && inv.companyName !== selectedSupplier) return false;
    return true;
  });

  return (
    <div className="space-y-6 text-xs">
      
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-blue" />
            <span>نظام فواتير المشتريات والتوريد 📦</span>
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-0.5">
            تسجيل فواتير الشراء من الشركات المجهزة وتحديث المخزون وأسعار التكلفة تلقائياً
          </p>
        </div>

        <button
          onClick={openNewModal}
          className="bg-brand-blue hover:bg-brand-blueDark text-white font-black text-xs py-3 px-5 rounded-2xl shadow-md transition flex items-center gap-2 transform active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>إنشاء فاتورة شراء وتوريد جديدة ⚡</span>
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 font-bold">
            <span>إجمالي مبالغ المشتريات</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {totalPurchasesAmount.toLocaleString()} <span className="text-xs font-normal text-slate-500">د.ع</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 font-bold">
            <span>عدد فواتير التوريد</span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-brand-blue flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {invoices.length} <span className="text-xs font-normal text-slate-500">فاتورة</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 font-bold">
            <span>الكميات الموردة للمخزن</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {totalItemsSupplied.toLocaleString()} <span className="text-xs font-normal text-slate-500">كرتون/وحدة</span>
          </div>
        </div>

        <Link
          href="/admin/products"
          className={`p-5 rounded-3xl border shadow-xs space-y-2 transition block ${
            lowStockCount > 0
              ? 'bg-amber-50/70 border-amber-300 hover:bg-amber-100/60 ring-2 ring-amber-200/50'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 font-bold">
            <span className="flex items-center gap-1.5 text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>أصناف قاربت على النفاذ</span>
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {lowStockCount} <span className="text-xs font-bold text-amber-800">صنف بحاجة لتوريد ⚠️</span>
          </div>
        </Link>

      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث برقم الفاتورة، اسم المجهز، أو الصنف..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 pr-9 pl-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand-blue"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedSupplier('الكل')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition whitespace-nowrap cursor-pointer ${
              selectedSupplier === 'الكل'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            جميع المجهزين ({invoices.length})
          </button>
          {uniqueSuppliersList.map(supName => {
            const count = invoices.filter(inv => inv.companyName === supName).length;
            return (
              <button
                key={supName}
                onClick={() => setSelectedSupplier(supName)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition whitespace-nowrap cursor-pointer ${
                  selectedSupplier === supName
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                🏭 {supName} ({count})
              </button>
            );
          })}
        </div>

      </div>

      {/* Invoices List Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative">
        {isRefreshing && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-blue via-emerald-500 to-brand-blue animate-pulse z-10" />
        )}
        {isLoading && invoices.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-bold">جاري تحميل فواتير المشتريات...</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="py-20 text-center text-slate-400 space-y-3">
            <Package className="w-12 h-12 mx-auto text-slate-300" />
            <h3 className="font-bold text-slate-700 text-sm">لا توجد فواتير مشتريات مسجلة</h3>
            <p className="text-xs text-slate-500">اضغط على زر إنشاء فاتورة شراء لتسجيل بضاعة جديدة وتحديث المخزون</p>
            <button
              onClick={openNewModal}
              className="mt-2 bg-brand-blue text-white font-bold py-2 px-5 rounded-xl text-xs cursor-pointer hover:bg-brand-blueDark transition"
            >
              + إضافة أول فاتورة شراء
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                <tr className="divide-x divide-x-reverse divide-slate-200">
                  <th className="py-3.5 px-4">رقم الفاتورة</th>
                  <th className="py-3.5 px-4">الشركة المجهزة / المورد</th>
                  <th className="py-3.5 px-4">تاريخ الفاتورة</th>
                  <th className="py-3.5 px-4 text-center">عدد الأصناف</th>
                  <th className="py-3.5 px-4 text-center">طريقة السداد</th>
                  <th className="py-3.5 px-4 text-left">المبلغ الإجمالي</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/60 transition divide-x divide-x-reverse divide-slate-100">
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-mono font-black text-brand-blue text-xs">{inv.invoiceNumber}</span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-black text-slate-900 flex items-center gap-1.5">
                        <span className="text-purple-600 font-bold">🏭</span>
                        <span>{inv.companyName}</span>
                      </div>
                      {inv.notes && <div className="text-[10px] text-slate-400 truncate max-w-xs">{inv.notes}</div>}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 font-bold font-mono">
                      {inv.date}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-center">
                      <span className="bg-blue-50 text-brand-blue font-bold px-2.5 py-0.5 rounded-full text-[11px]">
                        {inv.items.length} أصناف
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-center">
                      {inv.paymentMethod === 'cash' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          💵 نقد (واصل)
                        </span>
                      ) : inv.paymentMethod === 'credit' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          ⏳ آجل (دين)
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                          💳 جزئي (واصل: {(inv.paidAmount || 0).toLocaleString()} | دين: {(inv.remainingAmount || 0).toLocaleString()} د.ع)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-left font-mono font-black text-purple-800 text-sm">
                      {inv.totalAmount.toLocaleString()} د.ع
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl border border-slate-200 transition cursor-pointer"
                          title="معاينة وطباعة الفاتورة"
                        >
                          <Eye className="w-3.5 h-3.5 text-brand-blue" />
                        </button>
                        <button
                          onClick={() => handleDeleteInvoice(inv.id, inv.invoiceNumber)}
                          className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl border border-red-200 transition cursor-pointer"
                          title="حذف الفاتورة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE NEW PURCHASE INVOICE MODAL */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full p-6 space-y-4 text-xs my-auto max-h-[92vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-brand-blue" />
                  <span>تسجيل فاتورة شراء وتوريد بضاعة جديدة 📦</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                  ابحث عن الشركة المجهزة أو اختر من دليل الحسابات وأضف أي أصناف مسجلة في المتجر
                </p>
              </div>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} className="space-y-4">
              
              {/* Top Row: Supplier Smart Search, Date, Payment Method */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-purple-50/40 p-4 rounded-2xl border border-purple-100">
                
                {/* Smart Searchable Supplier Combobox */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-black text-slate-800 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-purple-700" />
                      <span>الشركة المجهزة / المورد *:</span>
                    </label>
                    <Link
                      href="/admin/accounting?tab=add_account"
                      target="_blank"
                      className="text-[10px] text-purple-700 hover:text-purple-900 font-bold flex items-center gap-0.5 hover:underline"
                      title="فتح صفحة إضافة حساب مجهز جديد"
                    >
                      <span>+ حساب مجهز جديد</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </Link>
                  </div>

                  <SearchableSupplierSelect
                    suppliers={suppliers}
                    allAccounts={allAccounts}
                    value={invSupplierName}
                    onChange={(val) => {
                      setInvSupplierName(val);
                      const matched = allAccounts.find(a => a.name === val || a.businessName === val);
                      if (matched) setInvSupplierPhone(matched.phone);
                    }}
                    onSelectAccount={(acc) => {
                      setInvSupplierName(acc.name);
                      setInvSupplierPhone(acc.phone || '');
                    }}
                  />
                </div>

                {/* Invoice Date */}
                <div className="space-y-1">
                  <label className="font-black text-slate-800 block flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-brand-blue" />
                    <span>تاريخ الفاتورة *:</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={invDate}
                    onChange={(e) => setInvDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:border-brand-blue font-mono"
                  />
                </div>

                {/* Payment Method Selector */}
                <div className="space-y-1">
                  <label className="font-black text-slate-800 block flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                    <span>طريقة السداد *:</span>
                  </label>
                  <select
                    value={invPaymentMethod}
                    onChange={(e) => {
                      const method = e.target.value as any;
                      setInvPaymentMethod(method);
                      if (method === 'partial' && !invPaidAmount) {
                        const total = calculateModalTotal();
                        setInvPaidAmount(total > 0 ? String(Math.round(total / 2)) : '');
                      }
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:border-brand-blue font-bold"
                  >
                    <option value="cash">💵 نقداً (واصل ومسدد بالكامل)</option>
                    <option value="credit">⏳ آجل (دين على الحساب بالكامل)</option>
                    <option value="partial">💳 دفع جزئي (واصل جزء ومتبقي دين)</option>
                  </select>
                </div>

              </div>

              {/* Partial Payment Breakdown Inputs (Shows only when 'partial' is selected) */}
              {invPaymentMethod === 'partial' && (
                <div className="bg-blue-50/70 border border-blue-200 p-4 rounded-2xl space-y-3 animate-fadeIn">
                  <div className="flex items-center gap-2 text-blue-900 font-black">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    <span>تفاصيل الدفع الجزئي لفاتورة المشتريات:</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-700 block">
                          المبلغ المدفوع نقد / واصل (د.ع) *:
                        </label>
                        {invPaidAmount && Number(invPaidAmount.replace(/\D/g, '')) > 0 && (
                          <span className="text-[11px] font-black text-emerald-700 font-mono bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            {Number(invPaidAmount.replace(/\D/g, '')).toLocaleString()} د.ع
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        required
                        value={invPaidAmount ? Number(invPaidAmount.replace(/\D/g, '')).toLocaleString() : ''}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '');
                          setInvPaidAmount(raw);
                        }}
                        placeholder="أدخل المبلغ المسدد نقداً (مثال: 1,500,000)..."
                        className="w-full bg-white border border-blue-300 rounded-xl py-2 px-3 text-xs font-black text-emerald-700 font-mono text-left focus:border-blue-600 focus:outline-none"
                      />
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-blue-200 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">المبلغ المتبقي دين (علينا للمجهز):</span>
                        <span className="text-base font-black text-amber-700 font-mono">
                          {Math.max(0, calculateModalTotal() - (Number(invPaidAmount.replace(/\D/g, '')) || 0)).toLocaleString()} د.ع
                        </span>
                      </div>
                      <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-1 rounded-lg">
                        دين آجل ⏳
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Items Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                    <span>قائمة السلع والأصناف المشتراة في الفاتورة:</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-bold">
                    (يمكنك اختيار أو البحث عن أي صنف • يفتح سطر جديد تلقائياً ⚡)
                  </span>
                </div>

                <div className="space-y-3 min-h-[140px]">
                  {invItems.map((item, idx) => {
                    const totalCartons = Number(item.quantity) || 0;
                    const costPerCarton = Number(item.costPrice) || 0;
                    const rowTotal = totalCartons * costPerCarton;

                    return (
                      <div
                        key={idx}
                        className="bg-slate-50/90 border border-slate-200 p-3 rounded-2xl space-y-2 relative"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                          {/* Product Selector */}
                          <div className="sm:col-span-6 space-y-0.5">
                            <label className="text-[10px] font-bold text-slate-700 block pb-0.5">اسم الصنف:</label>
                            <SearchableProductSelect
                              allProducts={products}
                              selectedProductId={item.productId}
                              onSelect={(prod) => {
                                updateItemRow(idx, 'productId', prod.id);
                              }}
                            />
                          </div>

                          {/* Cartons Quantity */}
                          <div className="sm:col-span-2 space-y-0.5">
                            <label className="text-[10px] font-bold text-slate-700 block pb-0.5">عدد الكراتين:</label>
                            <input
                              type="number"
                              min="1"
                              required
                              value={item.quantity}
                              onChange={(e) => updateItemRow(idx, 'quantity', Number(e.target.value))}
                              placeholder="1"
                              className="w-full bg-white border border-slate-300 rounded-xl py-2 px-2 text-xs font-black text-slate-900 text-center font-mono focus:border-brand-blue"
                            />
                          </div>

                          {/* Carton Cost Price */}
                          <div className="sm:col-span-2 space-y-0.5">
                            <label className="text-[10px] font-bold text-slate-700 block pb-0.5">سعر شراء الكرتون (د.ع):</label>
                            <input
                              type="number"
                              min="0"
                              step="250"
                              required
                              value={item.costPrice}
                              onChange={(e) => updateItemRow(idx, 'costPrice', Number(e.target.value))}
                              placeholder="0"
                              className="w-full bg-white border border-slate-300 rounded-xl py-2 px-2 text-xs font-black text-slate-900 font-mono text-center focus:border-brand-blue"
                            />
                          </div>

                          {/* Row Total */}
                          <div className="sm:col-span-1 space-y-0.5 text-center">
                            <label className="text-[10px] font-bold text-slate-600 block pb-0.5">الإجمالي:</label>
                            <div className="font-mono font-black text-purple-700 text-xs py-2 whitespace-nowrap">
                              {rowTotal.toLocaleString()} د.ع
                            </div>
                          </div>

                          {/* Delete Row */}
                          <div className="sm:col-span-1 text-center pt-2 sm:pt-4">
                            <button
                              type="button"
                              disabled={invItems.length <= 1}
                              onClick={() => removeItemRow(idx)}
                              className="text-red-500 hover:text-red-700 disabled:opacity-20 p-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer"
                              title="حذف هذا السطر"
                            >
                              <Trash2 className="w-4 h-4 mx-auto" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="text-brand-blue hover:text-brand-blueDark font-bold text-xs flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100/80 px-3.5 py-2 rounded-xl border border-blue-200 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ إضافة سطر صنف جديد</span>
                  </button>
                </div>
              </div>

              {/* Total & Notes */}
              <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="w-full sm:w-1/2 space-y-1">
                  <label className="font-bold text-purple-950 block">ملاحظات الفاتورة (اختياري):</label>
                  <input
                    type="text"
                    value={invNotes}
                    onChange={(e) => setInvNotes(e.target.value)}
                    placeholder="مثال: واصل مع السائق، بضاعة تاريخ إنتاج جديد..."
                    className="w-full bg-white border border-purple-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-900"
                  />
                </div>

                <div className="text-left space-y-0.5">
                  <span className="text-xs font-bold text-purple-900 block">إجمالي مبلغ فاتورة الشراء:</span>
                  <span className="text-xl font-black text-purple-900 font-mono">
                    {calculateModalTotal().toLocaleString()} د.ع
                  </span>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-brand-blue hover:bg-brand-blueDark text-white font-black py-2.5 rounded-xl shadow-md transition cursor-pointer"
                >
                  حفظ الفاتورة وتحديث المخزون 🚀
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* VIEW & PRINT PURCHASE INVOICE MODAL */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-5 text-xs my-8">
            
            {/* Header / Actions */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 no-print">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-blue" />
                <span>معاينة فاتورة الشراء والتوريد</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-brand-blue text-white font-bold py-1.5 px-3.5 rounded-xl flex items-center gap-1.5 hover:bg-brand-blueDark shadow-xs transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الفاتورة</span>
                </button>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Invoice Sheet */}
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 print:bg-white print:border-none print:p-0">
              
              {/* Store & Supplier Header */}
              <div className="flex items-center justify-between border-b border-slate-300 pb-4">
                <div>
                  <EtihadLogo size="sm" />
                  <p className="text-[11px] text-slate-500 font-bold mt-1">سوق الجملة لتجارة المواد الغذائية والسناكات 🇮🇶</p>
                </div>
                <div className="text-left font-mono">
                  <div className="text-base font-black text-brand-blue">{selectedInvoice.invoiceNumber}</div>
                  <div className="text-[11px] text-slate-500">التاريخ: {selectedInvoice.date}</div>
                  <div className="text-[11px] font-bold mt-0.5">
                    {selectedInvoice.paymentMethod === 'cash' ? (
                      <span className="text-emerald-700">حالة الدفع: نقداً (واصل ومسدد)</span>
                    ) : selectedInvoice.paymentMethod === 'credit' ? (
                      <span className="text-amber-700">حالة الدفع: آجل على الحساب</span>
                    ) : (
                      <span className="text-blue-700">
                        حالة الدفع: دفع جزئي (واصل: {(selectedInvoice.paidAmount || 0).toLocaleString()} | متبقي: {(selectedInvoice.remainingAmount || 0).toLocaleString()} د.ع)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Supplier Info */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">الشركة المجهزة / المورد:</span>
                  <span className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                    <span className="text-purple-600">🏭</span>
                    <span>{selectedInvoice.companyName}</span>
                  </span>
                </div>
                {selectedInvoice.notes && (
                  <div className="text-left">
                    <span className="text-[10px] text-slate-400 font-bold block">ملاحظات:</span>
                    <span className="font-bold text-slate-700 text-xs">{selectedInvoice.notes}</span>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/80 border-b border-slate-200 font-bold text-slate-700 text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">الصنف والتعبئة</th>
                      <th className="py-2.5 px-3 text-center">الكمية والتجزئة</th>
                      <th className="py-2.5 px-3 text-center">سعر شراء الكرتون</th>
                      <th className="py-2.5 px-3 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedInvoice.items.map((it, idx) => {
                      const boxes = it.boxesPerCarton || 6;
                      const piecesPerBox = it.itemsPerBox || 24;
                      const piecesTotal = it.totalPieces || (it.quantity * boxes * piecesPerBox);
                      const unitCost = it.pieceCostPrice || Math.round((it.costPrice / (boxes * piecesPerBox)) * 10) / 10;

                      return (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <span className="font-bold text-slate-900 block">{it.productName}</span>
                            <span className="text-[10px] text-slate-500">
                              (الكرتون: {boxes} علب × {piecesPerBox} قطعة) • تكلفة القطعة: {unitCost} د.ع
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-700">
                            <div>{it.quantity} {it.unit}</div>
                            <div className="text-[10px] text-emerald-700">({piecesTotal.toLocaleString()} قطعة)</div>
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-slate-700">{it.costPrice.toLocaleString()} د.ع</td>
                          <td className="py-2 px-3 text-left font-mono font-black text-purple-700">{it.total.toLocaleString()} د.ع</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Grand Total & Settlement Footer */}
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-purple-950 text-sm">المجموع الإجمالي لفاتورة الشراء:</span>
                  <span className="font-mono font-black text-purple-950 text-lg">
                    {selectedInvoice.totalAmount.toLocaleString()} د.ع
                  </span>
                </div>

                {selectedInvoice.paymentMethod === 'partial' && (
                  <div className="pt-2 border-t border-purple-200 flex items-center justify-between text-xs font-bold">
                    <span className="text-emerald-700">
                      💵 المبلغ المدفوع نقد (واصل): {(selectedInvoice.paidAmount || 0).toLocaleString()} د.ع
                    </span>
                    <span className="text-amber-800">
                      ⏳ المبلغ المتبقي (دين للمجهز): {(selectedInvoice.remainingAmount || 0).toLocaleString()} د.ع
                    </span>
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}

// 🏢 Smart Searchable Supplier Combobox Component
function SearchableSupplierSelect({
  suppliers,
  allAccounts,
  value,
  onChange,
  onSelectAccount,
}: {
  suppliers: SupplierAccount[];
  allAccounts: CustomerAccountSummary[];
  value: string;
  onChange: (val: string) => void;
  onSelectAccount?: (account: CustomerAccountSummary | SupplierAccount) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const query = (value || '').toLowerCase().trim();

  // Combine unique accounts with priority to suppliers
  const accountsPool: Array<{
    name: string;
    businessName?: string;
    phone: string;
    city?: string;
    category?: string;
  }> = [];

  const seen = new Set<string>();

  // 1. Add supplier accounts first
  suppliers.forEach(s => {
    if (s.name && !seen.has(s.name.toLowerCase())) {
      seen.add(s.name.toLowerCase());
      accountsPool.push({ ...s, category: 'supplier' });
    }
  });

  // 2. Add other accounts from accounting system
  allAccounts.forEach(a => {
    if (a.name && !seen.has(a.name.toLowerCase())) {
      seen.add(a.name.toLowerCase());
      accountsPool.push({
        name: a.name,
        businessName: a.businessName,
        phone: a.phone,
        city: a.city,
        category: a.category,
      });
    }
  });

  const matchedList = accountsPool.filter(a => {
    if (!query) return true;
    const nameMatch = (a.name || '').toLowerCase().includes(query);
    const busMatch = (a.businessName || '').toLowerCase().includes(query);
    const phoneMatch = (a.phone || '').includes(query);
    const cityMatch = (a.city || '').toLowerCase().includes(query);
    return nameMatch || busMatch || phoneMatch || cityMatch;
  });

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div className="relative">
        <input
          type="text"
          required
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="ابحث باسم المجهز أو رقم الهاتف..."
          className="w-full bg-white border border-slate-300 hover:border-purple-400 rounded-xl py-2 pr-9 pl-7 text-xs font-bold text-slate-900 focus:border-purple-600 focus:outline-none shadow-2xs"
        />
        <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setIsOpen(true);
            }}
            className="text-slate-400 hover:text-slate-600 absolute left-2.5 top-1/2 -translate-y-1/2 text-xs cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 right-0 left-0 mt-1 bg-white border border-purple-200 rounded-2xl shadow-2xl p-1.5 space-y-1 text-xs max-h-60 overflow-y-auto min-w-[260px]">
          <div className="text-[10px] text-slate-400 font-bold px-2 py-1 flex items-center justify-between border-b border-slate-100">
            <span>نتائج البحث من دليل الحسابات</span>
            <span>{matchedList.length} حساب</span>
          </div>

          {matchedList.length === 0 ? (
            <div className="p-3 text-center text-slate-500 space-y-1">
              <p className="font-bold text-slate-700">لا يوجد حساب مطابق لـ "{value}"</p>
              <p className="text-[10px] text-slate-400">يمكنك المتابعة وسيتم اعتماد الاسم المكتوب في الفاتورة.</p>
            </div>
          ) : (
            matchedList.map((acc, i) => (
              <button
                key={acc.phone || i}
                type="button"
                onClick={() => {
                  onChange(acc.name);
                  if (onSelectAccount) onSelectAccount(acc as any);
                  setIsOpen(false);
                }}
                className="w-full text-right p-2.5 rounded-xl hover:bg-purple-50 transition flex items-center justify-between gap-2 cursor-pointer border-b border-slate-50 last:border-none"
              >
                <div>
                  <div className="font-black text-slate-900 flex items-center gap-1.5">
                    <span className="text-purple-600">🏭</span>
                    <span>{acc.name}</span>
                    {acc.businessName && acc.businessName !== acc.name && (
                      <span className="text-[10px] text-slate-500 font-normal">({acc.businessName})</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                    {acc.phone && <span>📞 {acc.phone}</span>}
                    {acc.city && <span>📍 {acc.city}</span>}
                  </div>
                </div>
                <div className="shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    acc.category === 'supplier'
                      ? 'bg-purple-100 text-purple-800 font-black'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {acc.category === 'supplier' ? 'مجهز 🏭' : 'حساب 👤'}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// 🔍 Searchable Product Combobox Component (Clean Text Presentation)
function SearchableProductSelect({
  allProducts,
  selectedProductId,
  onSelect,
}: {
  allProducts: Product[];
  selectedProductId: string;
  onSelect: (product: Product) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [localProducts, setLocalProducts] = useState<Product[]>(allProducts);

  useEffect(() => {
    if (allProducts && allProducts.length > 0) {
      setLocalProducts(allProducts);
    } else {
      fetch('/api/products')
        .then(r => r.json())
        .then(d => {
          if (d.success && Array.isArray(d.products)) {
            setLocalProducts(d.products);
          }
        })
        .catch(() => {});
    }
  }, [allProducts]);

  const activeProductsList = localProducts.length > 0 ? localProducts : allProducts;
  const selectedProduct = activeProductsList.find((p) => p.id === selectedProductId);

  // Filter products by typed search term across ALL products
  const filteredList = activeProductsList.filter((p) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      (p.name || '').toLowerCase().includes(term) ||
      (p.category && p.category.toLowerCase().includes(term)) ||
      (p.company && p.company.toLowerCase().includes(term))
    );
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {/* Trigger Button / Display */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white border border-slate-300 hover:border-brand-blue rounded-xl py-2 px-2.5 text-right text-xs font-bold text-slate-900 flex items-center justify-between gap-1 shadow-2xs transition cursor-pointer"
      >
        <span className="truncate block">
          {selectedProduct ? (
            <span className="text-slate-900 flex items-center gap-1.5 truncate">
              <span className="font-black truncate">{selectedProduct.name}</span>
              {selectedProduct.company && (
                <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-normal shrink-0">
                  {selectedProduct.company}
                </span>
              )}
              {(selectedProduct.stock === 0 || selectedProduct.stock < 0) && (
                <span className="bg-red-100 text-red-700 text-[10px] font-black px-1.5 py-0.2 rounded shrink-0">
                  (نافذ ⚠️)
                </span>
              )}
            </span>
          ) : (
            <span className="text-slate-400 font-normal">-- اختر أو ابحث عن صنف من النظام ({activeProductsList.length} صنف) --</span>
          )}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {/* Out of Stock Warning Message below button if selected product is 0 */}
      {selectedProduct && (selectedProduct.stock === 0 || selectedProduct.stock < 0) && (
        <div className="text-[10px] text-red-600 font-black flex items-center gap-1 mt-0.5 animate-fadeIn">
          <span>⚠️ المنتج غير موجود منه في المخزن (الرصيد: 0)</span>
        </div>
      )}

      {/* Dropdown Popup */}
      {isOpen && (
        <div className="absolute z-50 right-0 left-0 sm:min-w-[440px] mt-1 bg-white border border-slate-300 rounded-2xl shadow-2xl p-2.5 space-y-2 animate-fadeIn text-xs max-h-80 flex flex-col">
          
          {/* Quick Search Input */}
          <div className="relative shrink-0">
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="اكتب اسم الصنف أو الماركة للبحث السريع..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 pr-8 pl-6 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-brand-blue"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 flex items-center justify-center text-[9px] absolute left-2 top-1/2 -translate-y-1/2 font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Results Count / Info */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 font-bold shrink-0">
            <span>{filteredList.length} صنف متوفر في المتجر</span>
            <span>جميع الأصناف المسجلة</span>
          </div>

          {/* Product Items List */}
          <div className="overflow-y-auto space-y-1 divide-y divide-slate-100 flex-1 pr-0.5 max-h-56">
            {filteredList.length === 0 ? (
              <div className="py-6 text-center text-slate-400 space-y-1">
                <span className="text-base block">🔍</span>
                <span className="text-xs font-bold block">لا توجد أصناف تطابق "{searchTerm}"</span>
              </div>
            ) : (
              filteredList.map((p) => {
                const isSelected = p.id === selectedProductId;
                const isOutOfStock = p.stock === 0 || p.stock < 0;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelect(p);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`w-full text-right p-2.5 rounded-xl transition flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 text-brand-blue font-black border border-blue-200'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="truncate">
                      <span className="font-black text-xs text-slate-900 block truncate">
                        {p.name}
                      </span>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                        {p.company && (
                          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-normal">
                            {p.company}
                          </span>
                        )}
                        {p.boxesPerCarton && p.itemsPerBox && (
                          <span>
                            (الكرتون: {p.boxesPerCarton} علب × {p.itemsPerBox} قطعة)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {isOutOfStock ? (
                        <span className="bg-red-50 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-md border border-red-200">
                          نافذ ⚠️
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-medium">
                          المخزون ({p.stock})
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-[10px] text-brand-blue font-bold">✓</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

        </div>
      )}
    </div>
  );
}
