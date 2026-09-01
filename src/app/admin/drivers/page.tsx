'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Truck,
  Plus,
  Phone,
  Lock,
  Edit2,
  Trash2,
  Wallet,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  DollarSign,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  X,
  Building,
  Car,
  Key,
  ShieldCheck,
  MapPin,
  FileText,
  Printer,
  Navigation,
  Calendar,
  User,
  Eye,
  CheckCircle2,
  MessageCircle,
  Star,
  Sparkles,
  ThumbsUp
} from 'lucide-react';
import { Driver, Vehicle, Order, DriverRating } from '@/types';
import { useConfirm } from '@/context/ConfirmModalContext';

interface DriverWithStats extends Driver {
  activeDeliveries?: number;
  completedDeliveries?: number;
  totalDeliveredRevenue?: number;
}

interface VehicleWithStats extends Vehicle {
  activeDeliveries?: number;
  completedDeliveries?: number;
  totalDeliveredRevenue?: number;
}

export default function AdminDriversPage() {
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<'drivers' | 'vehicles' | 'ratings'>('drivers');
  
  // Drivers State
  const [drivers, setDrivers] = useState<DriverWithStats[]>([]);
  const [vehicles, setVehicles] = useState<VehicleWithStats[]>([]);
  const [allRatings, setAllRatings] = useState<DriverRating[]>([]);
  const [selectedDriverRatingsModal, setSelectedDriverRatingsModal] = useState<{ driver: Driver; ratings: DriverRating[] } | null>(null);
  const [ratingFilterDriver, setRatingFilterDriver] = useState<string>('all');
  const [ratingFilterStars, setRatingFilterStars] = useState<string>('all');
  const [ratingFilterCommentsOnly, setRatingFilterCommentsOnly] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Driver Orders History Modal State
  const [driverOrdersModal, setDriverOrdersModal] = useState<{
    driver: Driver;
    orders: Order[];
    stats: any;
  } | null>(null);
  const [isLoadingDriverOrders, setIsLoadingDriverOrders] = useState(false);

  // Driver Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [defaultVehicleId, setDefaultVehicleId] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Vehicle Add / Edit Modal
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehName, setVehName] = useState('');
  const [vehPlate, setVehPlate] = useState('');
  const [vehType, setVehType] = useState('كيا حمل');
  const [vehYear, setVehYear] = useState('');
  const [vehNotes, setVehNotes] = useState('');
  const [vehIsActive, setVehIsActive] = useState(true);
  const [isSavingVehicle, setIsSavingVehicle] = useState(false);

  // Settlement Modal State
  const [settleModalDriver, setSettleModalDriver] = useState<Driver | null>(null);
  const [settleAmount, setSettleAmount] = useState<string>('');
  const [settleNotes, setSettleNotes] = useState('');
  const [isSettling, setIsSettling] = useState(false);
  const [settleDriverOrders, setSettleDriverOrders] = useState<Order[]>([]);
  const [isLoadingSettleOrders, setIsLoadingSettleOrders] = useState(false);
  const [showSettleOrdersBreakdown, setShowSettleOrdersBreakdown] = useState(true);

  // Modern Toast Notification State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const handleOpenDriverOrders = async (driver: Driver) => {
    setIsLoadingDriverOrders(true);
    setDriverOrdersModal({ driver, orders: [], stats: null });
    try {
      const res = await fetch(`/api/admin/drivers/${driver.id}/orders`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setDriverOrdersModal({
          driver: data.driver,
          orders: data.orders || [],
          stats: data.stats || null,
        });
      }
    } catch (e) {
      console.error(e);
      showToast('حدث خطأ أثناء جلب سجل طلبيات السائق', 'error');
    }
    setIsLoadingDriverOrders(false);
  };

  const fetchDriversAndVehicles = async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const [resDrivers, resVehicles, resRatings] = await Promise.all([
        fetch('/api/admin/drivers', { cache: 'no-store' }),
        fetch('/api/admin/vehicles', { cache: 'no-store' }),
        fetch('/api/driver-ratings', { cache: 'no-store' }),
      ]);
      const dataDrivers = await resDrivers.json();
      const dataVehicles = await resVehicles.json();
      const dataRatings = await resRatings.json();

      if (dataDrivers.success) {
        setDrivers(dataDrivers.drivers || []);
      }
      if (dataVehicles.success) {
        setVehicles(dataVehicles.vehicles || []);
      }
      if (dataRatings.success) {
        setAllRatings(dataRatings.ratings || []);
      }
    } catch (e) {
      console.error(e);
    }
    if (!isSilent) setIsLoading(false);
  };

  useEffect(() => {
    fetchDriversAndVehicles(false);
    const interval = setInterval(() => {
      if (!isModalOpen && !isVehicleModalOpen && !settleModalDriver) {
        fetchDriversAndVehicles(true);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [isModalOpen, isVehicleModalOpen, settleModalDriver]);

  // ================= DRIVER HANDLERS =================
  const openAddModal = () => {
    setEditingDriver(null);
    setName('');
    setPhone('');
    setPassword('123');
    setVehicleInfo('');
    setDefaultVehicleId('');
    setNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (driver: Driver) => {
    setEditingDriver(driver);
    setName(driver.name);
    setPhone(driver.phone);
    setPassword(driver.password || '123');
    setVehicleInfo(driver.vehicleInfo || '');
    setDefaultVehicleId(driver.defaultVehicleId || '');
    setNotes(driver.notes || '');
    setIsModalOpen(true);
  };

  const openSettleModal = async (driver: Driver) => {
    setSettleModalDriver(driver);
    setSettleAmount((driver.currentCashInHand || 0).toString());
    setSettleNotes('');
    setSettleDriverOrders([]);
    setIsLoadingSettleOrders(true);
    setShowSettleOrdersBreakdown(true);

    try {
      const res = await fetch(`/api/admin/drivers/${driver.id}/orders`);
      const data = await res.json();
      if (data.success && Array.isArray(data.orders)) {
        // Filter orders with collected cash that are not settled yet
        const unsettled = data.orders.filter(
          (o: Order) => (o.collectedAmount || 0) > 0 && !o.driverCashSettled
        );
        setSettleDriverOrders(
          unsettled.length > 0
            ? unsettled
            : data.orders.filter((o: Order) => (o.collectedAmount || 0) > 0).slice(0, 10)
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingSettleOrders(false);
    }
  };

  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    setIsSaving(true);
    try {
      const payload = {
        name,
        phone,
        password,
        vehicleInfo: vehicleInfo || (defaultVehicleId ? vehicles.find(v => v.id === defaultVehicleId)?.name : ''),
        defaultVehicleId,
        notes,
      };

      if (editingDriver) {
        const res = await fetch(`/api/admin/drivers/${editingDriver.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          setIsModalOpen(false);
          fetchDriversAndVehicles(false);
          showToast('تم تحديث بيانات السائق بنجاح! ✅', 'success');
        } else {
          showToast(data.error || 'فشل التحديث', 'error');
        }
      } else {
        const res = await fetch('/api/admin/drivers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          setIsModalOpen(false);
          fetchDriversAndVehicles(false);
          showToast('تمت إضافة السائق الجديد بنجاح! ✅', 'success');
        } else {
          showToast(data.error || 'فشل الحفظ', 'error');
        }
      }
    } catch (e) {
      console.error(e);
      showToast('حدث خطأ أثناء الحفظ', 'error');
    }
    setIsSaving(false);
  };

  const handleDeleteDriver = async (id: string, driverName: string) => {
    const isConfirmed = await confirm({
      title: 'حذف السائق',
      message: `هل أنت متأكد من حذف السائق "${driverName}" من النظام؟`,
      confirmText: 'نعم، احذف السائق',
      cancelText: 'تراجع',
      type: 'danger',
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/admin/drivers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchDriversAndVehicles(false);
        showToast('تم حذف السائق بنجاح 🗑️', 'success');
      }
    } catch (e) {
      console.error(e);
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  };

  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleModalDriver) return;

    const amountNum = Number(settleAmount);
    if (isNaN(amountNum) || amountNum < 0) {
      showToast('يرجى إدخال مبلغ تصفية صحيح', 'error');
      return;
    }

    setIsSettling(true);
    try {
      const res = await fetch(`/api/admin/drivers/${settleModalDriver.id}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customAmount: amountNum,
          notes: settleNotes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSettleModalDriver(null);
        fetchDriversAndVehicles(false);
        showToast(data.message || 'تمت تصفية العهدة وتوليد سندات القبض بنجاح! ✅', 'success');
      } else {
        showToast(data.error || 'فشلت عملية التصفية', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('حدث خطأ أثناء الاتصال بالخادم', 'error');
    }
    setIsSettling(false);
  };

  // ================= VEHICLE HANDLERS =================
  const openAddVehicleModal = () => {
    setEditingVehicle(null);
    setVehName('');
    setVehPlate('');
    setVehType('كيا حمل');
    setVehYear('2023');
    setVehNotes('');
    setVehIsActive(true);
    setIsVehicleModalOpen(true);
  };

  const openEditVehicleModal = (veh: Vehicle) => {
    setEditingVehicle(veh);
    setVehName(veh.name);
    setVehPlate(veh.plateNumber);
    setVehType(veh.type || 'كيا حمل');
    setVehYear(veh.modelYear || '');
    setVehNotes(veh.notes || '');
    setVehIsActive(veh.isActive !== false);
    setIsVehicleModalOpen(true);
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehName || !vehPlate) {
      showToast('يرجى إدخال اسم المركبة ورقم اللوحة', 'error');
      return;
    }

    setIsSavingVehicle(true);
    try {
      const payload = {
        name: vehName,
        plateNumber: vehPlate,
        type: vehType,
        modelYear: vehYear,
        notes: vehNotes,
        isActive: vehIsActive,
      };

      if (editingVehicle) {
        const res = await fetch(`/api/admin/vehicles/${editingVehicle.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          setIsVehicleModalOpen(false);
          fetchDriversAndVehicles(false);
          showToast('تم تعديل بيانات المركبة بنجاح! ✅', 'success');
        } else {
          showToast(data.error || 'فشل التعديل', 'error');
        }
      } else {
        const res = await fetch('/api/admin/vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          setIsVehicleModalOpen(false);
          fetchDriversAndVehicles(false);
          showToast('تمت إضافة المركبة الجديدة للأسطول بنجاح! 🚗', 'success');
        } else {
          showToast(data.error || 'فشل الحفظ', 'error');
        }
      }
    } catch (e) {
      console.error(e);
      showToast('حدث خطأ أثناء حفظ المركبة', 'error');
    }
    setIsSavingVehicle(false);
  };

  const handleDeleteVehicle = async (id: string, vName: string) => {
    const isConfirmed = await confirm({
      title: 'حذف المركبة',
      message: `هل أنت متأكد من حذف المركبة "${vName}" من أسطول الشركة؟`,
      confirmText: 'نعم، احذف المركبة',
      cancelText: 'تراجع',
      type: 'danger',
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/admin/vehicles/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchDriversAndVehicles(false);
        showToast('تم حذف المركبة بنجاح 🗑️', 'success');
      }
    } catch (e) {
      console.error(e);
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  };

  // Stats calculation
  const totalDrivers = drivers.length;
  const totalActiveDeliveries = drivers.reduce((sum, d) => sum + (d.activeDeliveries || 0), 0);
  const totalCashInHand = drivers.reduce((sum, d) => sum + (d.currentCashInHand || 0), 0);

  const totalVehicles = vehicles.length;
  const activeVehiclesCount = vehicles.filter(v => v.isActive !== false).length;

  const filteredDrivers = drivers.filter(
    (d) =>
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.phone.includes(searchQuery) ||
      (d.vehicleInfo && d.vehicleInfo.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredVehicles = vehicles.filter(
    (v) =>
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.plateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredRatings = allRatings.filter((rate) => {
    // 1. Filter by Driver
    if (ratingFilterDriver !== 'all' && rate.driverId !== ratingFilterDriver) {
      return false;
    }
    // 2. Filter by Stars
    if (ratingFilterStars === '5' && rate.rating !== 5) return false;
    if (ratingFilterStars === '4' && rate.rating !== 4) return false;
    if (ratingFilterStars === 'low' && rate.rating > 3) return false;
    // 3. Filter by Comment text only
    if (ratingFilterCommentsOnly && (!rate.comment || rate.comment.trim().length === 0)) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 text-xs" dir="rtl">
      
      {/* Top Header Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-amber-500" />
            <span>إدارة أسطول النقل وسائقي وسيارات التوصيل 🚚🚗</span>
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-1">
            إضافة السائقين، تسجيل سيارات ومركبات الأسطول، إسناد طلبيات الزبائن، وتصفية العهد النقدية
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/driver/login"
            target="_blank"
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs py-3 px-4 rounded-2xl border border-slate-200 transition flex items-center gap-1.5"
          >
            <ExternalLink className="w-4 h-4 text-amber-600" />
            <span>بوابة السائق (للموبايل) 📱</span>
          </Link>

          {activeTab === 'drivers' ? (
            <button
              onClick={openAddModal}
              className="bg-brand-blue hover:bg-brand-blueDark text-white font-black text-xs py-3 px-5 rounded-2xl shadow-md transition flex items-center gap-2 transform active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة سائق جديد ⚡</span>
            </button>
          ) : (
            <button
              onClick={openAddVehicleModal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3 px-5 rounded-2xl shadow-md transition flex items-center gap-2 transform active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة سيارة / مركبة جديدة 🚗</span>
            </button>
          )}
        </div>
      </div>

      {/* TABS SELECTOR */}
      <div className="flex items-center gap-2 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200 w-fit flex-wrap">
        <button
          onClick={() => { setActiveTab('drivers'); setSearchQuery(''); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs transition cursor-pointer ${
            activeTab === 'drivers'
              ? 'bg-brand-blue text-white shadow-sm'
              : 'text-slate-700 hover:bg-white/60'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>👨‍✈️ أسطول السائقين والمناديب ({drivers.length})</span>
        </button>

        <button
          onClick={() => { setActiveTab('vehicles'); setSearchQuery(''); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs transition cursor-pointer ${
            activeTab === 'vehicles'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-700 hover:bg-white/60'
          }`}
        >
          <Car className="w-4 h-4" />
          <span>🚗 أسطول السيارات والمركبات ({vehicles.length})</span>
        </button>

        <button
          onClick={() => { setActiveTab('ratings'); setSearchQuery(''); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs transition cursor-pointer ${
            activeTab === 'ratings'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-slate-700 hover:bg-white/60'
          }`}
        >
          <Star className="w-4 h-4" />
          <span>⭐ سجل تقييمات وآراء الزبائن ({allRatings.length})</span>
        </button>
      </div>

      {/* TAB 1: DRIVERS LIST */}
      {activeTab === 'drivers' && (
        <div className="space-y-6">
          {/* KPI Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Drivers */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">إجمالي السائقين المسجلين</span>
                <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
                  {totalDrivers} سائقين
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
                <Truck className="w-6 h-6" />
              </div>
            </div>

            {/* Active Deliveries */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">طلبيات قيد التوصيل الآن</span>
                <span className="text-2xl font-black text-brand-blue font-mono mt-1 block">
                  {totalActiveDeliveries} طلبيات
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-sky-50 text-brand-blue border border-sky-200 flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            {/* Total Cash In Hand */}
            <div className="bg-gradient-to-br from-emerald-50 to-white p-5 rounded-3xl border-2 border-emerald-300 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-black text-emerald-800 block">
                  إجمالي الكاش في عهدة السائقين (بانتظار التصفية)
                </span>
                <span className="text-2xl font-black text-emerald-950 font-mono mt-1 block">
                  {totalCashInHand.toLocaleString()} <span className="text-xs font-normal">د.ع</span>
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                <Wallet className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Drivers List Card */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4">
              <h3 className="font-black text-sm text-slate-900">
                قائمة السائقين ومناديب التوصيل ({drivers.length})
              </h3>
              <input
                type="text"
                placeholder="بحث باسم السائق، الهاتف، أو السيارة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-blue w-64 font-medium"
              />
            </div>

            {isLoading ? (
              <div className="p-12 text-center text-slate-400 font-bold">جاري تحميل بيانات السائقين...</div>
            ) : filteredDrivers.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <p className="text-slate-500 font-bold">لا يوجد سائقين مسجلين بعد</p>
                <button
                  onClick={openAddModal}
                  className="bg-brand-blue text-white font-black text-xs py-2 px-4 rounded-xl shadow-xs"
                >
                  + إضافة أول سائق الآن
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-100 font-black text-[11px]">
                    <tr className="divide-x divide-x-reverse divide-slate-100">
                      <th className="py-3 px-4">السائق والمعلومات</th>
                      <th className="py-3 px-4">المركبة الافتراضية 🚗</th>
                      <th className="py-3 px-4">الطلبيات النشطة</th>
                      <th className="py-3 px-4">المسلّم اليوم</th>
                      <th className="py-3 px-4">العهدة النقدية بيده (الكاش)</th>
                      <th className="py-3 px-4 text-center">إجراءات الإدارة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDrivers.map((driver) => {
                      const hasCash = (driver.currentCashInHand || 0) > 0;
                      const matchedVeh = vehicles.find(v => v.id === driver.defaultVehicleId);
                      return (
                        <tr key={driver.id} className="hover:bg-slate-50/80 transition divide-x divide-x-reverse divide-slate-100">
                          <td className="py-4 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                                <Truck className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-slate-900">{driver.name}</span>
                                  {driver.isActive ? (
                                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                      نشط ✅
                                    </span>
                                  ) : (
                                    <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                      متوقف
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const driverRatings = allRatings.filter(r => r.driverId === driver.id);
                                      setSelectedDriverRatingsModal({ driver, ratings: driverRatings });
                                    }}
                                    className="bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 text-[10px] font-black px-2 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer transition shadow-2xs"
                                    title="انقر لعرض تفاصيل تقييمات هذا السائق"
                                  >
                                    <span>⭐ {driver.averageRating ? Number(driver.averageRating).toFixed(1) : '5.0'}</span>
                                    <span>({driver.ratingTierLabel || (driver.ratingsCount ? 'ممتاز 🌟' : 'سائق معتمد 🌟')})</span>
                                    <span className="text-slate-400 font-normal font-mono">({driver.ratingsCount || 0} تقييم)</span>
                                  </button>
                                </div>
                                <div className="text-slate-500 font-mono text-[11px] mt-0.5" dir="ltr">
                                  <span>{driver.phone} • كلمة المرور: {driver.password || '123'}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap">
                            {matchedVeh ? (
                              <div className="space-y-0.5">
                                <span className="font-bold text-slate-800 block text-xs">🚗 {matchedVeh.name}</span>
                                <span className="text-[10px] text-slate-500 font-mono block">({matchedVeh.plateNumber})</span>
                              </div>
                            ) : (
                              <span className="text-slate-600 font-medium">
                                {driver.vehicleInfo || 'تحدد عند إسناد الطلبية'}
                              </span>
                            )}
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap">
                            {driver.activeDeliveries && driver.activeDeliveries > 0 ? (
                              <span className="bg-amber-100 text-amber-900 font-black px-2.5 py-1 rounded-xl text-xs inline-flex items-center gap-1 animate-pulse">
                                <span>{driver.activeDeliveries} طلبيات بالطريق 🚚</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 font-bold">لا يوجد طلبيات حالية</span>
                            )}
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap font-bold text-slate-700">
                            {driver.completedDeliveries || 0} طلبيات
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap">
                            <div className="space-y-1">
                              <span className={`font-mono font-black text-sm block ${
                                hasCash ? 'text-emerald-700 font-bold' : 'text-slate-400'
                              }`}>
                                {(driver.currentCashInHand || 0).toLocaleString()} د.ع
                              </span>
                              {hasCash && (
                                <button
                                  onClick={() => openSettleModal(driver)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] py-1 px-2.5 rounded-lg shadow-2xs transition flex items-center gap-1 cursor-pointer"
                                >
                                  <Wallet className="w-3 h-3" />
                                  <span>تصفية العهدة 💵</span>
                                </button>
                              )}
                            </div>
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => {
                                  const driverRatings = allRatings.filter(r => r.driverId === driver.id);
                                  setSelectedDriverRatingsModal({ driver, ratings: driverRatings });
                                }}
                                className="bg-amber-100 hover:bg-amber-200 text-amber-900 p-2 rounded-xl border border-amber-300 transition cursor-pointer"
                                title="عرض تقييمات وآراء الزبائن بالسائق ⭐"
                              >
                                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                              </button>

                              <button
                                onClick={() => handleOpenDriverOrders(driver)}
                                className="bg-sky-50 hover:bg-sky-100 text-sky-800 p-2 rounded-xl border border-sky-200 transition cursor-pointer"
                                title="كشف وسجل طلبيات ورحلات السائق"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => openEditModal(driver)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl border border-slate-200 transition cursor-pointer"
                                title="تعديل بيانات السائق"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteDriver(driver.id, driver.name)}
                                className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl border border-red-200 transition cursor-pointer"
                                title="حذف السائق"
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
        </div>
      )}

      {/* TAB 2: VEHICLES FLEET MANAGEMENT */}
      {activeTab === 'vehicles' && (
        <div className="space-y-6">
          {/* Vehicles KPI Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">إجمالي أسطول السيارات والمركبات</span>
                <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
                  {totalVehicles} مركبات
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
                <Car className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">السيارات الجاهزة للعمل</span>
                <span className="text-2xl font-black text-emerald-600 font-mono mt-1 block">
                  {activeVehiclesCount} سيارات جاهزة ✅
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">مرونة التبديل بين السائقين</span>
                <span className="text-xs font-black text-slate-800 mt-1 block leading-relaxed">
                  يمكن اختيار أي سيارة لأي سائق عند تسليم كل طلبية مباشرة 🔄
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
                <Key className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Vehicles List Table */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4">
              <h3 className="font-black text-sm text-slate-900">
                قائمة سيارات ومركبات أسطول التوصيل ({vehicles.length})
              </h3>
              <input
                type="text"
                placeholder="بحث باسم السيارة أو رقم اللوحة أو النوع..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 w-64 font-medium"
              />
            </div>

            {isLoading ? (
              <div className="p-12 text-center text-slate-400 font-bold">جاري تحميل أسطول السيارات...</div>
            ) : filteredVehicles.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <p className="text-slate-500 font-bold">لا توجد سيارات مضافة بعد</p>
                <button
                  onClick={openAddVehicleModal}
                  className="bg-emerald-600 text-white font-black text-xs py-2 px-4 rounded-xl shadow-xs cursor-pointer"
                >
                  + إضافة أول سيارة للأسطول الآن
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-100 font-black text-[11px]">
                    <tr className="divide-x divide-x-reverse divide-slate-100">
                      <th className="py-3 px-4">اسم وموديل السيارة 🚗</th>
                      <th className="py-3 px-4">رقم اللوحة / التسجيل</th>
                      <th className="py-3 px-4">نوع المركبة</th>
                      <th className="py-3 px-4">سنة الموديل</th>
                      <th className="py-3 px-4">حالة الجاهزية</th>
                      <th className="py-3 px-4">طلبيات تم توصيلها</th>
                      <th className="py-3 px-4">ملاحظات</th>
                      <th className="py-3 px-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredVehicles.map((veh) => (
                      <tr key={veh.id} className="hover:bg-slate-50/80 transition divide-x divide-x-reverse divide-slate-100">
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
                              <Car className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 block">{veh.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">ID: #{veh.id}</span>
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-4 whitespace-nowrap font-mono font-bold text-slate-800 bg-amber-50/40">
                          {veh.plateNumber}
                        </td>

                        <td className="py-4 px-4 whitespace-nowrap">
                          <span className="bg-slate-100 text-slate-800 font-bold px-2 py-0.5 rounded-md text-[11px]">
                            {veh.type}
                          </span>
                        </td>

                        <td className="py-4 px-4 whitespace-nowrap font-mono font-bold text-slate-600">
                          {veh.modelYear || '-'}
                        </td>

                        <td className="py-4 px-4 whitespace-nowrap">
                          {veh.isActive !== false ? (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <span>جاهزة للعمل ✅</span>
                            </span>
                          ) : (
                            <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <span>في الصيانة 🔧</span>
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-4 whitespace-nowrap font-mono font-bold text-slate-700">
                          {veh.completedDeliveries || 0} طلبيات
                        </td>

                        <td className="py-4 px-4 max-w-[200px] text-slate-500 truncate" title={veh.notes}>
                          {veh.notes || '-'}
                        </td>

                        <td className="py-4 px-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openEditVehicleModal(veh)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl border border-slate-200 transition cursor-pointer"
                              title="تعديل بيانات المركبة"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteVehicle(veh.id, veh.name)}
                              className="bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-xl border border-red-200 transition cursor-pointer"
                              title="حذف المركبة"
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
        </div>
      )}

      {/* TAB 3: CUSTOMER REVIEWS & DRIVER RATINGS */}
      {activeTab === 'ratings' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">إجمالي تقييمات الزبائن</span>
                <span className="text-2xl font-black text-amber-500 font-mono mt-1 block">
                  {allRatings.length} تقييم
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-xs">
                <Star className="w-6 h-6 fill-amber-500 text-amber-500" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">متوسط تقييم الأسطول العام</span>
                <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
                  {allRatings.length > 0
                    ? (allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length).toFixed(1)
                    : '5.0'} / 5 ⭐
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
                <ThumbsUp className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">نسبة رضا الزبائن</span>
                <span className="text-2xl font-black text-emerald-600 font-mono mt-1 block">
                  {allRatings.length > 0
                    ? Math.round((allRatings.filter(r => r.rating >= 4).length / allRatings.length) * 100)
                    : 100}%
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-xs">
                <Sparkles className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Ratings Table Card */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            {/* Filter & Search Bar */}
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm text-slate-900">
                  سجل آراء وتقييمات الزبائن التفصيلي
                </h3>
                <span className="bg-amber-100 text-amber-900 font-mono font-bold text-xs px-2 py-0.5 rounded-lg">
                  {filteredRatings.length} من {allRatings.length}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                {/* Driver Filter Dropdown */}
                <select
                  value={ratingFilterDriver}
                  onChange={(e) => setRatingFilterDriver(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-slate-800 focus:outline-none focus:border-brand-blue"
                >
                  <option value="all">👥 كافة السائقين ({drivers.length})</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      🛵 {d.name} ({allRatings.filter((r) => r.driverId === d.id).length} تقييم)
                    </option>
                  ))}
                </select>

                {/* Stars Filter Dropdown */}
                <select
                  value={ratingFilterStars}
                  onChange={(e) => setRatingFilterStars(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-slate-800 focus:outline-none focus:border-brand-blue"
                >
                  <option value="all">⭐ كافة النجوم والدرجات</option>
                  <option value="5">⭐⭐⭐⭐⭐ ممتاز (5 نجوم)</option>
                  <option value="4">⭐⭐⭐⭐ جيد جداً (4 نجوم)</option>
                  <option value="low">⚠️ تقييمات منخفضة / شكاوى (1-3 نجوم)</option>
                </select>

                {/* Filter Has Comments Only */}
                <button
                  type="button"
                  onClick={() => setRatingFilterCommentsOnly(!ratingFilterCommentsOnly)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                    ratingFilterCommentsOnly
                      ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>التعليقات والملاحظات المكتوبة فقط 💬</span>
                </button>
              </div>
            </div>

            {filteredRatings.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto text-xl">⭐</div>
                <h4 className="font-black text-slate-800 text-sm">لا توجد تقييمات مطابقة للفلاتر المحددة</h4>
                <p className="text-xs text-slate-500">جرب تغيير السائق المختار أو خيارات النجوم لإظهار التقييمات.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-100 font-black text-[11px]">
                    <tr className="divide-x divide-x-reverse divide-slate-100">
                      <th className="py-3 px-4">السائق المقيّم</th>
                      <th className="py-3 px-4">الزبون والطلبية</th>
                      <th className="py-3 px-4">التقييم والدرجة</th>
                      <th className="py-3 px-4">الوسم المختار</th>
                      <th className="py-3 px-4">ملاحظة ورأي الزبون</th>
                      <th className="py-3 px-4">تاريخ التقييم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRatings.map((rate) => (
                      <tr key={rate.id} className="hover:bg-slate-50/80 transition divide-x divide-x-reverse divide-slate-100">
                        <td className="py-4 px-4 whitespace-nowrap font-bold text-slate-900">
                          <span className="bg-amber-50 border border-amber-200 px-2 py-1 rounded-xl text-amber-950">
                            🛵 {rate.driverName || 'مندوب التوصيل'}
                          </span>
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span className="font-bold text-slate-800 block">{rate.customerName}</span>
                          <span className="text-[10px] text-slate-400 font-mono block">فاتورة #{rate.orderNumber} • {rate.customerPhone}</span>
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-amber-500 font-black flex items-center gap-0.5">
                              {'⭐'.repeat(rate.rating)}
                            </span>
                            <span className="font-black text-slate-700">({rate.ratingLabel || `${rate.rating}/5`})</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap">
                          {rate.tag ? (
                            <span className="bg-slate-100 text-slate-800 text-[11px] font-bold px-2 py-0.5 rounded-lg border border-slate-200">
                              {rate.tag}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-4 px-4 max-w-xs">
                          {rate.comment ? (
                            <p className="text-xs text-slate-800 font-medium bg-amber-50/60 p-2 rounded-xl border border-amber-100">
                              "{rate.comment}"
                            </p>
                          ) : (
                            <span className="text-slate-400 font-medium">بدون تعليق نصي</span>
                          )}
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500">
                          {new Date(rate.createdAt).toLocaleDateString('ar-IQ')} {new Date(rate.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: INDIVIDUAL DRIVER RATINGS POPUP */}
      {selectedDriverRatingsModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black">
                  <Star className="w-5 h-5 fill-white" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    تقييمات وآراء الزبائن بالسائق: {selectedDriverRatingsModal.driver.name}
                  </h3>
                  <span className="text-[11px] text-slate-500 font-bold">
                    المعدل: ⭐ {selectedDriverRatingsModal.driver.averageRating || '5.0'} ({selectedDriverRatingsModal.driver.ratingTierLabel || 'ممتاز 🌟'})
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedDriverRatingsModal(null)} className="text-slate-400 hover:text-slate-700 p-1 font-bold">
                ✕
              </button>
            </div>

            {selectedDriverRatingsModal.ratings.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs font-bold text-slate-500">لا توجد تقييمات مسجلة لهذا السائق بعد</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {selectedDriverRatingsModal.ratings.map((rate) => (
                  <div key={rate.id} className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-slate-900">{rate.customerName} ({rate.customerPhone})</span>
                      <div className="flex items-center gap-1">
                        <span className="text-amber-500 font-bold">{'⭐'.repeat(rate.rating)}</span>
                        <span className="text-[10px] font-black text-slate-600">({rate.ratingLabel})</span>
                      </div>
                    </div>
                    {rate.tag && (
                      <span className="inline-block bg-white text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-slate-200">
                        {rate.tag}
                      </span>
                    )}
                    {rate.comment && (
                      <p className="text-xs text-slate-800 bg-white p-2.5 rounded-xl border border-slate-200">
                        "{rate.comment}"
                      </p>
                    )}
                    <span className="text-[10px] text-slate-400 font-mono block text-left">
                      {new Date(rate.createdAt).toLocaleDateString('ar-IQ')} {new Date(rate.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setSelectedDriverRatingsModal(null)}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs py-2.5 rounded-xl transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD / EDIT DRIVER */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-base text-slate-900">
                {editingDriver ? 'تعديل بيانات السائق ✏️' : 'إضافة سائق / مندوب توصيل جديد 🚚'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDriver} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-black text-slate-800">اسم السائق الثلاثي *:</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: حيدر الكرخي"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-brand-blue"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-black text-slate-800">رقم الهاتف (للدخول) *:</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07701234567"
                    dir="ltr"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-brand-blue"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-black text-slate-800">كلمة المرور:</label>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="123"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-brand-blue"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-black text-slate-800">السيارة الافتراضية المخصصة له (اختياري):</label>
                <select
                  value={defaultVehicleId}
                  onChange={(e) => setDefaultVehicleId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-brand-blue cursor-pointer"
                >
                  <option value="">بدون سيارة افتراضية (يتم تحديدها عند إسناد الطلبية)</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      🚗 {v.name} ({v.plateNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-black text-slate-800">ملاحظات / المنطقة المغطاة:</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: خط أحياء مركز كربلاء والهندية"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-brand-blue"
                />
              </div>

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
                  disabled={isSaving}
                  className="bg-brand-blue hover:bg-brand-blueDark text-white font-black py-2.5 px-6 rounded-xl shadow-md transition cursor-pointer"
                >
                  {isSaving ? 'جاري الحفظ...' : editingDriver ? 'حفظ التعديلات' : 'إضافة السائق ⚡'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT VEHICLE */}
      {isVehicleModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                <Car className="w-5 h-5 text-emerald-600" />
                <span>{editingVehicle ? 'تعديل بيانات المركبة 🚗' : 'إضافة سيارة / مركبة جديدة للأسطول 🚗'}</span>
              </h3>
              <button onClick={() => setIsVehicleModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveVehicle} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-black text-slate-800">اسم ووصف المركبة *:</label>
                <input
                  type="text"
                  required
                  value={vehName}
                  onChange={(e) => setVehName(e.target.value)}
                  placeholder="مثال: كيا حمل كورية (أبيض)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-black text-slate-800">رقم اللوحة / التسجيل *:</label>
                  <input
                    type="text"
                    required
                    value={vehPlate}
                    onChange={(e) => setVehPlate(e.target.value)}
                    placeholder="مثال: 45211 كربلاء - حمل"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-black text-slate-800">نوع المركبة:</label>
                  <select
                    value={vehType}
                    onChange={(e) => setVehType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-emerald-600 cursor-pointer"
                  >
                    <option value="كيا حمل">كيا حمل 🚚</option>
                    <option value="بيك آب">بيك آب 🛻</option>
                    <option value="ستوتة">ستوتة مغلقة 🛵</option>
                    <option value="دراجة شحن/نارية">دراجة شحن بوكس سريع 🏍️</option>
                    <option value="فانيت">فانيت مغلق 🚐</option>
                    <option value="أخرى">أخرى 🚗</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-black text-slate-800">سنة الصنع / الموديل:</label>
                  <input
                    type="text"
                    value={vehYear}
                    onChange={(e) => setVehYear(e.target.value)}
                    placeholder="مثال: 2023"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-black text-slate-800">حالة المركبة:</label>
                  <select
                    value={vehIsActive ? 'active' : 'inactive'}
                    onChange={(e) => setVehIsActive(e.target.value === 'active')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-emerald-600 cursor-pointer"
                  >
                    <option value="active">جاهزة للعمل ✅</option>
                    <option value="inactive">في الصيانة / متوقفة 🔧</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-black text-slate-800">ملاحظات عن المركبة:</label>
                <input
                  type="text"
                  value={vehNotes}
                  onChange={(e) => setVehNotes(e.target.value)}
                  placeholder="مثال: مخصصة لطلبات الجملة الكبيرة"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsVehicleModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-5 rounded-xl transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingVehicle}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-6 rounded-xl shadow-md transition cursor-pointer"
                >
                  {isSavingVehicle ? 'جاري الحفظ...' : editingVehicle ? 'حفظ التعديلات' : 'إضافة المركبة 🚗'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: SETTLEMENT MODAL WITH BREAKDOWN OF CUSTOMERS & MERCHANTS */}
      {settleModalDriver && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-fadeIn max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-600" />
                <span>تصفية واستلام العهدة النقدية 💵</span>
              </h3>
              <button onClick={() => setSettleModalDriver(null)} className="text-slate-400 hover:text-slate-700 p-1 font-bold">
                ✕
              </button>
            </div>

            {/* Driver Summary */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">اسم السائق:</span>
                <span className="font-black text-slate-900">{settleModalDriver.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">رقم الهاتف:</span>
                <span className="font-mono font-bold text-slate-800" dir="ltr">{settleModalDriver.phone}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                <span className="text-slate-700 font-black">إجمالي المسجل بعهدة السائق:</span>
                <span className="font-mono font-black text-sm text-emerald-700">
                  {(settleModalDriver.currentCashInHand || 0).toLocaleString()} د.ع
                </span>
              </div>
            </div>

            {/* Customer & Merchant Sources Breakdown */}
            <div className="bg-sky-50/50 border border-sky-200/80 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-900 font-black text-xs">
                  <FileText className="w-4 h-4 text-brand-blue" />
                  <span>مصادر المبالغ المحصلة والزبائن ({settleDriverOrders.length} فواتير):</span>
                </div>
                {settleDriverOrders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowSettleOrdersBreakdown(!showSettleOrdersBreakdown)}
                    className="text-[11px] font-bold text-brand-blue hover:text-brand-blueDark underline cursor-pointer"
                  >
                    {showSettleOrdersBreakdown ? 'طي القائمة' : 'عرض القائمة'}
                  </button>
                )}
              </div>

              {isLoadingSettleOrders ? (
                <div className="py-4 text-center text-slate-500 font-bold text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 text-brand-blue animate-spin" />
                  <span>جاري استدعاء الفواتير والزبائن...</span>
                </div>
              ) : settleDriverOrders.length === 0 ? (
                <div className="p-3 text-center text-[11px] text-slate-500 font-medium bg-white rounded-xl border border-slate-200/70">
                  لا توجد فواتير معلقة حالياً مسجلة بعهدة هذا السائق.
                </div>
              ) : showSettleOrdersBreakdown && (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {settleDriverOrders.map((ord) => {
                    const isMerchant =
                      (ord.customer?.businessName && ord.customer.businessName.includes('جملة')) ||
                      ord.items?.some((i) => i.saleType === 'wholesale');
                    const isMarket = !isMerchant && Boolean(ord.customer?.businessName);
                    const collectedVal = ord.collectedAmount !== undefined ? ord.collectedAmount : ord.total;

                    return (
                      <div
                        key={ord.id}
                        className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-2 hover:border-emerald-400 transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-lg shrink-0">
                            {isMerchant ? '👑' : isMarket ? '🏪' : '👤'}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <strong className="text-xs font-black text-slate-900 truncate">
                                {ord.customer?.businessName || ord.customer?.name}
                              </strong>
                              <span className="text-[10px] text-slate-600 font-mono font-black bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                                #{ord.orderNumber}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium flex-wrap mt-0.5">
                              <span>الزبون: {ord.customer?.name}</span>
                              {ord.customer?.phone && (
                                <span className="font-mono" dir="ltr">({ord.customer.phone})</span>
                              )}
                              {ord.customer?.city && <span>• {ord.customer.city}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="text-left shrink-0">
                          <span className="font-mono font-black text-xs text-emerald-700 block">
                            {collectedVal.toLocaleString()} د.ع
                          </span>
                          <span className={`text-[9px] font-bold block ${
                            ord.collectionStatus === 'partial' ? 'text-amber-600' : 'text-emerald-600'
                          }`}>
                            {ord.collectionStatus === 'partial' ? 'دفعة كاش جزئية' : 'كاش كامل'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <form onSubmit={handleConfirmSettlement} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-black text-slate-900 block">
                  المبلغ الفعلي المستلم نقداً وتوريده للصندوق (د.ع) *:
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-white border-2 border-emerald-500 rounded-2xl py-3 px-4 text-base font-mono font-black text-slate-900 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-200 transition"
                />
                <p className="text-[11px] text-slate-500 font-bold">
                  💡 يمكنك تعديل المبلغ هنا في حال وجود خطأ أو اختلاف في كتابة السائق للمبلغ.
                </p>
              </div>

              <div className="space-y-1">
                <label className="font-black text-slate-800">ملاحظات التصفية (اختياري):</label>
                <input
                  type="text"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder="مثال: تم استلام الكاش بالكامل وتسليمه للخزينة..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-medium focus:bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="bg-emerald-50/80 border border-emerald-200 p-3 rounded-2xl text-[11px] text-emerald-900 font-medium">
                ✅ بمجرد التأكيد، سيتم إنشاء سند قبض رسمي برقم فريد وتنزيله كـ (دائن) في كشف حساب الزبون/التاجر لتصفية ديونه فوراً.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSettleModalDriver(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-5 rounded-xl transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSettling}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-6 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Wallet className="w-4 h-4" />
                  <span>{isSettling ? 'جاري التصفية والتوليد...' : 'تأكيد تصفية واستلام العهدة 💵'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRIVER ORDERS HISTORY & REPORT MODAL */}
      {driverOrdersModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 text-xs">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black shadow-xs">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>كشف وسجل طلبيات السائق: {driverOrdersModal.driver.name}</span>
                    <span className="text-xs text-slate-500 font-mono" dir="ltr">({driverOrdersModal.driver.phone})</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                    سجل كامل بجميع الطلبيات المسندة والمسلمة والمبالغ المحصلة والسيارات المستخدمة
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-brand-blue hover:bg-brand-blueDark text-white font-bold py-1.5 px-3.5 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الكشف 🖨️</span>
                </button>
                <button
                  onClick={() => setDriverOrdersModal(null)}
                  className="p-2 rounded-full hover:bg-slate-200 text-slate-500 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              
              {/* Summary Stats Cards */}
              {driverOrdersModal.stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 space-y-0.5">
                    <span className="text-[10px] font-bold text-amber-800">إجمالي المسلّم</span>
                    <div className="text-xl font-black font-mono text-amber-950">
                      {driverOrdersModal.stats.totalDelivered} <span className="text-xs font-sans">طلبية</span>
                    </div>
                  </div>

                  <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 space-y-0.5">
                    <span className="text-[10px] font-bold text-emerald-800">إجمالي الكاش المحصل</span>
                    <div className="text-xl font-black font-mono text-emerald-950">
                      {(driverOrdersModal.stats.totalCashCollected || 0).toLocaleString()} <span className="text-xs font-sans">د.ع</span>
                    </div>
                  </div>

                  <div className="bg-sky-50 p-3.5 rounded-2xl border border-sky-200 space-y-0.5">
                    <span className="text-[10px] font-bold text-sky-800">ديون آجلة مسجلة</span>
                    <div className="text-xl font-black font-mono text-sky-950">
                      {(driverOrdersModal.stats.totalDebtRecorded || 0).toLocaleString()} <span className="text-xs font-sans">د.ع</span>
                    </div>
                  </div>

                  <div className="bg-purple-50 p-3.5 rounded-2xl border border-purple-200 space-y-0.5">
                    <span className="text-[10px] font-bold text-purple-800">العهدة الحالية بيده</span>
                    <div className="text-xl font-black font-mono text-purple-950">
                      {(driverOrdersModal.stats.currentCashInHand || 0).toLocaleString()} <span className="text-xs font-sans">د.ع</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Orders Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-black text-[11px] border-b border-slate-200">
                    <tr className="divide-x divide-x-reverse divide-slate-200">
                      <th className="py-3 px-3">رقم الطلب / الفاتورة</th>
                      <th className="py-3 px-3">التاريخ والوقت</th>
                      <th className="py-3 px-3">الزبون / المحل والعنوان</th>
                      <th className="py-3 px-3">المركبة 🚗</th>
                      <th className="py-3 px-3 text-left">قيمة الطلب</th>
                      <th className="py-3 px-3 text-center">حالة التحصيل والتسليم</th>
                      <th className="py-3 px-3 text-center">سند التصفية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {isLoadingDriverOrders ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                          جاري تحميل سجل طلبيات السائق...
                        </td>
                      </tr>
                    ) : driverOrdersModal.orders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                          لا توجد طلبيات مسندة لهذا السائق حتى الآن
                        </td>
                      </tr>
                    ) : (
                      driverOrdersModal.orders.map((ord) => {
                        const vehicleDisplay = (ord.vehicleId ? vehicles.find(v => v.id === ord.vehicleId)?.name : null) || ord.vehicleName;

                        return (
                          <tr key={ord.id} className="hover:bg-slate-50/80 transition divide-x divide-x-reverse divide-slate-100">
                            <td className="py-3 px-3 whitespace-nowrap font-mono font-black text-slate-900">
                              #{ord.orderNumber}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-slate-600 font-mono text-[11px] text-center">
                              <div className="flex flex-col items-center leading-tight">
                                <span className="font-bold text-slate-800">
                                  {new Date(ord.createdAt).toLocaleDateString('ar-IQ')}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">
                                  {new Date(ord.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-bold text-slate-900">{ord.customer.name}</div>
                              {ord.customer.businessName && (
                                <div className="text-[10px] text-brand-blue font-bold">🏪 {ord.customer.businessName}</div>
                              )}
                              <div className="text-[10px] text-slate-500">{ord.customer.city} - {ord.customer.address}</div>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              {vehicleDisplay ? (
                                <span className="bg-emerald-50 text-emerald-900 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-lg block">
                                  🚗 {vehicleDisplay}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">غير محددة</span>
                              )}
                            </td>
                          <td className="py-3 px-3 text-left font-mono font-black text-slate-900 whitespace-nowrap">
                            {ord.total.toLocaleString()} د.ع
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {ord.collectionStatus === 'collected_cash' ? (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-md">
                                💵 كاش ({ord.total.toLocaleString()} د.ع)
                              </span>
                            ) : ord.collectionStatus === 'debt_unpaid' ? (
                              <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-md">
                                📝 دين آجل ({ord.total.toLocaleString()} د.ع)
                              </span>
                            ) : ord.collectionStatus === 'partial' ? (
                              <span className="bg-sky-100 text-sky-900 text-[10px] font-black px-2 py-0.5 rounded-md">
                                💳 جزئي (دفع {ord.collectedAmount?.toLocaleString()})
                              </span>
                            ) : ord.collectionStatus === 'returned' ? (
                              <span className="bg-red-100 text-red-800 text-[10px] font-black px-2 py-0.5 rounded-md">
                                ❌ راجع / ملغي
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                ⏳ قيد التوصيل
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {ord.paymentReceiptNumber ? (
                              <span className="font-mono font-bold text-emerald-700 text-[11px]">
                                #{ord.paymentReceiptNumber}
                              </span>
                            ) : ord.driverCashSettled ? (
                              <span className="text-emerald-600 text-[10px] font-bold">تمت التصفية ✅</span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">قيد الانتظار</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                    )}
                  </tbody>
                </table>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
              <button
                onClick={() => setDriverOrdersModal(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2 px-5 rounded-xl transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

      {/* FLOATING TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-fadeIn">
          <div className={`px-5 py-3.5 rounded-2xl shadow-2xl border flex items-center gap-3 text-xs font-black max-w-md ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-900/30'
              : 'bg-red-600 text-white border-red-500 shadow-red-900/30'
          }`}>
            <span className="text-base">{toastMessage.type === 'success' ? '✓' : '✕'}</span>
            <span className="flex-1">{toastMessage.text}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-white/80 hover:text-white mr-2 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
