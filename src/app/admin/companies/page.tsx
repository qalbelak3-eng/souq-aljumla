'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, Plus, Edit2, Trash2, Search, X, Layers, Package, ExternalLink, Sparkles } from 'lucide-react';
import { Company, Category } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';
import { compressImageFile } from '@/lib/imageUtils';

export default function AdminCompaniesPage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [name, setName] = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [logo, setLogo] = useState('');
  const [icon, setIcon] = useState('🏢');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [compRes, catRes] = await Promise.all([
        fetch('/api/companies').then(r => r.json()),
        fetch('/api/categories').then(r => r.json()),
      ]);

      if (compRes.success) setCompanies(compRes.companies || []);
      if (catRes.success) setCategories(catRes.categories || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openAddModal = () => {
    setEditingCompany(null);
    setName('');
    setSelectedCats(categories[0]?.name ? [categories[0].name] : []);
    setLogo('');
    setIcon('🏢');
    setIsModalOpen(true);
  };

  const openEditModal = (c: Company) => {
    setEditingCompany(c);
    setName(c.name);
    const initialCats = (c.categories && c.categories.length > 0) ? c.categories : (c.category ? [c.category] : []);
    setSelectedCats(initialCats);
    setLogo(c.logo || '');
    setIcon(c.icon || '🏢');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('يرجى كتابة اسم الشركة');
      return;
    }
    if (selectedCats.length === 0) {
      toast.error('يرجى تحديد قسم واحد على الأقل للشركة');
      return;
    }

    const payload = {
      name: name.trim(),
      category: selectedCats[0],
      categories: selectedCats,
      logo,
      icon,
    };

    try {
      if (editingCompany) {
        const res = await fetch(`/api/companies/${editingCompany.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          setCompanies(prev => prev.map(c => c.id === editingCompany.id ? data.company : c));
          toast.success('تم تحديث بيانات الشركة بنجاح ✨');
          setIsModalOpen(false);
        }
      } else {
        const res = await fetch('/api/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          setCompanies(prev => [data.company, ...prev]);
          toast.success('تمت إضافة الشركة وربطها بالأقسام المحددة بنجاح 🚀');
          setIsModalOpen(false);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء حفظ الشركة');
    }
  };

  const handleDelete = async (id: string, compName?: string) => {
    const isConfirmed = await confirm({
      title: 'حذف الشركة / الماركة',
      message: `هل أنت متأكد من حذف ${compName ? `"${compName}"` : 'هذه الشركة'} نهائياً من النظام؟`,
      confirmText: 'نعم، احذف الشركة',
      cancelText: 'تراجع',
      type: 'danger',
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/companies/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setCompanies(prev => prev.filter(c => c.id !== id));
        toast.info('تم حذف الشركة بنجاح');
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء حذف الشركة');
    }
  };

  const filteredCompanies = companies.filter(c => {
    const q = searchQuery.toLowerCase().trim();
    const cats = (c.categories && c.categories.length > 0) ? c.categories : [c.category];
    const matchesSearch = c.name.toLowerCase().includes(q) || cats.some(cat => cat.toLowerCase().includes(q));
    if (!matchesSearch) return false;
    if (selectedCategory !== 'الكل' && !cats.includes(selectedCategory)) return false;
    return true;
  });

  return (
    <div className="space-y-6 text-xs">
      
      {/* Header Action Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-brand-blue" />
            <span>إدارة الشركات والماركات التجارية 🏢</span>
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-0.5">
            إضافة وتعديل الشركات والمصانع المصنعة لكل قسم وربط المنتجات بها
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="bg-brand-blue hover:bg-brand-blueDark text-white font-black text-xs py-3 px-5 rounded-2xl shadow-md transition flex items-center gap-2 transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة شركة / ماركة جديدة ⚡</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        
        {/* Search Input */}
        <div className="relative flex-1 w-full max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث باسم الشركة أو القسم..."
            className="w-full bg-white border border-slate-300 rounded-2xl py-2.5 pr-10 pl-4 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand-blue shadow-xs"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setSelectedCategory('الكل')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition whitespace-nowrap ${
              selectedCategory === 'الكل' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            جميع الأقسام ({companies.length})
          </button>
          {categories.map((c) => {
            const count = companies.filter(comp => (comp.categories && comp.categories.includes(c.name)) || comp.category === c.name).length;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.name)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition whitespace-nowrap ${
                  selectedCategory === c.name ? 'bg-brand-blue text-white' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {c.name} ({count})
              </button>
            );
          })}
        </div>

      </div>

      {/* Companies Grid */}
      {isLoading ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-slate-200 shadow-sm">
          <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-bold">جاري تحميل الشركات والماركات...</p>
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center text-slate-400 space-y-2 border border-slate-200 shadow-sm">
          <Building2 className="w-12 h-12 mx-auto text-slate-300" />
          <p className="text-xs font-bold text-slate-700">لا توجد شركات مسجلة تطابق البحث</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCompanies.map((comp) => {
            const compCats = (comp.categories && comp.categories.length > 0) ? comp.categories : [comp.category];
            return (
              <div
                key={comp.id}
                className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xl shrink-0 overflow-hidden mt-0.5">
                      {comp.logo ? (
                        <img src={comp.logo} alt={comp.name} className="w-full h-full object-contain p-1" />
                      ) : (
                        <span>{comp.icon || '🏢'}</span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-sm">{comp.name}</h3>
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        {compCats.map((cat) => (
                          <span key={cat} className="text-[10px] text-indigo-700 font-bold bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(comp)}
                      className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                      title="تعديل الشركة"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-brand-blue" />
                    </button>
                    <button
                      onClick={() => handleDelete(comp.id, comp.name)}
                      className="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition cursor-pointer"
                      title="حذف الشركة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-bold flex items-center gap-1">
                    <Package className="w-3.5 h-3.5 text-brand-blue" />
                    <span>المنتجات المسجلة: <strong>{comp.productsCount || 0}</strong> صنف</span>
                  </span>

                  <Link
                    href={`/admin/products`}
                    className="text-[11px] font-bold text-brand-blue hover:underline flex items-center gap-1"
                  >
                    <span>عرض المنتجات</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ADD / EDIT COMPANY MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 text-xs my-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-brand-blue" />
                <span>{editingCompany ? 'تعديل بيانات الشركة' : 'إضافة شركة / ماركة جديدة'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              
              {/* Company Name */}
              <div className="space-y-1">
                <label className="font-black text-slate-800 block">اسم الشركة أو الماركة المصنعة *:</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: شركة التونسا (Altunsa) أو شركة محمود"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                />
              </div>

              {/* Multi-Category Selector */}
              <div className="space-y-2 bg-indigo-50/50 p-3.5 rounded-2xl border border-indigo-200">
                <div className="flex items-center justify-between">
                  <label className="font-black text-indigo-950 block text-xs">
                    الأقسام التابعة لها (يمكنك اختيار أكثر من قسم) *:
                  </label>
                  <span className="text-[10px] bg-brand-blue text-white font-black px-2 py-0.5 rounded-md">
                    تم تحديد {selectedCats.length} {selectedCats.length === 1 ? 'قسم' : 'أقسام'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] pb-1 border-b border-indigo-100">
                  <span className="text-indigo-900/70 font-bold">انقر لتحديد أو إلغاء الأقسام:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCats(categories.map(c => c.name))}
                      className="text-brand-blue hover:underline font-black text-[10px]"
                    >
                      تحديد الكل
                    </button>
                    <span className="text-indigo-200">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedCats([])}
                      className="text-slate-400 hover:text-slate-600 font-bold text-[10px]"
                    >
                      إلغاء التحديد
                    </button>
                  </div>
                </div>

                {/* Category Pills Grid */}
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                  {categories.map((c) => {
                    const isSelected = selectedCats.includes(c.name);
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedCats(prev => prev.filter(cat => cat !== c.name));
                          } else {
                            setSelectedCats(prev => [...prev, c.name]);
                          }
                        }}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-right transition-all transform active:scale-95 ${
                          isSelected
                            ? 'bg-white border-brand-blue text-brand-blue font-black shadow-xs'
                            : 'bg-white/80 border-slate-200 text-slate-700 hover:border-sky-300 font-bold'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-md flex items-center justify-center text-[10px] shrink-0 border ${
                          isSelected ? 'bg-brand-blue text-white border-brand-blue' : 'bg-slate-100 border-slate-300 text-transparent'
                        }`}>
                          ✓
                        </div>
                        <span className="truncate text-xs">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedCats.length === 0 && (
                  <p className="text-[10px] text-red-500 font-bold">⚠️ يرجى تحديد قسم واحد على الأقل</p>
                )}
              </div>

              {/* Logo Upload & Preview Section */}
              <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <label className="font-black text-slate-800 block text-xs flex items-center justify-between">
                  <span>شعار / لوجو الشركة أو الماركة:</span>
                  <span className="text-[10px] text-slate-400 font-normal">صورة من الجهاز أو رابط</span>
                </label>

                <div className="flex items-center gap-3">
                  {/* Logo Preview */}
                  <div className="w-16 h-16 rounded-2xl bg-white border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden shrink-0 shadow-xs relative group">
                    {logo ? (
                      <img
                        src={logo}
                        alt="Logo Preview"
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <div className="text-2xl text-slate-400">🏢</div>
                    )}
                  </div>

                  {/* Upload from Device Button & URL Input */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="bg-brand-blue hover:bg-brand-blueDark text-white text-xs font-black py-2 px-3.5 rounded-xl cursor-pointer transition shadow-xs flex items-center gap-1.5 active:scale-95">
                        <span>📁 رفع صورة من جهازك</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              try {
                                const compressedDataUrl = await compressImageFile(file);
                                setLogo(compressedDataUrl);
                                toast.success('تم رفع وتجهيز لوجو الشركة بنجاح ✨');
                              } catch (err) {
                                toast.error('تعذر معالجة الصورة، يرجى اختيار ملف صورة صالح');
                              }
                            }
                          }}
                        />
                      </label>

                      {logo && (
                        <button
                          type="button"
                          onClick={() => {
                            setLogo('');
                            toast.info('تمت إزالة الشعار');
                          }}
                          className="text-red-500 hover:text-red-700 text-[11px] font-bold py-1.5 px-2.5 rounded-xl bg-red-50 border border-red-200 transition"
                        >
                          ✕ حذف الشعار
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      value={logo.startsWith('data:') ? '✅ تم رفع صورة من جهازك بنجاح' : logo}
                      onChange={(e) => {
                        if (!logo.startsWith('data:')) {
                          setLogo(e.target.value);
                        }
                      }}
                      readOnly={logo.startsWith('data:')}
                      placeholder="أو الصق رابط صورة إنترنت هنا (https://...)"
                      className="w-full bg-white border border-slate-300 rounded-xl py-1.5 px-3 text-[11px] font-mono text-slate-800 focus:border-brand-blue"
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-brand-blue hover:bg-brand-blueDark text-white font-black py-2.5 rounded-xl shadow-md transition"
                >
                  {editingCompany ? 'حفظ التعديلات ✅' : 'إضافة الشركة الآن 🚀'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
