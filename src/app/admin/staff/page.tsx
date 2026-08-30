'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  Search,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  Key,
  Lock,
  Phone,
  Briefcase,
  Layers,
  Sparkles,
  UserCheck,
  UserX,
  Plus,
  RefreshCw,
  FileText,
  ShoppingCart,
  TrendingUp,
  Package,
  Flame,
  Building2,
  Store,
  Truck,
  Settings,
  Shield,
  Eye,
  EyeOff,
  MessageSquare
} from 'lucide-react';
import { StaffMember, StaffRole, StaffPermission } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';

interface PermissionOption {
  key: StaffPermission;
  label: string;
  category: string;
  icon: any;
  color: string;
  description: string;
}

const ALL_PERMISSIONS: PermissionOption[] = [
  {
    key: 'orders',
    label: 'إدارة وتجهيز الطلبيات والمبيعات',
    category: 'المبيعات والتجهيز',
    icon: ShoppingCart,
    color: 'text-brand-blue bg-sky-50 border-sky-200',
    description: 'استقبال الطلبات، تغيير حالات التجهيز، وتعيين السائقين وتأكيد الطلبات',
  },
  {
    key: 'accounting',
    label: 'المحاسبة والديون وسندات القبض',
    category: 'المالية والمحاسبة',
    icon: FileText,
    color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    description: 'كشوفات حسابات الزبائن، تسديد الديون، وإصدار سندات القبض',
  },
  {
    key: 'reports',
    label: 'تقارير الأرباح والمبيعات',
    category: 'المالية والمحاسبة',
    icon: TrendingUp,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    description: 'الاطلاع على أرباح السلع، صافي دخل المتجر، والتحليلات المالية',
  },
  {
    key: 'products',
    label: 'إدارة السلع والمخزون والأسعار',
    category: 'المخزون والمنتجات',
    icon: Package,
    color: 'text-purple-600 bg-purple-50 border-purple-200',
    description: 'إضافة وتعديل المنتجات، أسعار المفرد والجملة، وجرد المخزن',
  },
  {
    key: 'offers',
    label: 'العروض والتخفيضات والكوبونات',
    category: 'المخزون والمنتجات',
    icon: Flame,
    color: 'text-rose-600 bg-rose-50 border-rose-200',
    description: 'إنشاء عروض الخصومات، التخفيضات الزمنية، وكوبونات الخصم',
  },
  {
    key: 'purchases',
    label: 'فواتير المشتريات والتوريد',
    category: 'المشتريات والتوريد',
    icon: Package,
    color: 'text-amber-700 bg-amber-50 border-amber-200',
    description: 'تسجيل بضاعة الشراء الواردة من الشركات والمصانع المجهزة وتكاليفها',
  },
  {
    key: 'companies',
    label: 'الشركات والماركات المجهزة',
    category: 'المشتريات والتوريد',
    icon: Building2,
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    description: 'إدارة قائمة المصانع والشركات الموردة وحساباتها',
  },
  {
    key: 'drivers',
    label: 'إدارة وتوزيع السائقين والسيارات',
    category: 'اللوجستيات والتوصيل',
    icon: Truck,
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    description: 'إضافة السائقين، تتبع عهدة الكاش المالي، وتعيين سيارات التوصيل',
  },
  {
    key: 'merchants',
    label: 'دليل الزبائن والماركتات والتجار',
    category: 'العملاء والمستخدمين',
    icon: Store,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    description: 'الاطلاع على بيانات الزبائن، اعتماد حسابات الماركتات والجملة وتعديل أسعارهم',
  },
  {
    key: 'categories',
    label: 'إدارة وتحكم بالأقسام والتصنيفات',
    category: 'المتجر والتنسيق',
    icon: Layers,
    color: 'text-cyan-700 bg-cyan-50 border-cyan-200',
    description: 'إضافة وتعديل أقسام السوبرماركت والتصنيفات الفرعية',
  },
  {
    key: 'banners',
    label: 'البنرات الإعلانية المتحركة',
    category: 'المتجر والتنسيق',
    icon: Sparkles,
    color: 'text-pink-600 bg-pink-50 border-pink-200',
    description: 'تغيير إعلانات الواجهة الرئيسية للمتجر والعروض الترويجية',
  },
  {
    key: 'complaints',
    label: 'صندوق الشكاوى والملاحظات ورسائل العملاء',
    category: 'العملاء والمستخدمين',
    icon: MessageSquare,
    color: 'text-rose-700 bg-rose-50 border-rose-200',
    description: 'قراءة ومتابعة شكاوى وملاحظات الزبائن، والرد عليها والتواصل معهم',
  },
  {
    key: 'settings',
    label: 'إعدادات المتجر العامة والواتساب والمسابقات',
    category: 'النظام والإدارة',
    icon: Settings,
    color: 'text-slate-700 bg-slate-100 border-slate-300',
    description: 'التحكم في أرقام الواتساب، الشحن، المسابقات، وإعدادات المتجر',
  },
  {
    key: 'staff',
    label: 'إدارة الموظفين وتعديل الصلاحيات',
    category: 'النظام والإدارة',
    icon: Shield,
    color: 'text-red-700 bg-red-50 border-red-200',
    description: 'إضافة موظفين جدد ومنح أو سحب الصلاحيات الحساسة',
  },
];

