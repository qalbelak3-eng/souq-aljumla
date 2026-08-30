'use client';

import React, { useState, useEffect } from 'react';
import { Layers, Plus, Edit2, Trash2, X, Check, Image as ImageIcon, Sparkles, Wand2 } from 'lucide-react';
import { Category, Product } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';
import { compressImageFile } from '@/lib/imageUtils';
import CategoryIcon, { CATEGORY_ICON_PRESETS, getCategoryPreset } from '@/components/CategoryIcon';

export default function AdminCategoriesPage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('basket');
  const [selectedColor, setSelectedColor] = useState('#16a34a');
  const [image, setImage] = useState('');
  const [description, setDescription] = useState('');

  const fetchCategories = () => {
    setIsLoading(true);
    Promise.all([
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/products').then((r) => r.json()),
    ])
      .then(([catData, prodData]) => {
        if (catData.success) setCategories(catData.categories || []);
        if (prodData.success) setProducts(prodData.products || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const openAddModal = () => {
    setEditingCategory(null);
    setName('');
    setSelectedIcon('basket');
    setSelectedColor('#16a34a');
    setImage('');
    setDescription('');
    setIsModalOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setName(cat.name);
    const preset = getCategoryPreset(cat.name, cat.icon);
    setSelectedIcon(cat.icon || preset.iconName || 'basket');
    setSelectedColor(cat.color || preset.color || '#16a34a');
    setImage(cat.image || '');
    setDescription(cat.description || '');
    setIsModalOpen(true);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!editingCategory && val.trim().length > 1) {
      const autoPreset = getCategoryPreset(val);
      setSelectedIcon(autoPreset.iconName);
      setSelectedColor(autoPreset.color);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      if (editingCategory) {
        // Update
        const res = await fetch(`/api/categories/${editingCategory.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            icon: selectedIcon,
            color: selectedColor,
            image,
            description,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setCategories((prev) => prev.map((c) => (c.id === editingCategory.id ? data.category : c)));
          setIsModalOpen(false);
          toast.success('تم تحديث بيانات القسم بنجاح ✅');
        }
      } else {
        // Add
        const res = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            icon: selectedIcon,
            color: selectedColor,
            image,
            description,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setCategories((prev) => [...prev, data.category]);
          setIsModalOpen(false);
          toast.success('تمت إضافة القسم الجديد بنجاح ⚡');
        }
      }
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء حفظ القسم');
    }
  };

  const handleDeleteCategory = async (id: string, catName: string) => {
    const prodsInCat = products.filter((p) => p.category === catName).length;
    const isConfirmed = await confirm({
      title: 'حذف القسم',
      message: prodsInCat > 0
        ? `⚠️ تنبيه: يوجد (${prodsInCat}) منتجات مرتبطة بقسم "${catName}".\nهل أنت متأكد من حذف هذا القسم نهائياً؟`
        : `هل أنت متأكد من حذف قسم "${catName}" نهائياً؟`,
      confirmText: 'نعم، احذف القسم',
      cancelText: 'تراجع',
      type: 'danger',
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setCategories((prev) => prev.filter((c) => c.id !== id));
        toast.success('تم حذف القسم بنجاح 🗑️');
      }
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء الحذف');
    }
  };

  return (
    <div className="space-y-6 text-xs">
      
      {/* Header & Add Button */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            <span>إدارة وتحكم بأقسام المواد الغذائية</span>
          </h2>
          <p className="text-xs text-slate-500 font-bold mt-1">
            إضافة أقسام جديدة، اختيار الأيقونات المتحركة والأسماء، أو حذف الأقسام
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="bg-brand-blue hover:bg-brand-blueDark text-white font-black text-xs py-3 px-5 rounded-2xl shadow-md transition flex items-center gap-2 transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة قسم جديد ⚡</span>
        </button>
      </div>

      {/* Categories Grid */}
      {isLoading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-bold">جاري تحميل الأقسام...</p>
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-xs space-y-3">
          <div className="text-4xl">📂</div>
          <h3 className="text-base font-bold text-slate-900">لا توجد أقسام مسجلة حالياً</h3>
          <button
            onClick={openAddModal}
            className="bg-brand-blue text-white font-bold text-xs py-2.5 px-5 rounded-xl shadow-xs"
          >
            إضافة أول قسم
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 sm:gap-5">
          {categories.map((cat) => {
            const count = products.filter((p) => p.category === cat.name).length;
            return (
              <div
                key={cat.id}
                className="bg-[#f7fbff] rounded-3xl border border-sky-100/90 shadow-xs hover:shadow-md hover:border-sky-300 transition-all p-4 flex flex-col items-center justify-between text-center group"
              >
                {/* Animated Icon Card */}
                <div className="w-16 h-16 rounded-2xl bg-white border border-sky-100 flex items-center justify-center shadow-xs transition group-hover:scale-105 my-2">
                  <CategoryIcon name={cat.name} icon={cat.icon} size="lg" animate={true} />
                </div>

                <div className="w-full space-y-1">
                  <h3 className="font-black text-sm text-slate-900 line-clamp-1">{cat.name}</h3>
                  <span className="text-[11px] text-slate-400 font-bold block font-mono">
                    {count} منتجات
                  </span>
                </div>

                <div className="flex items-center gap-1.5 pt-3 mt-2 border-t border-sky-100/60 w-full justify-center">
                  <button
                    onClick={() => openEditModal(cat)}
                    className="bg-white hover:bg-slate-100 text-slate-700 p-2 rounded-xl border border-slate-200 transition shadow-2xs"
                    title="تعديل القسم والأيقونة"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-brand-blue" />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(cat.id, cat.name)}
                    className="bg-white hover:bg-red-50 text-red-600 p-2 rounded-xl border border-red-200 transition shadow-2xs"
                    title="حذف القسم"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Category Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center">
                  <CategoryIcon name={name || 'قسم'} icon={selectedIcon} size="sm" animate={true} />
                </div>
                <h3 className="font-black text-base text-slate-900">
                  {editingCategory ? 'تعديل القسم والأيقونة' : 'إضافة قسم مواد غذائية جديد'}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4 text-xs">
              
              {/* Category Name */}
              <div className="space-y-1">
                <label className="font-black text-slate-800 block">اسم القسم *:</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="مثال: سناكات، ألبان، لحوم، مشروبات..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 font-black text-sm focus:bg-white focus:outline-none focus:border-brand-blue"
                />
              </div>

              {/* Visual Animated Icon Selector */}
              <div className="space-y-2 bg-[#f4f9ff] p-4 rounded-2xl border border-sky-100">
                <div className="flex items-center justify-between">
                  <label className="font-black text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>اختر الأيقونة المتحركة للقسم:</span>
                  </label>
                  <span className="text-[10px] text-sky-700 font-bold bg-sky-100/70 px-2 py-0.5 rounded-lg">
                    تهتز بحركة بطيئة جذابة ✦
                  </span>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 pt-1">
                  {CATEGORY_ICON_PRESETS.map((preset) => {
                    const isSelected = selectedIcon === preset.iconName || selectedIcon === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setSelectedIcon(preset.iconName);
                          setSelectedColor(preset.color);
                        }}
                        className={`p-2 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all border ${
                          isSelected
                            ? 'bg-white border-brand-blue shadow-md scale-105 ring-2 ring-brand-blue/20'
                            : 'bg-white/70 border-slate-200/80 hover:bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="w-8 h-8 flex items-center justify-center">
                          <CategoryIcon name="" icon={preset.iconName} size="sm" animate={isSelected} />
                        </div>
                        <span className={`text-[10px] font-black line-clamp-1 ${isSelected ? 'text-brand-blue' : 'text-slate-600'}`}>
                          {preset.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Custom Image / Description */}
              <div className="space-y-1">
                <label className="font-black text-slate-800">وصف موجز للقسم (اختياري):</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="وصف مختصر للقسم يظهر للمستخدمين..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-medium resize-none focus:bg-white focus:outline-none focus:border-brand-blue"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-5 rounded-xl transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="bg-brand-blue hover:bg-brand-blueDark text-white font-black py-2.5 px-6 rounded-xl shadow-md transition"
                >
                  {editingCategory ? 'حفظ التعديلات' : 'إضافة القسم ⚡'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

