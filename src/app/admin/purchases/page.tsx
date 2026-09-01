'use client';

import React, { useState, useEffect } from 'react';
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
  TrendingDown
} from 'lucide-react';
import { PurchaseInvoice, PurchaseInvoiceItem, Company, Product } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';
import EtihadLogo from '@/components/EtihadLogo';

export default function AdminPurchasesPage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('الكل');
  const [isLoading, setIsLoading] = useState(true);

  // New Invoice Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [invCompany, setInvCompany] = useState('');
  const [invDate, setInvDate] = useState(new Date().toISOString().split('T')[0]);
  const [invPaymentMethod, setInvPaymentMethod] = useState<'cash' | 'credit'>('cash');
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
    { productId: '', productName: '', company: '', unit: 'كرتون', quantity: 1, costPrice: 0, boxesPerCarton: 1, itemsPerBox: 1 }
  ]);

  // View Invoice Modal
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [invRes, compRes, prodRes] = await Promise.all([
        fetch('/api/purchases').then((r) => r.json()),
        fetch('/api/companies').then((r) => r.json()),
        fetch('/api/products').then((r) => r.json()),
      ]);

      if (invRes.success) setInvoices(invRes.invoices || []);
      if (compRes.success) setCompanies(compRes.companies || []);
      if (prodRes.success) setProducts(prodRes.products || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openNewModal = () => {
    const firstComp = companies[0]?.name || 'شركة التونسا (Altunsa)';
    setInvCompany(firstComp);
    setInvDate(new Date().toISOString().split('T')[0]);
    setInvPaymentMethod('cash');
    setInvNotes('');
    
    // Find products for first company
    const firstProd = products.find(p => p.company === firstComp) || products[0];
    setInvItems([
      {
        productId: firstProd?.id || '',
        productName: firstProd?.name || '',
        company: firstComp,
        unit: firstProd?.wholesaleUnit || 'كرتون',
        quantity: 10,
        costPrice: firstProd?.costPrice || 7000,
        boxesPerCarton: firstProd?.boxesPerCarton || 6,
        itemsPerBox: firstProd?.itemsPerBox || 24,
      }
    ]);
    setIsNewModalOpen(true);
  };

  const handleCompanyChangeInModal = (compName: string) => {
    setInvCompany(compName);
    const compProducts = products.filter(p => p.company === compName);
    const firstProd = compProducts[0];
    if (firstProd) {
      setInvItems([
        {
          productId: firstProd.id,
          productName: firstProd.name,
          company: compName,
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
          company: compName,
          unit: 'كرتون',
          quantity: 10,
          costPrice: 7000,
          boxesPerCarton: 6,
          itemsPerBox: 24,
        }
      ]);
    }
  };

  const addItemRow = () => {
    const compProducts = products.filter(p => p.company === invCompany);
    const firstProd = compProducts[0];
    setInvItems(prev => [
      ...prev,
      {
        productId: firstProd?.id || '',
        productName: firstProd?.name || '',
        company: invCompany,
        unit: firstProd?.wholesaleUnit || 'كرتون',
        quantity: 10,
        costPrice: firstProd?.costPrice || 7000,
        boxesPerCarton: firstProd?.boxesPerCarton || 6,
        itemsPerBox: firstProd?.itemsPerBox || 24,
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
              company: invCompany,
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
    if (!invCompany || validItems.length === 0) {
      toast.error('يرجى اختيار صنف واحد على الأقل في الفاتورة');
      return;
    }

    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: invCompany,
          date: invDate,
          paymentMethod: invPaymentMethod,
          notes: invNotes,
          items: validItems,
        }),
      });
      const data = await res.json();
      if (data.success && data.invoice) {
        setInvoices(prev => [data.invoice, ...prev]);
        setIsNewModalOpen(false);
        // Refresh products to show updated stock
        fetch('/api/products')
          .then(r => r.json())
          .then(d => d.success && setProducts(d.products || []));
      }
    } catch (e) {
      console.error(e);
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

  const filteredInvoices = invoices.filter(inv => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.companyName.toLowerCase().includes(q) ||
      inv.items.some(it => it.productName.toLowerCase().includes(q));

    if (!matchesSearch) return false;
    if (selectedCompany !== 'الكل' && inv.companyName !== selectedCompany) return false;
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
          className="bg-brand-blue hover:bg-brand-blueDark text-white font-black text-xs py-3 px-5 rounded-2xl shadow-md transition flex items-center gap-2 transform active:scale-95"
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
            placeholder="ابحث برقم الفاتورة، اسم الماركة، أو الصنف..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 pr-9 pl-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand-blue"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedCompany('الكل')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition whitespace-nowrap ${
              selectedCompany === 'الكل'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            جميع الشركات ({invoices.length})
          </button>
          {companies.map(comp => {
            const count = invoices.filter(inv => inv.companyName === comp.name).length;
            return (
              <button
                key={comp.id}
                onClick={() => setSelectedCompany(comp.name)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition whitespace-nowrap ${
                  selectedCompany === comp.name
                    ? 'bg-brand-blue text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {comp.name} ({count})
              </button>
            );
          })}
        </div>

      </div>

      {/* Invoices List Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
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
              className="mt-2 bg-brand-blue text-white font-bold py-2 px-5 rounded-xl text-xs"
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
                  <th className="py-3.5 px-4">الشركة المجهزة / الماركة</th>
                  <th className="py-3.5 px-4">تاريخ الفاتورة</th>
                  <th className="py-3.5 px-4 text-center">عدد الأصناف</th>
                  <th className="py-3.5 px-4 text-center">طريقة الدفع</th>
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
                      <div className="font-black text-slate-900">{inv.companyName}</div>
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
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        inv.paymentMethod === 'cash'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {inv.paymentMethod === 'cash' ? '💵 نقد (واصل)' : '⏳ آجل على الحساب'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-left font-mono font-black text-purple-800 text-sm">
                      {inv.totalAmount.toLocaleString()} د.ع
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl border border-slate-200 transition"
                          title="معاينة وطباعة الفاتورة"
                        >
                          <Eye className="w-3.5 h-3.5 text-brand-blue" />
                        </button>
                        <button
                          onClick={() => handleDeleteInvoice(inv.id)}
                          className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl border border-red-200 transition"
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
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full p-6 space-y-4 text-xs my-8">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-brand-blue" />
                <span>تسجيل فاتورة شراء وتوريد بضاعة جديدة 📦</span>
              </h3>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} className="space-y-4">
              
              {/* Top Row: Company, Date, Payment Method */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                
                <div className="space-y-1">
                  <label className="font-black text-slate-800 block flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-brand-blue" />
                    <span>الشركة المجهزة / الماركة *:</span>
                  </label>
                  <select
                    value={invCompany}
                    onChange={(e) => handleCompanyChangeInModal(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:border-brand-blue"
                  >
                    {companies.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

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

                <div className="space-y-1">
                  <label className="font-black text-slate-800 block flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                    <span>طريقة السداد *:</span>
                  </label>
                  <select
                    value={invPaymentMethod}
                    onChange={(e) => setInvPaymentMethod(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:border-brand-blue"
                  >
                    <option value="cash">💵 نقداً (واصل ومسدد)</option>
                    <option value="credit">⏳ آجل (دين على الحساب)</option>
                  </select>
                </div>

              </div>

              {/* Items Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-black text-slate-900 text-xs flex items-center gap-1.5">
                    <span>قائمة السلع والأصناف المشتراة في الفاتورة:</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-bold">
                    (يفتح سطر جديد تلقائياً بمجرد اختيار الصنف ⚡)
                  </span>
                </div>

                <div className="space-y-3">
                  {invItems.map((item, idx) => {
                    const totalCartons = Number(item.quantity) || 0;
                    const costPerCarton = Number(item.costPrice) || 0;
                    const rowTotal = totalCartons * costPerCarton;

                    return (
                      <div
                        key={idx}
                        className="bg-slate-50/90 border border-slate-200 p-3 rounded-2xl space-y-2"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                          {/* Product Selector */}
                          <div className="sm:col-span-6 space-y-0.5">
                            <label className="text-[10px] font-bold text-slate-700 block pb-0.5">اسم الصنف:</label>
                            <SearchableProductSelect
                              companyProducts={products.filter(p => p.company === invCompany)}
                              allProducts={products}
                              selectedProductId={item.productId}
                              companyName={invCompany}
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

                <div className="text-left">
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
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-brand-blue hover:bg-brand-blueDark text-white font-black py-2.5 rounded-xl shadow-md transition"
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
                  className="bg-brand-blue text-white font-bold py-1.5 px-3.5 rounded-xl flex items-center gap-1.5 hover:bg-brand-blueDark shadow-xs transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الفاتورة</span>
                </button>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
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
                  <div className="text-[11px] text-emerald-700 font-bold mt-0.5">
                    {selectedInvoice.paymentMethod === 'cash' ? 'حالة الدفع: نقداً (واصل)' : 'حالة الدفع: آجل على الحساب'}
                  </div>
                </div>
              </div>

              {/* Supplier Info */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">الشركة المجهزة / الماركة:</span>
                  <span className="font-black text-slate-900 text-sm">{selectedInvoice.companyName}</span>
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

              {/* Grand Total Footer */}
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 flex items-center justify-between">
                <span className="font-black text-purple-950 text-sm">المجموع الإجمالي لفاتورة الشراء:</span>
                <span className="font-mono font-black text-purple-950 text-lg">
                  {selectedInvoice.totalAmount.toLocaleString()} د.ع
                </span>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}

// 🔍 Searchable Product Combobox Component for High-Volume Company Products
function SearchableProductSelect({
  companyProducts,
  allProducts,
  selectedProductId,
  companyName,
  onSelect,
}: {
  companyProducts: Product[];
  allProducts: Product[];
  selectedProductId: string;
  companyName: string;
  onSelect: (product: Product) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const availableList = companyProducts.length > 0 ? companyProducts : allProducts;
  const selectedProduct = allProducts.find((p) => p.id === selectedProductId);

  // Filter products by typed search term
  const filteredList = availableList.filter((p) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(term) ||
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
              <span>{selectedProduct.name}</span>
              {(selectedProduct.stock === 0 || selectedProduct.stock < 0) && (
                <span className="bg-red-100 text-red-700 text-[10px] font-black px-1.5 py-0.2 rounded">
                  (نافذ ⚠️)
                </span>
              )}
            </span>
          ) : (
            <span className="text-slate-400 font-normal">-- اختر أو ابحث عن صنف ({availableList.length} صنف) --</span>
          )}
        </span>
        <span className="text-slate-400 text-[10px] shrink-0">▼</span>
      </button>

      {/* Out of Stock Warning Message below button if selected product is 0 */}
      {selectedProduct && (selectedProduct.stock === 0 || selectedProduct.stock < 0) && (
        <div className="text-[10px] text-red-600 font-black flex items-center gap-1 mt-0.5 animate-fadeIn">
          <span>⚠️ المنتج غير موجود منه في المخزن (الرصيد: 0)</span>
        </div>
      )}

      {/* Dropdown Popup */}
      {isOpen && (
        <div className="absolute z-50 right-0 left-0 mt-1 bg-white border border-slate-300 rounded-2xl shadow-2xl p-2 space-y-1.5 animate-fadeIn text-xs max-h-80 flex flex-col min-w-[280px]">
          
          {/* Quick Search Input */}
          <div className="relative shrink-0">
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="اكتب اسم الصنف للبحث السريع..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 pr-8 pl-6 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-brand-blue"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 flex items-center justify-center text-[9px] absolute left-2 top-1/2 -translate-y-1/2 font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Results Count / Info */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 font-bold shrink-0">
            <span>{filteredList.length} صنف متوفر</span>
            <span>{companyName || 'الشركة'}</span>
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
                    className={`w-full text-right p-2.5 rounded-xl transition flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 text-brand-blue font-black border border-blue-200'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <span className="font-black text-xs text-slate-900 truncate">
                      {p.name}
                    </span>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {isOutOfStock ? (
                        <span className="bg-red-50 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-md border border-red-200">
                          الرصيد نافذ ⚠️
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium">
                          متوفر بالمخزن ({p.stock})
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