// Presets for rapid configuration
const ROLE_PRESETS: {
  role: StaffRole;
  label: string;
  jobTitle: string;
  icon: string;
  description: string;
  permissions: StaffPermission[];
}[] = [
  {
    role: 'accountant',
    label: '🧑‍💼 محاسب مالي',
    jobTitle: 'محاسب مالي رئيسي',
    icon: '💼',
    description: 'صلاحيات المحاسبة، الديون، سندات القبض، وتقارير الأرباح والمبيعات',
    permissions: ['accounting', 'reports', 'merchants'],
  },
  {
    role: 'warehouse',
    label: '📦 مسؤول التجهيز والمستودع',
    jobTitle: 'مسؤول التجهيز والمستودع',
    icon: '📦',
    description: 'صلاحيات استقبال وتجهيز الطلبيات، وإدارة السلع والمخزون',
    permissions: ['orders', 'products', 'categories'],
  },
  {
    role: 'purchasing',
    label: '🛒 مسؤول المشتريات والتوريد',
    jobTitle: 'مسؤول المشتريات والتوريد',
    icon: '🛒',
    description: 'صلاحيات فواتير المشتريات، الشركات المجهزة، والسلع والمخزون',
    permissions: ['purchases', 'companies', 'products'],
  },
  {
    role: 'supervisor',
    label: '🚚 مشرف السائقين والتوزيع',
    jobTitle: 'مشرف أسطول التوزيع والسائقين',
    icon: '🚚',
    description: 'صلاحيات إدارة السائقين، السيارات، وتعيين السائقين للطلبات',
    permissions: ['drivers', 'orders'],
  },
  {
    role: 'marketing',
    label: '🎨 مسؤول التسويق والمحتوى',
    jobTitle: 'مسؤول التسويق والعروض',
    icon: '🎨',
    description: 'صلاحيات البنرات الإعلانية، العروض والتخفيضات، والأقسام',
    permissions: ['banners', 'offers', 'categories'],
  },
  {
    role: 'custom',
    label: '🛠️ مخصص (تحديد يدوي)',
    jobTitle: 'موظف بصلاحيات مخصصة',
    icon: '🛠️',
    description: 'تحديد الصلاحيات بشكل فردي ويدوي لكل قسم من أقسام النظام',
    permissions: ['orders'],
  },
];

export default function AdminStaffPage() {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Master Admin Password Modal State
  const [isAdminPassModalOpen, setIsAdminPassModalOpen] = useState(false);
  const [adminUsername, setAdminUsername] = useState('admin');
  const [currentAdminPassword, setCurrentAdminPassword] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [isUpdatingAdminPass, setIsUpdatingAdminPass] = useState(false);

  // Staff Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [formData, setFormData] = useState<{
    name: string;
    username: string;
    password: string;
    phone: string;
    jobTitle: string;
    role: StaffRole;
    permissions: string[];
    isActive: boolean;
    notes: string;
  }>({
    name: '',
    username: '',
    password: '',
    phone: '',
    jobTitle: 'محاسب مالي رئيسي',
    role: 'accountant',
    permissions: ['accounting', 'reports'],
    isActive: true,
    notes: '',
  });

  const fetchStaff = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/staff');
      const data = await res.json();
      if (data.success && Array.isArray(data.staff)) {
        setStaffList(data.staff);
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ في تحميل قائمة الموظفين');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleOpenAddModal = () => {
    setEditingStaffId(null);
    setFormData({
      name: '',
      username: '',
      password: '',
      phone: '',
      jobTitle: 'محاسب مالي رئيسي',
      role: 'accountant',
      permissions: ['accounting', 'reports', 'merchants'],
      isActive: true,
      notes: '',
    });
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (staff: StaffMember) => {
    setEditingStaffId(staff.id);
    setFormData({
      name: staff.name,
      username: staff.username,
      password: '',
      phone: staff.phone || '',
      jobTitle: staff.jobTitle || '',
      role: staff.role || 'custom',
      permissions: staff.permissions || [],
      isActive: staff.isActive,
      notes: staff.notes || '',
    });
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleSelectRolePreset = (role: StaffRole) => {
    const preset = ROLE_PRESETS.find((p) => p.role === role);
    if (preset) {
      setFormData((prev) => ({
        ...prev,
        role: preset.role,
        jobTitle: prev.jobTitle && prev.jobTitle !== 'موظف' ? prev.jobTitle : preset.jobTitle,
        permissions: preset.role === 'custom' ? prev.permissions : preset.permissions,
      }));
    }
  };

  const handleTogglePermission = (permKey: string) => {
    setFormData((prev) => {
      const exists = prev.permissions.includes(permKey);
      const nextPerms = exists
        ? prev.permissions.filter((p) => p !== permKey)
        : [...prev.permissions, permKey];
      return {
        ...prev,
        role: 'custom', // switch to custom when hand-picking
        permissions: nextPerms,
      };
    });
  };

  const handleSelectAllPermissions = () => {
    setFormData((prev) => ({
      ...prev,
      permissions: ALL_PERMISSIONS.map((p) => p.key),
    }));
  };

  const handleClearAllPermissions = () => {
    setFormData((prev) => ({
      ...prev,
      permissions: [],
    }));
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('يرجى إدخال اسم الموظف');
      return;
    }
    if (!formData.username.trim()) {
      toast.error('يرجى إدخال اسم المستخدم للدخول');
      return;
    }
    if (!editingStaffId && !formData.password.trim()) {
      toast.error('يرجى إدخال كلمة مرور لحساب الموظف');
      return;
    }
    if (formData.permissions.length === 0) {
      toast.error('يرجى تحديد صلاحية واحدة على الأقل للموظف للوصول للنظام');
      return;
    }

    setIsSubmitting(true);
    try {
      const url = editingStaffId ? `/api/admin/staff/${editingStaffId}` : '/api/admin/staff';
      const method = editingStaffId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(editingStaffId ? 'تم تحديث بيانات وصلاحيات الموظف بنجاح ✓' : 'تم إضافة الموظف وتفعيل حسابه بنجاح 🎉');
        setIsModalOpen(false);
        fetchStaff();
      } else {
        toast.error(data.error || 'تعذر حفظ الموظف');
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ في الاتصال بالخادم');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAdminPassword.trim()) {
      toast.error('يرجى إدخال كلمة المرور الحالية للإدارة');
      return;
    }
    if (!newAdminPassword.trim()) {
      toast.error('يرجى إدخال كلمة المرور الجديدة');
      return;
    }
    if (newAdminPassword !== confirmAdminPassword) {
      toast.error('كلمات المرور الجديدة غير متطابقة');
      return;
    }

    setIsUpdatingAdminPass(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_password',
          username: adminUsername,
          password: currentAdminPassword.trim(),
          newPassword: newAdminPassword.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('تم تغيير كلمة مرور المدير العام الرئيسي بنجاح 🔒✅');
        setIsAdminPassModalOpen(false);
        setCurrentAdminPassword('');
        setNewAdminPassword('');
        setConfirmAdminPassword('');
      } else {
        toast.error(data.error || 'تعذر تغيير كلمة المرور');
      }
    } catch (err) {
      toast.error('حدث خطأ في الاتصال بالخادم');
    } finally {
      setIsUpdatingAdminPass(false);
    }
  };

  const handleToggleActive = async (staff: StaffMember) => {
    const newStatus = !staff.isActive;
    try {
      const res = await fetch(`/api/admin/staff/${staff.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(newStatus ? `تم تفعيل حساب الموظف (${staff.name}) ✓` : `تم تجميد حساب الموظف (${staff.name}) ❄️`);
        fetchStaff();
      } else {
        toast.error(data.error || 'تعذر تغيير حالة الحساب');
      }
    } catch (err) {
      toast.error('حدث خطأ أثناء تحديث حالة الموظف');
    }
  };

  const handleDeleteStaff = async (staff: StaffMember) => {
    const confirmed = await confirm({
      title: `حذف حساب الموظف (${staff.name})`,
      message: `هل أنت متأكد من رغبتك في حذف حساب الموظف "${staff.name}" نهائياً من النظام؟ لن يتمكن بعدها من تسجيل الدخول.`,
      confirmText: 'نعم، احذف الحساب',
      cancelText: 'إلغاء',
      type: 'danger',
    });

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/staff/${staff.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('تم حذف حساب الموظف بنجاح 🗑️');
        fetchStaff();
      } else {
        toast.error(data.error || 'تعذر حذف الموظف');
      }
    } catch (err) {
      toast.error('حدث خطأ في الاتصال بالسيرفر');
    }
  };

  const filteredStaff = staffList.filter((s) => {
    const matchQuery =
      !searchQuery.trim() ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.phone && s.phone.includes(searchQuery)) ||
      (s.jobTitle && s.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchRole = roleFilter === 'all' || s.role === roleFilter;

    return matchQuery && matchRole;
  });

  const activeStaffCount = staffList.filter((s) => s.isActive).length;
  const frozenStaffCount = staffList.filter((s) => !s.isActive).length;

  return (
    <div className="space-y-6 text-xs select-none">
      
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 text-white flex items-center justify-center shadow-md shrink-0 text-xl font-black">
            👥
          </div>
          <div>
            <div className="inline-block bg-purple-100 text-purple-900 text-[10px] font-black px-2 py-0.5 rounded-md mb-1">
              فريق العمل وتحديد الصلاحيات 🔐
            </div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <span>إدارة حسابات الموظفين وصلاحيات الوصول</span>
            </h2>
            <p className="text-slate-500 font-bold text-xs mt-0.5">
              إنشاء حسابات مستقلة للمحاسبين، مسؤولي التجهيز والمشتريات وتحديد الصفحات المسموح بدخولها
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={fetchStaff}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition cursor-pointer"
            title="تحديث القائمة"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-black text-xs py-2.5 px-4 rounded-2xl shadow-sm transition flex items-center gap-2 cursor-pointer hover:scale-102 active:scale-98"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ إضافة موظف جديد وتحديد صلاحياته</span>
          </button>
        </div>
      </div>

      {/* Quick Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">إجمالي الموظفين المسجلين</span>
            <span className="text-xl font-black text-slate-900 mt-1 block">{staffList.length} موظف</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-black">
            👥
          </div>
        </div>

        <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-emerald-800 block">حسابات نشطة تعمل حالياً</span>
            <span className="text-xl font-black text-emerald-950 mt-1 block">{activeStaffCount} نشط ✓</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">حسابات مجمدة أو معطلة</span>
            <span className="text-xl font-black text-slate-700 mt-1 block">{frozenStaffCount} معطل ❄️</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center font-black">
            <UserX className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Master Admin Notice Banner */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl font-black shrink-0 shadow-xs">
            👑
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-amber-950 text-xs block">حساب المدير العام الرئيسي (Master Admin)</span>
              <span className="bg-amber-200 text-amber-950 text-[10px] font-black px-2 py-0.5 rounded-full font-mono">admin</span>
            </div>
            <p className="text-[11px] text-amber-900 font-bold mt-0.5">
              يمتلك كامل الصلاحيات دون قيود لإدارة النظام والموظفين وكافة الفروع.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setCurrentAdminPassword('');
            setNewAdminPassword('');
            setConfirmAdminPassword('');
            setIsAdminPassModalOpen(true);
          }}
          className="bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-98"
        >
          <Key className="w-3.5 h-3.5" />
          <span>تغيير الرقم السري للمدير (Admin Password) 🔑</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، اسم المستخدم، الهاتف، الوظيفة..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 pl-8 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        </div>

        {/* Role Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setRoleFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer whitespace-nowrap ${
              roleFilter === 'all' ? 'bg-purple-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            الكل ({staffList.length})
          </button>
          {ROLE_PRESETS.map((p) => {
            const count = staffList.filter((s) => s.role === p.role).length;
            return (
              <button
                key={p.role}
                type="button"
                onClick={() => setRoleFilter(p.role)}
                className={`px-2.5 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  roleFilter === p.role ? 'bg-purple-700 text-white font-black' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{p.label}</span>
                {count > 0 && <span className="bg-black/10 px-1.5 py-0.2 rounded-full text-[10px]">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 font-bold">جاري تحميل قائمة الموظفين...</div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-12 text-center text-slate-500 font-bold space-y-3">
            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto text-xl font-black">
              👥
            </div>
            <p className="text-slate-700 font-black">لا يوجد موظفين مسجلين تطابق البحث</p>
            <p className="text-xs text-slate-400">اضغط على زر (إضافة موظف جديد) لإنشاء حساب وتحديد صلاحياته</p>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="bg-purple-700 hover:bg-purple-800 text-white font-black text-xs px-4 py-2 rounded-xl transition shadow-xs cursor-pointer"
            >
              + إضافة أول موظف الآن 🧑‍💼
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-black text-[11px]">
                <tr className="divide-x divide-x-reverse divide-slate-200">
                  <th className="py-3 px-3.5">الموظف والمسمى الوظيفي</th>
                  <th className="py-3 px-3">اسم المستخدم للدخول</th>
                  <th className="py-3 px-3">رقم الهاتف</th>
                  <th className="py-3 px-3">الدور المعتمد</th>
                  <th className="py-3 px-3">الصلاحيات الممنوحة ({ALL_PERMISSIONS.length})</th>
                  <th className="py-3 px-3 text-center">حالة الحساب</th>
                  <th className="py-3 px-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map((staff) => {
                  const preset = ROLE_PRESETS.find((p) => p.role === staff.role) || ROLE_PRESETS[ROLE_PRESETS.length - 1];

                  return (
                    <tr key={staff.id} className="hover:bg-slate-50/80 transition divide-x divide-x-reverse divide-slate-100">
                      
                      {/* Name & Job Title */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base font-black shrink-0 ${
                            staff.isActive ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {preset.icon}
                          </div>
                          <div>
                            <span className="font-black text-slate-900 text-xs sm:text-[13px] block">
                              {staff.name}
                            </span>
                            <span className="text-[11px] text-purple-700 font-bold block">
                              {staff.jobTitle || 'موظف النظام'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Username */}
                      <td className="py-3 px-3 whitespace-nowrap font-mono font-black text-slate-800">
                        <div className="inline-flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                          <Key className="w-3 h-3 text-slate-500" />
                          <span dir="ltr">@{staff.username}</span>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {staff.phone ? (
                          <a
                            href={`tel:${staff.phone}`}
                            className="inline-flex items-center gap-1 text-slate-700 hover:text-emerald-700 font-mono font-bold bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200 transition"
                          >
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span dir="ltr">{staff.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 font-bold">-</span>
                        )}
                      </td>

                      {/* Role Badge */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-block bg-purple-50 text-purple-900 border border-purple-200 font-black text-[11px] px-2.5 py-1 rounded-xl">
                          {preset.label}
                        </span>
                      </td>

                      {/* Permissions List Pills */}
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1 max-w-sm">
                          {(staff.permissions || []).map((permKey) => {
                            const opt = ALL_PERMISSIONS.find((p) => p.key === permKey);
                            if (!opt) return null;
                            const IconComponent = opt.icon;
                            return (
                              <span
                                key={permKey}
                                className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[10px] font-bold px-2 py-0.5 rounded-lg"
                                title={opt.description}
                              >
                                <IconComponent className="w-2.5 h-2.5 text-slate-500" />
                                <span>{opt.label.split(' ')[0]} {opt.label.split(' ')[1] || ''}</span>
                              </span>
                            );
                          })}
                          {(staff.permissions || []).length === 0 && (
                            <span className="text-red-500 font-bold text-[10px]">لا توجد صلاحيات محددة!</span>
                          )}
                        </div>
                      </td>

                      {/* Active Status Switch */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(staff)}
                          className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full border transition cursor-pointer ${
                            staff.isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'
                          }`}
                          title="اضغط للتبديل بين التفعيل والتجميد"
                        >
                          {staff.isActive ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>مفعل ونشط ✓</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-slate-400" />
                              <span>مجمد / معطل ❄️</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(staff)}
                            className="p-1.5 bg-sky-50 hover:bg-sky-100 text-brand-blue border border-sky-200 rounded-xl transition cursor-pointer"
                            title="تعديل بيانات وصلاحيات الموظف"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteStaff(staff)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl transition cursor-pointer"
                            title="حذف حساب الموظف نهائياً"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT STAFF MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-5 sm:p-6 space-y-5 text-xs text-slate-900 my-auto max-h-[92vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center text-xl font-black">
                  🧑‍💼
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    {editingStaffId ? 'تعديل بيانات وصلاحيات الموظف' : 'إضافة موظف جديد وتحديد الصلاحيات 🔐'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-bold">
                    حدد اسم الموظف، بيانات الدخول، والأقسام المسموح له بالوصول إليها
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Content */}
            <form onSubmit={handleSaveStaff} className="space-y-4 overflow-y-auto pr-1 flex-1">
              
              {/* Basic Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black text-slate-800 block mb-1">
                    اسم الموظف الثلاثي / الرباعي: <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: أحمد علي المحاسب"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-800 block mb-1">
                    المسمى الوظيفي:
                  </label>
                  <input
                    type="text"
                    value={formData.jobTitle}
                    onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                    placeholder="مثال: محاسب رئيسي / مسؤول تجهيز"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-800 block mb-1">
                    اسم المستخدم للدخول (Username): <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                    placeholder="مثال: ahmed_accountant"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono font-black text-slate-900 focus:bg-white focus:border-brand-blue"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-800 block mb-1">
                    {editingStaffId ? 'تغيير كلمة المرور (اتركها فارغة للإبقاء على الحالية):' : 'كلمة المرور للدخول:'} <span className="text-red-500">{!editingStaffId ? '*' : ''}</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required={!editingStaffId}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={editingStaffId ? '•••••••• (غير معدلة)' : 'كلمة مرور قوية'}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 pr-3 pl-8 text-xs font-mono font-black text-slate-900 focus:bg-white focus:border-brand-blue"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-800 block mb-1">
                    رقم هاتف الموظف (للتواصل):
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="0770xxxxxxx"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-800 block mb-1">
                    حالة الحساب:
                  </label>
                  <select
                    value={formData.isActive ? 'active' : 'frozen'}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'active' })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                  >
                    <option value="active">مفعل ونشط (يمكنه تسجيل الدخول فوراً) ✓</option>
                    <option value="frozen">معطل / مجمد مؤقتاً ❄️</option>
                  </select>
                </div>
              </div>

              {/* ROLE PRESET QUICK SELECTOR */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-[11px] font-black text-purple-950 block">
                  🎯 اختيار قالب وظيفي جاهز لتحديد الصلاحيات بسرعة:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ROLE_PRESETS.map((p) => (
                    <button
                      key={p.role}
                      type="button"
                      onClick={() => handleSelectRolePreset(p.role)}
                      className={`p-2.5 rounded-2xl border text-right transition cursor-pointer ${
                        formData.role === p.role
                          ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-400/20 text-purple-950'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                      }`}
                    >
                      <span className="font-black text-xs block mb-0.5">{p.label}</span>
                      <span className="text-[10px] text-slate-500 font-medium block line-clamp-2 leading-tight">
                        {p.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* GRANULAR PERMISSIONS CHECKBOXES */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-[11px] font-black text-slate-900 block">
                      🔐 الصلاحيات والأقسام المسموح للموظف بالوصول إليها ({formData.permissions.length} محددة):
                    </label>
                    <p className="text-[10px] text-slate-500 font-bold">
                      سيتم إخفاء وحجب أي قسم لا تختاره هنا عن حساب الموظف
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllPermissions}
                      className="text-[10px] font-black text-brand-blue hover:underline cursor-pointer"
                    >
                      تحديد الكل ✓
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleClearAllPermissions}
                      className="text-[10px] font-black text-red-500 hover:underline cursor-pointer"
                    >
                      إلغاء الكل ✕
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                  {ALL_PERMISSIONS.map((perm) => {
                    const isChecked = formData.permissions.includes(perm.key);
                    const IconComponent = perm.icon;

                    return (
                      <label
                        key={perm.key}
                        onClick={() => handleTogglePermission(perm.key)}
                        className={`p-2.5 rounded-2xl border flex items-start gap-2.5 cursor-pointer transition select-none ${
                          isChecked
                            ? 'bg-purple-50/70 border-purple-300 text-purple-950 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by parent label click
                          className="w-4 h-4 text-purple-600 rounded mt-0.5 cursor-pointer"
                        />
                        <div className="space-y-0.5 flex-1">
                          <div className="flex items-center gap-1.5">
                            <IconComponent className={`w-3.5 h-3.5 ${isChecked ? 'text-purple-700' : 'text-slate-400'}`} />
                            <span className="font-black text-xs text-slate-900">{perm.label}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium leading-tight">
                            {perm.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  ملاحظات إدارية عن الموظف:
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="مثال: دوام صباحي / مسؤول فرع كربلاء"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition cursor-pointer"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-black px-6 py-2.5 rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>جاري الحفظ...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{editingStaffId ? 'حفظ التعديلات' : 'إنشاء وتفعيل حساب الموظف 🔐'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MASTER ADMIN PASSWORD CHANGE MODAL */}
      {isAdminPassModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-150">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    تغيير الرقم السري لحساب المدير العام
                  </h3>
                  <p className="text-[11px] text-slate-500 font-bold">
                    حساب الإدارة الرئيسي (Master Admin - admin)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAdminPassModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateAdminPassword} className="space-y-4">
              
              {/* Current Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 block">
                  كلمة المرور الحالية للإدارة *:
                </label>
                <input
                  type="password"
                  required
                  value={currentAdminPassword}
                  onChange={(e) => setCurrentAdminPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور الحالية"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-amber-600 focus:outline-none"
                />
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 block">
                  كلمة المرور الجديدة *:
                </label>
                <input
                  type="password"
                  required
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور الجديدة والقوية"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-amber-600 focus:outline-none"
                />
              </div>

              {/* Confirm New Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 block">
                  تأكيد كلمة المرور الجديدة *:
                </label>
                <input
                  type="password"
                  required
                  value={confirmAdminPassword}
                  onChange={(e) => setConfirmAdminPassword(e.target.value)}
                  placeholder="أعد كتابة كلمة المرور الجديدة للتأكيد"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-amber-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAdminPassModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition cursor-pointer text-xs"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isUpdatingAdminPass}
                  className="bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-black px-5 py-2.5 rounded-xl shadow-xs transition flex items-center gap-2 cursor-pointer text-xs disabled:opacity-50"
                >
                  {isUpdatingAdminPass ? 'جاري الحفظ والتشفير...' : 'تحديث كلمة مرور المدير 🔒'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
