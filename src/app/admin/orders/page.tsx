'use client';

import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Search,
  Filter,
  MessageCircle,
  Eye,
  Check,
  X,
  Truck,
  Clock,
  RefreshCw,
  Bell,
  AlertCircle,
  Plus,
  Edit,
  Trash2,
  PhoneCall,
  Phone,
  Copy,
  User,
  Package,
  CheckCircle2,
  DollarSign,
  MapPin,
  Car,
  Printer,
  FileText
} from 'lucide-react';
import { Order, OrderItem, OrderStatus, Product, User as UserType, Driver, Vehicle } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';
import EtihadLogo from '@/components/EtihadLogo';

export default function AdminOrdersPage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [merchants, setMerchants] = useState<UserType[]>([]);
  const [customerAccounts, setCustomerAccounts] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // MANUAL ORDER MODAL (POS / Phone orders)
  const [isManualOrderModalOpen, setIsManualOrderModalOpen] = useState(false);
  const [manualCustomerType, setManualCustomerType] = useState<'registered' | 'guest'>('guest');
  const [manualSelectedMerchantId, setManualSelectedMerchantId] = useState('');
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [manualCustomerPhone, setManualCustomerPhone] = useState('');
  const [manualBusinessName, setManualBusinessName] = useState('');
  const [manualCity, setManualCity] = useState('كربلاء المقدسة');
  const [manualAddress, setManualAddress] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualSaleType, setManualSaleType] = useState<'wholesale' | 'retail'>('wholesale');
  const [manualItems, setManualItems] = useState<OrderItem[]>([]);
  const [manualDeliveryFee, setManualDeliveryFee] = useState<number>(0);
  const [manualDiscount, setManualDiscount] = useState<number>(0);
  const [manualPaymentMethod, setManualPaymentMethod] = useState<'cod' | 'cash' | 'zaincash' | 'debt'>('debt');
  const [isSubmittingManualOrder, setIsSubmittingManualOrder] = useState(false);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState('');
  const [autoPrintOnSave, setAutoPrintOnSave] = useState(false);
  const [autoPrintWithoutPrices, setAutoPrintWithoutPrices] = useState(false);

  // PRINT INVOICE MODAL (A4 Clean Invoice / Delivery Manifest)
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [printWithoutPrices, setPrintWithoutPrices] = useState<boolean>(false);

  // EDIT ORDER / RETURN ITEMS MODAL
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [editDeliveryFee, setEditDeliveryFee] = useState<number>(0);
  const [editDiscount, setEditDiscount] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editProductToAdd, setEditProductToAdd] = useState('');

  const fetchOrders = (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    fetch('/api/orders', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setOrders(data.orders || []);
        }
        if (!isSilent) setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        if (!isSilent) setIsLoading(false);
      });
  };

  const fetchProductsAndMerchants = () => {
    fetch('/api/products', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.products) setProducts(data.products);
      })
      .catch(console.error);

    fetch('/api/admin/merchants', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.merchants) setMerchants(data.merchants);
      })
      .catch(console.error);

    fetch('/api/admin/drivers', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.drivers) setDrivers(data.drivers);
      })
      .catch(console.error);

    fetch('/api/admin/vehicles', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.vehicles) setVehicles(data.vehicles);
      })
      .catch(console.error);

    fetch('/api/accounting/accounts', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.accounts) setCustomerAccounts(data.accounts);
      })
      .catch(console.error);
  };

  // 💰 Helper to get previous outstanding balance / pending orders for customer
  const getCustomerPreviousBalance = (phone: string, name: string, merchantId?: string, excludeOrderId?: string) => {
    // 1. Search in accounts ledger first
    if (customerAccounts.length > 0) {
      const cleanPhone = (phone || '').replace(/\D/g, '');
      const acc = customerAccounts.find((a: any) => {
        const aPhone = (a.customerPhone || '').replace(/\D/g, '');
        return (
          (cleanPhone && aPhone && (aPhone.endsWith(cleanPhone) || cleanPhone.endsWith(aPhone))) ||
          (merchantId && a.customerId === merchantId) ||
          (name && a.customerName && a.customerName.trim().toLowerCase() === name.trim().toLowerCase())
        );
      });
      if (acc && typeof acc.remainingBalance === 'number') {
        return Math.max(0, acc.remainingBalance);
      }
    }

    // 2. Fallback: calculate sum of non-delivered or unpaid/debt orders
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const prevOrders = orders.filter((o) => {
      if (excludeOrderId && o.id === excludeOrderId) return false;
      const oPhone = (o.customer.phone || '').replace(/\D/g, '');
      const matchPhone = cleanPhone && oPhone && (oPhone.endsWith(cleanPhone) || cleanPhone.endsWith(oPhone));
      const matchName = name && o.customer.name && o.customer.name.trim().toLowerCase() === name.trim().toLowerCase();
      const isUnpaidOrDebt = o.paymentMethod === 'debt' || (o.status !== 'delivered' && o.status !== 'cancelled');
      return (matchPhone || matchName) && isUnpaidOrDebt;
    });

    return prevOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  };

  useEffect(() => {
    fetchOrders(false);
    fetchProductsAndMerchants();

    // Smart background polling: only when page is active/visible
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!isManualOrderModalOpen && !editingOrder) {
        fetchOrders(true);
      }
    }, 12000);

    const handleFocus = () => {
      if (!isManualOrderModalOpen && !editingOrder) {
        fetchOrders(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isManualOrderModalOpen, editingOrder]);

  const handleAssignDriver = async (orderId: string, driverId: string) => {
    try {
      // Find driver default vehicle if available
      const driver = drivers.find(d => d.id === driverId);
      const defaultVehId = driver?.defaultVehicleId;

      const payload: { driverId: string; vehicleId?: string } = { driverId };
      if (defaultVehId) {
        payload.vehicleId = defaultVehId;
      }

      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success && data.order) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder(data.order);
        }
        if (statusFilter === 'pending' && driverId && driverId !== 'none') {
          setStatusFilter('all');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAssignVehicle = async (orderId: string, vehicleId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId }),
      });
      const data = await res.json();
      if (data.success && data.order) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder(data.order);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success && data.order) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder(data.order);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setUpdatingId(null);
  };

  // Open Edit Order Modal
  const handleOpenEditOrder = (order: Order) => {
    setEditingOrder(order);
    setEditItems(order.items.map((i) => ({ ...i })));
    setEditDeliveryFee(order.deliveryFee || 0);
    setEditDiscount(order.discount || 0);
    setEditNotes(order.customer.notes || '');
    setEditProductToAdd('');
  };

  // Add Item to Edit Order (Auto add on select)
  const handleSelectProductForEdit = (prod: Product) => {
    if (!prod) return;

    const isWholesale = editingOrder?.items[0]?.saleType === 'wholesale';
    const price = isWholesale ? prod.wholesalePrice : prod.price;
    const unitLabel = isWholesale ? prod.wholesaleUnit : prod.retailUnit;

    const existingIdx = editItems.findIndex((it) => it.productId === prod.id);
    if (existingIdx > -1) {
      const updated = [...editItems];
      updated[existingIdx].quantity += 1;
      setEditItems(updated);
    } else {
      setEditItems([
        ...editItems,
        {
          productId: prod.id,
          name: prod.name,
          price,
          quantity: 1,
          saleType: isWholesale ? 'wholesale' : 'retail',
          unitLabel,
          image: prod.images?.[0] || '',
        },
      ]);
    }
  };

  // Save Order Edit & Return Stock
  const handleSaveOrderEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder || editItems.length === 0) {
      toast.error('يجب أن تحتوي الفاتورة على صنف واحد على الأقل');
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const res = await fetch(`/api/orders/${editingOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: editItems,
          deliveryFee: editDeliveryFee,
          discount: editDiscount,
          notes: editNotes,
          customer: {
            ...editingOrder.customer,
            notes: editNotes,
          },
        }),
      });

      const data = await res.json();
      if (data.success && data.order) {
        toast.success('تم تعديل الفاتورة وإرجاع/تحديث المخزون وحساب العميل بنجاح! 🎉');
        fetchOrders();
        fetchProductsAndMerchants();
        setEditingOrder(null);
        if (selectedOrder && selectedOrder.id === editingOrder.id) {
          setSelectedOrder(data.order);
        }
      } else {
        toast.error(data.error || 'حدث خطأ أثناء تعديل الفاتورة');
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ في الاتصال بالخادم');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const [isDeletingOrder, setIsDeletingOrder] = useState(false);

  const handleDeleteOrder = async (orderIdToDelete: string, orderNumberToDelete: string) => {
    const isConfirmed = await confirm({
      title: `حذف الفاتورة #${orderNumberToDelete} نهائياً؟`,
      message: 'هل أنت متأكد من رغبتك بحذف هذه الفاتورة؟ سيتم إرجاع كافة المواد والكميات إلى المخزون تلقائياً، وإلغاء مبالغها من كشف الحساب.',
      confirmText: 'نعم، احذف الفاتورة واسترجع المخزون 🗑️',
      cancelText: 'تراجع',
      type: 'danger',
    });

    if (!isConfirmed) return;

    setIsDeletingOrder(true);
    try {
      const res = await fetch(`/api/orders/${orderIdToDelete}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'تم حذف الفاتورة واسترجاع المخزون بنجاح 🗑️✓');
        fetchOrders();
        fetchProductsAndMerchants();
        setEditingOrder(null);
        if (selectedOrder && selectedOrder.id === orderIdToDelete) {
          setSelectedOrder(null);
        }
      } else {
        toast.error(data.error || 'تعذر حذف الفاتورة');
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ في الاتصال بالخادم أثناء حذف الفاتورة');
    } finally {
      setIsDeletingOrder(false);
    }
  };

  // Open Manual Order Modal
  const handleOpenManualOrderModal = () => {
    setManualCustomerType('guest');
    setManualSelectedMerchantId('');
    setManualCustomerName('');
    setManualCustomerPhone('');
    setManualBusinessName('');
    setManualCity('كربلاء المقدسة');
    setManualAddress('');
    setManualNotes('');
    setManualSaleType('wholesale');
    setManualItems([]);
    setManualDeliveryFee(0);
    setManualDiscount(0);
    setManualPaymentMethod('debt');
    setSelectedProductToAdd('');
    setIsManualOrderModalOpen(true);
  };

  // Select Merchant in Manual Order
  const handleMerchantSelect = (merchantId: string) => {
    setManualSelectedMerchantId(merchantId);
    const m = merchants.find((u) => u.id === merchantId);
    if (m) {
      setManualCustomerName(m.name);
      setManualCustomerPhone(m.phone || '');
      setManualBusinessName(m.businessName || '');
      setManualCity(m.city || 'كربلاء المقدسة');
      setManualAddress(m.address || '');

      // 🧠 تلقائياً: إذا كان تاجر أو ماركت يعتمد أسعار الجملة، وإذا زبون مفرد يعتمد أسعار المفرد
      const isMerchant = m.accountType === 'merchant' || m.accountType === 'wholesale' || m.accountType === 'market' || !!m.businessName || m.merchantStatus === 'approved';
      setManualSaleType(isMerchant ? 'wholesale' : 'retail');
    }
  };

  // Add Item to Manual Order
  const handleAddItemToManual = () => {
    if (!selectedProductToAdd) return;
    const prod = products.find((p) => p.id === selectedProductToAdd);
    if (!prod) return;

    const selectedMerchant = merchants.find((u) => u.id === manualSelectedMerchantId);
    const tier = selectedMerchant?.merchantTier || 'bronze';

    let price = prod.price;
    if (manualSaleType === 'wholesale') {
      if (tier === 'gold') {
        price = prod.vipPrice || prod.specialPrice || prod.wholesalePrice;
      } else if (tier === 'silver') {
        price = prod.specialPrice || prod.wholesalePrice;
      } else {
        price = prod.wholesalePrice;
      }
    }
    const unitLabel = manualSaleType === 'wholesale' ? prod.wholesaleUnit : prod.retailUnit;

    const existingIdx = manualItems.findIndex((it) => it.productId === prod.id);
    if (existingIdx > -1) {
      const updated = [...manualItems];
      updated[existingIdx].quantity += 1;
      setManualItems(updated);
    } else {
      setManualItems([
        ...manualItems,
        {
          productId: prod.id,
          name: prod.name,
          price,
          quantity: 1,
          saleType: manualSaleType,
          unitLabel,
          image: prod.images?.[0] || '',
        },
      ]);
    }
    setSelectedProductToAdd('');
  };

  // Submit Manual Order (POS / Phone)
  const handleSubmitManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCustomerName.trim() || !manualCustomerPhone.trim()) {
      toast.error('يرجى إدخال اسم الزبون ورقم الهاتف');
      return;
    }
    if (manualItems.length === 0) {
      toast.error('يرجى إضافة صنف واحد على الأقل للطلبية');
      return;
    }

    const subtotal = manualItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const total = Math.max(0, subtotal + manualDeliveryFee - manualDiscount);

    setIsSubmittingManualOrder(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            name: manualCustomerName.trim(),
            phone: manualCustomerPhone.trim(),
            businessName: manualBusinessName.trim(),
            city: manualCity.trim(),
            address: manualAddress.trim(),
            notes: manualNotes.trim(),
            isGuest: manualCustomerType === 'guest',
            userId: manualCustomerType === 'registered' ? manualSelectedMerchantId : undefined,
          },
          items: manualItems,
          subtotal,
          deliveryFee: manualDeliveryFee,
          discount: manualDiscount,
          total,
          paymentMethod: manualPaymentMethod,
          status: 'processing', // Auto marked as processing
        }),
      });

      const data = await res.json();
      if (data.success && data.order) {
        toast.success('تم إنشاء الفاتورة والطلبية وخصم المخزون بنجاح! 🎉');
        fetchOrders();
        fetchProductsAndMerchants();
        setIsManualOrderModalOpen(false);

        // 🖨️ فتح نافذة الطباعة فوراً إذا كان الخيار مؤشراً
        if (autoPrintOnSave) {
          setPrintOrder(data.order);
          setPrintWithoutPrices(autoPrintWithoutPrices);
          setTimeout(() => {
            window.print();
          }, 400);
        }
      } else {
        toast.error(data.error || 'تعذر إنشاء الفاتورة');
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ في الاتصال بالخادم');
    } finally {
      setIsSubmittingManualOrder(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchQuery =
      !searchQuery.trim() ||
      o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.customer.businessName && o.customer.businessName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      o.customer.phone.includes(searchQuery);
    return matchStatus && matchQuery;
  });

  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  const statusOptions: { value: OrderStatus; label: string; color: string }[] = [
    { value: 'pending', label: 'قيد المراجعة', color: 'bg-amber-50 text-amber-800 border-amber-200' },
    { value: 'processing', label: 'قيد التجهيز', color: 'bg-sky-50 text-brand-blue border-sky-200' },
    { value: 'shipped', label: 'خرج المندوب', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { value: 'delivered', label: 'تم التوصيل', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { value: 'cancelled', label: 'ملغي', color: 'bg-red-50 text-red-700 border-red-200' },
  ];

  return (
    <>
      <div className={`space-y-6 text-xs ${printOrder ? 'no-print print:hidden' : ''}`}>

      {/* Top Action & Alert Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-brand-blue" />
            <span>إدارة وتجهيز الطلبيات والمبيعات</span>
          </h2>
          <p className="text-slate-500 font-bold text-xs mt-0.5">
            إجمالي الطلبيات المسجلة: {orders.length} طلبية
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleOpenManualOrderModal}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2.5 px-4 rounded-2xl shadow-sm transition flex items-center gap-2"
          >
            <PhoneCall className="w-4 h-4" />
            <span>+ إنشاء طلبية / فاتورة يدوية (طلب هاتفي) 📞</span>
          </button>

          <button
            onClick={() => fetchOrders(false)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2.5 px-3 rounded-2xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* Top Pending Orders Alert Notification */}
      {pendingCount > 0 && (
        <div className="bg-red-50 border-2 border-red-200 p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-fadeIn">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-xs shrink-0 animate-bounce">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm">
                تنبيه: يوجد {pendingCount} طلبيات جديدة بانتظار المعالجة والتجهيز! 🔔
              </h3>
              <p className="text-xs text-slate-600 font-bold mt-0.5">
                يرجى مراجعة تفاصيل الفواتير وتجهيز المنتجات أو تحويلها للمندوب
              </p>
            </div>
          </div>
          <button
            onClick={() => setStatusFilter('pending')}
            className="bg-red-600 hover:bg-red-700 text-white font-black text-xs py-2.5 px-4 rounded-xl shrink-0 shadow-xs transition"
          >
            عرض الطلبيات الجديدة ({pendingCount}) ⚡
          </button>
        </div>
      )}

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="بحث برقم الطلب، اسم الزبون، المحل، أو الهاتف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-10 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:border-brand-blue"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              statusFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            الكل ({orders.length})
          </button>
          {statusOptions.map((opt) => {
            const count = orders.filter((o) => o.status === opt.value).length;
            const isPendingAndHasOrders = opt.value === 'pending' && count > 0;
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                  statusFilter === opt.value
                    ? 'bg-brand-blue text-white shadow-xs'
                    : isPendingAndHasOrders
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>{opt.label}</span>
                <span className="font-mono bg-black/10 px-1.5 py-0.5 rounded-full text-[10px]">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 font-bold">جاري تحميل الطلبات...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-500 font-bold space-y-3">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto text-xl">
              📦
            </div>
            <p>لا توجد طلبات تطابق هذا القسم أو البحث حالياً</p>
            {statusFilter !== 'all' && (
              <button
                onClick={() => setStatusFilter('all')}
                className="bg-brand-blue hover:bg-brand-blueDark text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-xs cursor-pointer"
              >
                عرض كل الطلبات ({orders.length}) 📋
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-100 font-black text-[11px]">
                <tr className="divide-x divide-x-reverse divide-slate-200">
                  <th className="py-2.5 px-3">رقم الطلب والتاريخ</th>
                  <th className="py-2.5 px-3">الزبون / المحل</th>
                  <th className="py-2.5 px-3">الأصناف المطلوبة</th>
                  <th className="py-2.5 px-3">الإجمالي</th>
                  <th className="py-2.5 px-2.5">السائق 👨‍✈️</th>
                  <th className="py-2.5 px-2.5">سيارة التوصيل 🚗</th>
                  <th className="py-2.5 px-2.5">حالة الطلبية</th>
                  <th className="py-2.5 px-2.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order) => {
                  const currentStatus = statusOptions.find((s) => s.value === order.status) || statusOptions[0];
                  let customerPhoneClean = order.customer.phone.replace(/\D/g, '');
                  if (customerPhoneClean.startsWith('07')) customerPhoneClean = '964' + customerPhoneClean.substring(1);
                  
                  const customerWhatsApp = `https://api.whatsapp.com/send?phone=${customerPhoneClean}&text=${encodeURIComponent(
                    `مرحباً ${order.customer.name} 🇮🇶 بخصوص طلبيتك #${order.orderNumber} من سوق الجملة:\nالحالة الحالية: ${currentStatus.label}`
                  )}`;

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/80 transition divide-x divide-x-reverse divide-slate-100">
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-mono font-black text-slate-900 block">
                          #{order.orderNumber}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {new Date(order.createdAt).toLocaleDateString('ar-IQ')}
                        </span>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {/* Prominent Business / Market Name */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-slate-900 text-xs sm:text-[13px]">
                            {order.customer.businessName || order.customer.name}
                          </span>
                          {order.customer.locationTitle && (
                            <span className="bg-sky-100 text-sky-900 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                              {order.customer.locationTitle}
                            </span>
                          )}
                        </div>

                        {/* Secondary Owner Name (if businessName differs) */}
                        {order.customer.businessName && order.customer.businessName !== order.customer.name && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium mt-0.5">
                            <span className="text-slate-400">👤</span>
                            <span>{order.customer.name}</span>
                            <span className="text-[10px] text-slate-400">({order.customer.city || 'كربلاء'})</span>
                          </div>
                        )}

                        {/* Prominent Phone Number Badge with Direct Call & WhatsApp Buttons */}
                        <div className="flex items-center gap-1 mt-1.5">
                          <a
                            href={`tel:${order.customer.phone}`}
                            className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono font-black text-xs px-2.5 py-1 rounded-xl transition shadow-2xs hover:scale-102 active:scale-98"
                            title="اضغط للاتصال المباشر بالزبون هاتفياً 📞"
                          >
                            <Phone className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                            <span dir="ltr" className="tracking-wide">{order.customer.phone}</span>
                          </a>

                          <a
                            href={customerWhatsApp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition shadow-xs flex items-center justify-center hover:scale-105 active:scale-95"
                            title="محادثة واتساب فورية مع الزبون لتأكيد الطلب 💬"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(order.customer.phone);
                              toast.success(`تم نسخ رقم الزبون: ${order.customer.phone} 📋`);
                            }}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition flex items-center justify-center hover:scale-105 active:scale-95 cursor-pointer"
                            title="نسخ رقم الهاتف"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-3 max-w-[180px]">
                        <div className="font-bold text-slate-800 text-xs">
                          {order.items.length} أصناف
                        </div>
                        <p
                          className="text-[11px] text-slate-500 font-medium line-clamp-2 leading-relaxed mt-0.5"
                          title={order.items.map((i) => `${i.name} (${i.quantity} ${i.unitLabel})`).join('، ')}
                        >
                          {order.items.map((i) => `${i.name} (${i.quantity} ${i.unitLabel})`).join('، ')}
                        </p>
                      </td>

                      {/* Total Amount & Collection Status Badge */}
                      <td className="py-3 px-3 whitespace-nowrap min-w-[110px]">
                        <div className="space-y-1">
                          <span className="font-black text-[#e0452c] font-mono text-xs block">
                            {order.total.toLocaleString()} د.ع
                          </span>

                          {order.collectionStatus === 'collected_cash' && (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-1.5 py-0.5 rounded-md block text-center truncate">
                              💵 كاش واصل
                            </span>
                          )}
                          {order.collectionStatus === 'debt_unpaid' && (
                            <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-1.5 py-0.5 rounded-md block text-center truncate">
                              📝 دين آجل
                            </span>
                          )}
                          {order.collectionStatus === 'partial' && (
                            <span className="bg-sky-100 text-sky-900 text-[10px] font-black px-1.5 py-0.5 rounded-md block text-center truncate">
                              💳 جزئي ({order.collectedAmount?.toLocaleString()})
                            </span>
                          )}
                          {order.collectionStatus === 'returned' && (
                            <span className="bg-red-100 text-red-800 text-[10px] font-black px-1.5 py-0.5 rounded-md block text-center truncate">
                              ❌ راجع / ملغي
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 1. Clean Driver Assignment Column */}
                      <td className="py-3 px-2.5 whitespace-nowrap min-w-[120px]">
                        <select
                          value={order.driverId || 'none'}
                          onChange={(e) => handleAssignDriver(order.id, e.target.value)}
                          className={`w-full text-xs font-bold rounded-xl px-2.5 py-1.5 border focus:outline-none cursor-pointer transition ${
                            order.driverId ? 'bg-amber-50 border-amber-300 text-amber-950 font-black' : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                          title="اختيار السائق المستلم للطلبية"
                        >
                          <option value="none">بدون سائق 🚚</option>
                          {drivers.map((drv) => (
                            <option key={drv.id} value={drv.id}>
                              {drv.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* 2. Dedicated Vehicle Column */}
                      <td className="py-3 px-2.5 whitespace-nowrap min-w-[130px]">
                        <select
                          value={order.vehicleId || 'none'}
                          onChange={(e) => handleAssignVehicle(order.id, e.target.value)}
                          className={`w-full text-xs font-bold rounded-xl px-2.5 py-1.5 border focus:outline-none cursor-pointer transition ${
                            order.vehicleId ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-black' : 'bg-slate-50 border-slate-200 text-slate-400'
                          }`}
                          title="اختيار السيارة التي يقودها السائق لهذه الطلبية"
                        >
                          <option value="none">بدون سيارة 🚗</option>
                          {vehicles.map((veh) => (
                            <option key={veh.id} value={veh.id}>
                              🚗 {veh.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* 3. Order Status Column */}
                      <td className="py-3 px-2.5 whitespace-nowrap min-w-[125px]">
                        <div className="space-y-1">
                          <select
                            disabled={updatingId === order.id}
                            value={order.status}
                            onChange={(e) => handleUpdateStatus(order.id, e.target.value as OrderStatus)}
                            className={`w-full text-xs font-bold rounded-xl px-2.5 py-1.5 border focus:outline-none cursor-pointer ${currentStatus.color}`}
                          >
                            {statusOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          {order.status === 'shipped' && (
                            <span className="text-[10px] text-indigo-700 font-bold block text-center bg-indigo-50 border border-indigo-200 rounded-md py-0.5">
                              {order.outForDeliveryAt ? `انطلق: ${new Date(order.outForDeliveryAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })} 🚀` : 'في الطريق الآن 🚀'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. Actions Column */}
                      <td className="py-3 px-2.5 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* 1. Print Official A4 Invoice (With Prices) */}
                          <button
                            onClick={() => {
                              setPrintOrder(order);
                              setPrintWithoutPrices(false);
                            }}
                            className="bg-purple-50 hover:bg-purple-100 text-purple-800 p-2 rounded-xl border border-purple-200 transition shadow-2xs cursor-pointer"
                            title="طباعة الفاتورة الرسمية A4 (بالأسعار) 🖨️"
                          >
                            <Printer className="w-3.5 h-3.5 text-purple-700" />
                          </button>

                          {/* 2. Print Delivery Sheet (Without Prices) */}
                          <button
                            onClick={() => {
                              setPrintOrder(order);
                              setPrintWithoutPrices(true);
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-800 p-2 rounded-xl border border-indigo-200 transition shadow-2xs cursor-pointer"
                            title="طباعة كشف تسليم للسائق (بدون أسعار) 🚚"
                          >
                            <FileText className="w-3.5 h-3.5 text-indigo-700" />
                          </button>

                          {/* 3. Edit / Return items icon */}
                          <button
                            onClick={() => handleOpenEditOrder(order)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-800 p-2 rounded-xl border border-amber-200 transition shadow-2xs cursor-pointer"
                            title="تعديل الفاتورة أو إرجاع بضاعة"
                          >
                            <Edit className="w-3.5 h-3.5 text-amber-700" />
                          </button>

                          {/* 4. View details icon */}
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="bg-sky-50 hover:bg-sky-100 text-sky-800 p-2 rounded-xl border border-sky-200 transition shadow-2xs cursor-pointer"
                            title="عرض تفاصيل الطلب"
                          >
                            <Eye className="w-3.5 h-3.5 text-sky-700" />
                          </button>

                          {/* 5. Location icon */}
                          {order.customer.mapsUrl && (
                            <a
                              href={order.customer.mapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 p-2 rounded-xl border border-emerald-200 transition shadow-2xs"
                              title="فتح موقع الزبون في خرائط Google"
                            >
                              <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                            </a>
                          )}

                          {/* 6. WhatsApp message icon */}
                          <a
                            href={customerWhatsApp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl transition shadow-2xs"
                            title="مراسلة الزبون عبر الواتساب"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
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

      {/* MODAL 1: VIEW ORDER DETAILS */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-base text-slate-900">تفاصيل الطلبية #{selectedOrder.orderNumber}</h3>
                <span className="text-[11px] text-slate-500">
                  {new Date(selectedOrder.createdAt).toLocaleDateString('ar-IQ')} - {new Date(selectedOrder.createdAt).toLocaleTimeString('ar-IQ')}
                </span>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 text-xs text-slate-700">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="font-bold text-slate-900">بيانات الزبون وعنوان وموقع التوصيل:</h4>
                {selectedOrder.customer.locationTitle && (
                  <span className="bg-sky-100 text-sky-900 text-[11px] font-bold px-2 py-0.5 rounded-md">
                    📍 {selectedOrder.customer.locationTitle}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div><strong>الاسم:</strong> {selectedOrder.customer.name}</div>
                {selectedOrder.customer.businessName && <div><strong>المنشأة/المحل:</strong> {selectedOrder.customer.businessName}</div>}
                <div><strong>الهاتف:</strong> <span dir="ltr">{selectedOrder.customer.phone}</span></div>
                <div><strong>المحافظة:</strong> {selectedOrder.customer.city}</div>
                <div className="col-span-2"><strong>العنوان:</strong> {selectedOrder.customer.address}</div>
                {selectedOrder.customer.notes && <div className="col-span-2"><strong>ملاحظات:</strong> {selectedOrder.customer.notes}</div>}
              </div>

              {selectedOrder.customer.mapsUrl && (
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-800">إحداثيات GPS مرفقة</span>
                  <a
                    href={selectedOrder.customer.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-white hover:bg-emerald-50 text-emerald-800 font-black text-xs py-1.5 px-3 rounded-xl border border-emerald-300 transition shadow-2xs inline-flex items-center gap-1"
                  >
                    <MapPin className="w-3 h-3 text-emerald-600" />
                    <span>فتح الموقع في خرائط Google 🗺️</span>
                  </a>
                </div>
              )}

              {selectedOrder.customer.storefrontImage && (
                <div className="pt-2 border-t border-slate-200 space-y-1">
                  <span className="font-bold text-slate-800 block text-[11px]">صورة واجهة الماركت الملتقطة:</span>
                  <img
                    src={selectedOrder.customer.storefrontImage}
                    alt="واجهة الماركت"
                    className="w-40 h-28 object-cover rounded-xl border border-slate-200 shadow-2xs"
                  />
                </div>
              )}
            </div>

            {/* Driver & Delivery Information Box */}
            <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 space-y-2 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="font-black text-amber-950 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-amber-700" />
                  <span>بيانات السائق والسيارة والتوصيل:</span>
                </h4>

                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={selectedOrder.driverId || 'none'}
                    onChange={(e) => handleAssignDriver(selectedOrder.id, e.target.value)}
                    className="bg-white border border-amber-300 text-amber-950 font-bold text-xs rounded-xl px-2.5 py-1.5 focus:outline-none cursor-pointer"
                  >
                    <option value="none">بدون سائق 🚚</option>
                    {drivers.map((drv) => (
                      <option key={drv.id} value={drv.id}>
                        {drv.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedOrder.vehicleId || 'none'}
                    onChange={(e) => handleAssignVehicle(selectedOrder.id, e.target.value)}
                    className="bg-white border border-emerald-300 text-emerald-950 font-bold text-xs rounded-xl px-2.5 py-1.5 focus:outline-none cursor-pointer"
                  >
                    <option value="none">🚗 بدون سيارة محددة</option>
                    {vehicles.map((veh) => (
                      <option key={veh.id} value={veh.id}>
                        🚗 {veh.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1">
                <div>
                  <strong>السائق المكلّف:</strong> {selectedOrder.driverName || 'لم يتم التعيين بعد'}
                </div>
                <div>
                  <strong>المركبة المستخدمة:</strong> {selectedOrder.vehicleName ? `🚗 ${selectedOrder.vehicleName} (${selectedOrder.vehiclePlate || ''})` : 'غير محددة'}
                </div>
                <div>
                  <strong>حالة التحصيل:</strong>{' '}
                  {selectedOrder.collectionStatus === 'collected_cash' ? (
                    <span className="text-emerald-700 font-bold">💵 تم استلام الكاش ({selectedOrder.total.toLocaleString()} د.ع)</span>
                  ) : selectedOrder.collectionStatus === 'debt_unpaid' ? (
                    <span className="text-amber-700 font-bold">📝 دين آجل ({selectedOrder.total.toLocaleString()} د.ع)</span>
                  ) : selectedOrder.collectionStatus === 'partial' ? (
                    <span className="text-sky-700 font-bold">💳 تحصيل جزئي (دفع {selectedOrder.collectedAmount?.toLocaleString()} • دين {selectedOrder.remainingDebtAmount?.toLocaleString()})</span>
                  ) : selectedOrder.collectionStatus === 'returned' ? (
                    <span className="text-red-600 font-bold">❌ تم الإرجاع</span>
                  ) : (
                    <span className="text-slate-500 font-bold">قيد الانتظار</span>
                  )}
                </div>
                {selectedOrder.driverNotes && (
                  <div className="col-span-2 text-amber-900">
                    <strong>ملاحظات السائق:</strong> {selectedOrder.driverNotes}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-xs text-slate-900">الأصناف المسجلة:</h4>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden text-xs">
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between gap-3 bg-white">
                    <div className="flex items-center gap-3">
                      <img src={item.image} alt={item.name} className="w-10 h-10 object-contain rounded-lg bg-slate-50 p-0.5" />
                      <div>
                        <span className="font-bold text-slate-900 block">{item.name}</span>
                        <span className="text-[10px] text-slate-500">
                          {item.saleType === 'wholesale' ? '📦 جملة' : '🛒 مفرد'} ({item.unitLabel}) • {item.quantity} × {item.price.toLocaleString()} د.ع
                        </span>
                      </div>
                    </div>
                    <span className="font-black text-slate-900">{(item.price * item.quantity).toLocaleString()} د.ع</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي:</span>
                <span className="font-bold text-slate-900 font-mono">{selectedOrder.subtotal.toLocaleString()} د.ع</span>
              </div>
              {(selectedOrder.deliveryFee ?? 0) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>أجور التوصيل:</span>
                  <span className="font-bold text-slate-900 font-mono">{(selectedOrder.deliveryFee || 0).toLocaleString()} د.ع</span>
                </div>
              )}
              {(selectedOrder.discount ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>الخصم:</span>
                  <span className="font-bold font-mono">-{(selectedOrder.discount || 0).toLocaleString()} د.ع</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-sm font-black text-slate-900">
                <span>الإجمالي:</span>
                <span className="text-lg text-[#e0452c] font-black font-mono">{selectedOrder.total.toLocaleString()} د.ع</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const o = selectedOrder;
                    setPrintOrder(o);
                    setPrintWithoutPrices(false);
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-black py-2.5 px-4 rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة فاتورة A4 (بالأسعار) 🖨️</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const o = selectedOrder;
                    setPrintOrder(o);
                    setPrintWithoutPrices(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black py-2.5 px-4 rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                >
                  <FileText className="w-4 h-4" />
                  <span>طباعة كشف تسليم للسائق (بدون أسعار) 🚚</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const o = selectedOrder;
                    setSelectedOrder(null);
                    handleOpenEditOrder(o);
                  }}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold py-2.5 px-4 rounded-xl border border-amber-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit className="w-4 h-4 text-amber-700" />
                  <span>تعديل الفاتورة 📦</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 px-5 rounded-xl cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT ORDER / RETURN ITEMS MODAL */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 space-y-5 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto text-xs">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
              <div>
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Edit className="w-5 h-5 text-amber-600" />
                  <span>تعديل الفاتورة #{editingOrder.orderNumber} واسترجاع بضاعة للمخزن</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                  العميل: {editingOrder.customer.name} ({editingOrder.customer.phone})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteOrder(editingOrder.id, editingOrder.orderNumber)}
                  disabled={isDeletingOrder}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold py-1.5 px-3 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="حذف هذه الفاتورة نهائياً"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeletingOrder ? 'جاري الحذف...' : 'حذف الفاتورة 🗑️'}</span>
                </button>
                <button onClick={() => setEditingOrder(null)} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Note alert */}
            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-2xl font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                💡 تنبيه: عند إنقاص كمية أي صنف أو حذفه، سيتم <strong>إعادة البضاعة المسترجعة فوراً لرصيد المستودع</strong> وخصم قيمتها من رصيد دين العميل تلقائياً.
              </span>
            </div>

            {/* Add extra product line with smart searchable combobox */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-brand-blue" />
                  <span>إضافة أصناف جديدة للفاتورة:</span>
                </span>
                <span className="text-[11px] text-slate-500 font-bold">
                  (يُضاف الصنف ويفتح سطر جديد تلقائياً عند الاختيار ⚡)
                </span>
              </div>
              <SearchableProductOrderSelect
                products={products}
                saleType={editingOrder?.items[0]?.saleType || 'wholesale'}
                merchantId={editingOrder?.customer.userId || ''}
                merchants={merchants || []}
                onSelectProduct={(prod) => {
                  handleSelectProductForEdit(prod);
                }}
              />
            </div>

            {/* Items List in Invoice */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900">أصناف الفاتورة:</h4>
              <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                {editItems.map((item, idx) => (
                  <div key={idx} className="p-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img src={item.image} alt={item.name} className="w-10 h-10 object-contain rounded-lg bg-slate-50" />
                      <div>
                        <div className="font-bold text-slate-900">{item.name}</div>
                        <div className="text-[10px] text-slate-500 font-bold">
                          {item.unitLabel} • سعر الوحدة: {item.price.toLocaleString()} د.ع
                        </div>
                      </div>
                    </div>

                    {/* Quantity controls & delete */}
                    <div className="flex items-center gap-3 justify-between sm:justify-end">
                      <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button
                          type="button"
                          onClick={() => {
                            if (item.quantity > 1) {
                              const updated = [...editItems];
                              updated[idx].quantity -= 1;
                              setEditItems(updated);
                            }
                          }}
                          className="w-7 h-7 bg-white rounded-lg font-black text-slate-800 hover:bg-slate-200 flex items-center justify-center shadow-xs cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value) || 1);
                            const updated = [...editItems];
                            updated[idx].quantity = val;
                            setEditItems(updated);
                          }}
                          className="w-14 text-center font-black font-mono text-sm bg-white border border-slate-300 rounded-lg py-1 px-1 focus:ring-2 focus:ring-brand-blue outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...editItems];
                            updated[idx].quantity += 1;
                            setEditItems(updated);
                          }}
                          className="w-7 h-7 bg-white rounded-lg font-black text-slate-800 hover:bg-slate-200 flex items-center justify-center shadow-xs cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <span className="font-black font-mono text-slate-900 w-24 text-left">
                        {(item.price * item.quantity).toLocaleString()} د.ع
                      </span>

                      <button
                        type="button"
                        onClick={async () => {
                          const isConfirmed = await confirm({
                            title: 'إرجاع وحذف الصنف',
                            message: `هل أنت متأكد من حذف الصنف "${item.name}" وإرجاع كميته بالكامل للمخزن؟`,
                            confirmText: 'نعم، احذف وأرجع للمخزن',
                            cancelText: 'تراجع',
                            type: 'danger',
                          });
                          if (isConfirmed) {
                            setEditItems(editItems.filter((_, i) => i !== idx));
                          }
                        }}
                        className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition cursor-pointer"
                        title="إرجاع وحذف الصنف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Calculations & Adjustments */}
            <form onSubmit={handleSaveOrderEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">أجور التوصيل (د.ع):</label>
                  <input
                    type="number"
                    min="0"
                    value={editDeliveryFee}
                    onChange={(e) => setEditDeliveryFee(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">مبلغ الخصم (د.ع):</label>
                  <input
                    type="number"
                    min="0"
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold font-mono text-emerald-700"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">ملاحظات التعديل:</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="مثال: تم إرجاع 2 كرتون بناءً على رغبة الزبون"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold"
                  />
                </div>
              </div>

              {/* Total summary */}
              <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between font-bold flex-wrap gap-3">
                <div>
                  <span className="text-slate-400 text-xs block">الإجمالي الجديد بعد التعديل والاسترجاع:</span>
                  <span className="text-xl font-black font-mono text-emerald-400">
                    {Math.max(
                      0,
                      editItems.reduce((sum, i) => sum + i.price * i.quantity, 0) + editDeliveryFee - editDiscount
                    ).toLocaleString()}{' '}
                    د.ع
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleDeleteOrder(editingOrder.id, editingOrder.orderNumber)}
                    disabled={isDeletingOrder}
                    className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-700/60 font-black py-2.5 px-4 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>{isDeletingOrder ? 'جاري الحذف...' : 'حذف الفاتورة 🗑️'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingOrder(null)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 px-4 rounded-xl transition cursor-pointer"
                  >
                    إلغاء
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmittingEdit || isDeletingOrder}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-2.5 px-6 rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingEdit ? 'جاري التعديل...' : 'حفظ التعديل واسترجاع المخزون ✅'}
                  </button>
                </div>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* MODAL 3: CREATE MANUAL ORDER (POS / PHONE ORDERS) */}
      {isManualOrderModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 space-y-5 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto text-xs">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <PhoneCall className="w-5 h-5 text-emerald-600" />
                  <span>إنشاء طلبية وفاتورة مبيعات جديدة يدوياً 📞</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                  تسجيل طلبية عبر الهاتف لزبون أو تاجر مسجل
                </p>
              </div>
              <button onClick={() => setIsManualOrderModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitManualOrder} className="space-y-4">
              
              {/* Customer Type Choice */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-900">
                    <input
                      type="radio"
                      name="custType"
                      checked={manualCustomerType === 'guest'}
                      onChange={() => setManualCustomerType('guest')}
                      className="accent-brand-blue"
                    />
                    <span>زبون جديد / زائر</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-900">
                    <input
                      type="radio"
                      name="custType"
                      checked={manualCustomerType === 'registered'}
                      onChange={() => setManualCustomerType('registered')}
                      className="accent-brand-blue"
                    />
                    <span>اختيار من التجار والماركتات المسجلين 👑</span>
                  </label>
                </div>

                {manualCustomerType === 'registered' && (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">اختر التاجر / الماركت / الزبون المسجل 👑:</label>
                    <SearchableMerchantSelect
                      merchants={merchants}
                      selectedMerchantId={manualSelectedMerchantId}
                      onSelect={(m) => handleMerchantSelect(m.id)}
                    />
                  </div>
                )}

                {/* Customer Details Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">اسم العميل *:</label>
                    <input
                      type="text"
                      required
                      value={manualCustomerName}
                      onChange={(e) => setManualCustomerName(e.target.value)}
                      placeholder="مثال: علي الجبوري"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">رقم الهاتف *:</label>
                    <input
                      type="text"
                      required
                      value={manualCustomerPhone}
                      onChange={(e) => setManualCustomerPhone(e.target.value)}
                      placeholder="0770xxxxxxx"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold font-mono"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">اسم الماركت / المتجر (اختياري):</label>
                    <input
                      type="text"
                      value={manualBusinessName}
                      onChange={(e) => setManualBusinessName(e.target.value)}
                      placeholder="مثال: أسواق النخيل"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">المحافظة والمدينة:</label>
                    <input
                      type="text"
                      value={manualCity}
                      onChange={(e) => setManualCity(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-700 block mb-1">العنوان بالتفصيل:</label>
                    <input
                      type="text"
                      value={manualAddress}
                      onChange={(e) => setManualAddress(e.target.value)}
                      placeholder="المنطقة، الشارع، أقرب نقطة دالة"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold"
                    />
                  </div>
                </div>

              </div>

              {/* Pricing Sale Type Logic */}
              {manualCustomerType === 'registered' && manualSelectedMerchantId ? (
                (() => {
                  const selectedM = merchants.find((u) => u.id === manualSelectedMerchantId);
                  const isMerchant = selectedM?.accountType === 'merchant' || selectedM?.accountType === 'wholesale' || selectedM?.accountType === 'market' || !!selectedM?.businessName || selectedM?.merchantStatus === 'approved';
                  const tierLabel = selectedM?.merchantTier === 'gold' ? 'ذهبـي VIP 🥇' : selectedM?.merchantTier === 'silver' ? 'فضـي 🥈' : 'برونـزي 🥉';

                  return (
                    <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                      isMerchant ? 'bg-emerald-50/80 border-emerald-200' : 'bg-blue-50/80 border-blue-200'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm ${
                          isMerchant ? 'bg-emerald-600 text-white' : 'bg-brand-blue text-white'
                        }`}>
                          {isMerchant ? '👑' : '🛒'}
                        </div>
                        <div>
                          <span className="font-black text-slate-900 text-xs block">
                            {isMerchant ? (
                              <span>تاجر / ماركت معتمد: <span className="text-emerald-800">{selectedM?.businessName || selectedM?.name}</span></span>
                            ) : (
                              <span>زبون تجزئة ومفرد مسجل: <span className="text-brand-blue">{selectedM?.name}</span></span>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-500 font-bold block">
                            {isMerchant
                              ? `الفئة: (${tierLabel}) — تم اعتماد أسعار كراتين الجملة والماركتات آلياً ✓`
                              : 'تم اعتماد أسعار المفرد والقطاعي آلياً ✓'}
                          </span>
                        </div>
                      </div>

                      <span className={`text-[11px] font-black px-3 py-1 rounded-xl border ${
                        isMerchant
                          ? 'bg-emerald-600 text-white border-emerald-700'
                          : 'bg-brand-blue text-white border-blue-700'
                      }`}>
                        {isMerchant ? '📦 تسعير كراتين الجملة' : '🛒 تسعير المفرد'}
                      </span>
                    </div>
                  );
                })()
              ) : (
                <div className="flex items-center justify-between bg-slate-100 p-3 rounded-2xl border border-slate-200">
                  <div>
                    <span className="font-bold text-slate-900 text-xs block">نوع التسعير في الفاتورة:</span>
                    <span className="text-[10px] text-slate-500 font-bold">
                      {manualCustomerType === 'registered' ? 'اختر التاجر أعلاه للاعتماد التلقائي' : 'زبون غير مسجل — حدد نوع التسعير المطلوب:'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setManualSaleType('wholesale')}
                      className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                        manualSaleType === 'wholesale' ? 'bg-brand-blue text-white shadow-xs' : 'bg-white text-slate-700'
                      }`}
                    >
                      📦 أسعار كراتين الجملة
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualSaleType('retail')}
                      className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                        manualSaleType === 'retail' ? 'bg-brand-blue text-white shadow-xs' : 'bg-white text-slate-700'
                      }`}
                    >
                      🛒 أسعار المفرد
                    </button>
                  </div>
                </div>
              )}

              {/* Add Products Line */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 block">إضافة وتحديد المواد للطلبية:</span>
                  <span className="text-[10px] text-slate-400 font-bold">
                    (يُضاف الصنف ويُفتح سطر جديد تلقائياً عند الاختيار ⚡)
                  </span>
                </div>
                <SearchableProductOrderSelect
                  products={products}
                  saleType={manualSaleType}
                  merchantId={manualSelectedMerchantId}
                  merchants={merchants}
                  onSelectProduct={(prod) => {
                    // ⚡ بمجرد اختيار الصنف، يُضاف فوراً للطلبية
                    const selectedMerchant = merchants.find((u) => u.id === manualSelectedMerchantId);
                    const tier = selectedMerchant?.merchantTier || 'bronze';

                    let price = prod.price;
                    if (manualSaleType === 'wholesale') {
                      if (tier === 'gold') {
                        price = prod.vipPrice || prod.specialPrice || prod.wholesalePrice;
                      } else if (tier === 'silver') {
                        price = prod.specialPrice || prod.wholesalePrice;
                      } else {
                        price = prod.wholesalePrice;
                      }
                    }
                    const unitLabel = manualSaleType === 'wholesale' ? prod.wholesaleUnit : prod.retailUnit;

                    const existingIdx = manualItems.findIndex((it) => it.productId === prod.id);
                    if (existingIdx > -1) {
                      const updated = [...manualItems];
                      updated[existingIdx].quantity += 1;
                      setManualItems(updated);
                    } else {
                      setManualItems([
                        ...manualItems,
                        {
                          productId: prod.id,
                          name: prod.name,
                          price,
                          quantity: 1,
                          saleType: manualSaleType,
                          unitLabel: unitLabel || (manualSaleType === 'wholesale' ? 'كرتون' : 'قطعة'),
                          image: prod.images?.[0] || '',
                        },
                      ]);
                    }
                  }}
                />
              </div>

              {/* Added Items List */}
              {manualItems.length > 0 && (
                <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                  {manualItems.map((item, idx) => (
                    <div key={idx} className="p-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <img src={item.image} alt={item.name} className="w-10 h-10 object-contain rounded-lg bg-slate-50" />
                        <div>
                          <div className="font-bold text-slate-900">{item.name}</div>
                          <div className="text-[10px] text-slate-500 font-bold">
                            {item.unitLabel} • سعر الوحدة: {item.price.toLocaleString()} د.ع
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 justify-between sm:justify-end">
                        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                          <button
                            type="button"
                            onClick={() => {
                              if (item.quantity > 1) {
                                const updated = [...manualItems];
                                updated[idx].quantity -= 1;
                                setManualItems(updated);
                              }
                            }}
                            className="w-7 h-7 bg-white rounded-lg font-black text-slate-800 hover:bg-slate-200 flex items-center justify-center shadow-xs cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              const updated = [...manualItems];
                              updated[idx].quantity = val;
                              setManualItems(updated);
                            }}
                            className="w-14 text-center font-black font-mono text-sm bg-white border border-slate-300 rounded-lg py-1 px-1 focus:ring-2 focus:ring-brand-blue outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...manualItems];
                              updated[idx].quantity += 1;
                              setManualItems(updated);
                            }}
                            className="w-7 h-7 bg-white rounded-lg font-black text-slate-800 hover:bg-slate-200 flex items-center justify-center shadow-xs cursor-pointer"
                          >
                            +
                          </button>
                        </div>

                        <span className="font-black font-mono text-slate-900 w-24 text-left">
                          {(item.price * item.quantity).toLocaleString()} د.ع
                        </span>

                        <button
                          type="button"
                          onClick={() => setManualItems(manualItems.filter((_, i) => i !== idx))}
                          className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Delivery & Payment Method */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">أجور التوصيل (د.ع):</label>
                  <input
                    type="number"
                    min="0"
                    value={manualDeliveryFee}
                    onChange={(e) => setManualDeliveryFee(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">مبلغ الخصم (د.ع):</label>
                  <input
                    type="number"
                    min="0"
                    value={manualDiscount}
                    onChange={(e) => setManualDiscount(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold font-mono text-emerald-700"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">طريقة الدفع:</label>
                  <select
                    value={manualPaymentMethod}
                    onChange={(e: any) => setManualPaymentMethod(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900"
                  >
                    <option value="debt">📝 آجل على الحساب (دين للتاجر / لم يُستلم بعد)</option>
                    <option value="cod">💵 دفع عند الاستلام (كاش مع السائق)</option>
                    <option value="zaincash">📱 زين كاش (Zain Cash)</option>
                  </select>
                </div>
              </div>

              {/* 📊 Customer Previous Balance & Grand Total Card */}
              {(() => {
                const currentOrderTotal = Math.max(
                  0,
                  manualItems.reduce((sum, i) => sum + i.price * i.quantity, 0) + manualDeliveryFee - manualDiscount
                );
                const prevBalance = getCustomerPreviousBalance(manualCustomerPhone, manualCustomerName, manualSelectedMerchantId);
                const grandTotal = currentOrderTotal + prevBalance;

                return (
                  <div className="bg-amber-50/80 border border-amber-200 p-3.5 rounded-2xl space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-amber-950">
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>كشف حساب ورصيد الزبون ({manualCustomerName || 'الزبون المختار'}):</span>
                      </div>
                      {prevBalance > 0 ? (
                        <span className="bg-amber-200/70 text-amber-900 px-2.5 py-0.5 rounded-full font-black text-[11px]">
                          يوجد رصيد سابق بذمته ⚠️
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                          لا توجد ديون سابقة ✓
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono font-bold">
                      <div className="bg-white p-2.5 rounded-xl border border-amber-200/70">
                        <span className="text-[10px] text-slate-500 block font-sans">الرصيد / الطلبات السابقة:</span>
                        <span className={`text-sm font-black ${prevBalance > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
                          {prevBalance.toLocaleString()} د.ع
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-amber-200/70">
                        <span className="text-[10px] text-slate-500 block font-sans">مجموع هذه الفاتورة:</span>
                        <span className="text-sm font-black text-blue-700">
                          {currentOrderTotal.toLocaleString()} د.ع
                        </span>
                      </div>
                      <div className="bg-gradient-to-r from-amber-600 to-red-600 text-white p-2.5 rounded-xl shadow-xs">
                        <span className="text-[10px] text-amber-100 block font-sans">المجموع الكلي المطلوب (السابق + الحالي):</span>
                        <span className="text-sm font-black">
                          {grandTotal.toLocaleString()} د.ع
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Print Options Strip */}
              <div className="bg-purple-50/70 border border-purple-200 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-purple-950 text-xs select-none">
                  <input
                    type="checkbox"
                    checked={autoPrintOnSave}
                    onChange={(e) => setAutoPrintOnSave(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                  />
                  <Printer className="w-4 h-4 text-purple-700" />
                  <span>طباعة الفاتورة A4 فور الحفظ 🖨️</span>
                </label>

                {autoPrintOnSave && (
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-indigo-900 text-xs select-none bg-white px-3 py-1.5 rounded-xl border border-purple-200">
                    <input
                      type="checkbox"
                      checked={autoPrintWithoutPrices}
                      onChange={(e) => setAutoPrintWithoutPrices(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
                    />
                    <FileText className="w-4 h-4 text-indigo-700" />
                    <span>طباعة بدون أسعار (كشف تسليم للسائق / منافيست) 🚚</span>
                  </label>
                )}
              </div>

              {/* Final Footer Strip */}
              <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between font-bold">
                <div>
                  <span className="text-slate-400 text-xs block">مجموع هذه الفاتورة:</span>
                  <span className="text-xl font-black font-mono text-emerald-400">
                    {Math.max(
                      0,
                      manualItems.reduce((sum, i) => sum + i.price * i.quantity, 0) + manualDeliveryFee - manualDiscount
                    ).toLocaleString()}{' '}
                    د.ع
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsManualOrderModalOpen(false)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 px-4 rounded-xl transition"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingManualOrder}
                    className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black py-2.5 px-6 rounded-xl transition shadow-md flex items-center gap-2"
                  >
                    {isSubmittingManualOrder ? 'جاري الإنشاء...' : 'حفظ الفاتورة وخصم المخزون ✅'}
                  </button>
                </div>
              </div>

            </form>

          </div>
        </div>
      )}

      </div>

      {/* MODAL 4: CLEAN A4 OFFICIAL INVOICE & DELIVERY MANIFEST (الطباعة الرسمية النظيفة) */}
      {printOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto print:static print:p-0 print:m-0 print:bg-transparent order-print-modal-overlay">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full p-6 space-y-4 text-xs my-8 max-h-[90vh] flex flex-col print:max-h-none print:shadow-none print:border-none print:p-0 print:my-0 print:w-full order-print-modal-card">
            
            {/* Top Toolbar (Hidden on Print) */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 no-print print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-brand-blue" />
                <h3 className="text-base font-black text-slate-900">
                  {printWithoutPrices ? 'طباعة كشف تسليم للسائق (بدون أسعار)' : 'طباعة الفاتورة الرسمية (A4)'}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {/* Toggle Mode */}
                <button
                  type="button"
                  onClick={() => setPrintWithoutPrices(!printWithoutPrices)}
                  className={`py-1.5 px-3 rounded-xl font-bold transition text-xs border ${
                    printWithoutPrices
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                      : 'bg-purple-50 border-purple-300 text-purple-900'
                  }`}
                >
                  {printWithoutPrices ? '🔄 التبديل إلى: فاتورة بالأسعار' : '🔄 التبديل إلى: كشف بدون أسعار (للسائق)'}
                </button>

                <button
                  onClick={() => window.print()}
                  className="bg-brand-blue hover:bg-brand-blueDark text-white font-black py-1.5 px-4 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الآن 🖨️</span>
                </button>

                <button
                  onClick={() => setPrintOrder(null)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* A4 PRINTABLE DOCUMENT BODY */}
            <div id="printable-order-sheet" className="space-y-4 print:p-0 relative overflow-y-auto max-h-[calc(88vh-120px)] print:max-h-none print:overflow-visible pr-1 font-sans">
              
              {/* Subtle Watermark Logo for A4 Paper */}
              <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center opacity-[0.04] z-0">
                <div className="w-80 h-80 flex items-center justify-center scale-125">
                  <EtihadLogo size="lg" />
                </div>
              </div>

              <div className="relative z-10 space-y-4">
                
                {/* Clean Official Header */}
                <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3">
                  <div>
                    <EtihadLogo size="sm" />
                    <p className="text-[10px] text-slate-600 font-bold mt-0.5">
                      سوق الجملة لتجارة المواد الغذائية والسناكات 🇮🇶
                    </p>
                  </div>

                  <div className="text-left font-mono">
                    <span className="text-sm font-black text-slate-900 block font-sans">
                      {printWithoutPrices ? 'كشف تسليم ومنافيست بضاعة 🚚' : 'فاتورة مبيعات رسمية 🧾'}
                    </span>
                    <span className="text-xs font-bold text-slate-800 block">
                      رقم الطلبية: #{printOrder.orderNumber}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      التاريخ: {new Date(printOrder.createdAt).toLocaleDateString('ar-IQ')} - {new Date(printOrder.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {/* Minimal Customer Info Strip */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">اسم العميل:</span>
                    <span className="font-black text-slate-900">{printOrder.customer.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">رقم الهاتف:</span>
                    <span className="font-bold text-slate-800 font-mono" dir="ltr">{printOrder.customer.phone}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">المتجر / الماركت:</span>
                    <span className="font-bold text-emerald-800">{printOrder.customer.businessName || 'زبون نقدي'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">المدينة والعنوان:</span>
                    <span className="font-bold text-slate-800">{printOrder.customer.city || 'العراق'} - {printOrder.customer.address || 'داخل المدينة'}</span>
                  </div>
                </div>

                {/* Items Table */}
                <div className="border border-slate-300 rounded-2xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-800 border-b border-slate-300 font-black text-[11px]">
                      <tr className="divide-x divide-x-reverse divide-slate-300">
                        <th className="py-2.5 px-3 text-center w-10">ت #</th>
                        <th className="py-2.5 px-3">اسم المادة / الصنف</th>
                        <th className="py-2.5 px-3 text-center">العبوة والنوع</th>
                        <th className="py-2.5 px-3 text-center w-24">الكمية</th>
                        {!printWithoutPrices && (
                          <>
                            <th className="py-2.5 px-3 text-center w-28">سعر الوحدة</th>
                            <th className="py-2.5 px-3 text-center w-32">المجموع</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-bold">
                      {printOrder.items.map((item, idx) => (
                        <tr key={idx} className="divide-x divide-x-reverse divide-slate-200">
                          <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="py-2.5 px-3 text-slate-900 font-black">{item.name}</td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap text-slate-600">
                            {item.saleType === 'wholesale' ? '📦 جملة' : '🛒 مفرد'} ({item.unitLabel})
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900 text-sm">
                            {item.quantity}
                          </td>
                          {!printWithoutPrices && (
                            <>
                              <td className="py-2.5 px-3 text-center font-mono text-slate-800">
                                {item.price.toLocaleString()} د.ع
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900">
                                {(item.price * item.quantity).toLocaleString()} د.ع
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals & Notes Section */}
                {!printWithoutPrices ? (
                  (() => {
                    const prevBalance = getCustomerPreviousBalance(
                      printOrder.customer.phone,
                      printOrder.customer.name,
                      printOrder.customer.userId,
                      printOrder.id
                    );
                    const grandTotal = printOrder.total + prevBalance;

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        {/* Left: Notes & Payment Method & Balance Alert */}
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1.5 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block">طريقة الدفع:</span>
                            <span className="font-black text-slate-900">
                              {printOrder.paymentMethod === 'debt' ? '📝 آجل على الحساب (دين للتاجر)' : '💵 دفع عند الاستلام (كاش)'}
                            </span>
                          </div>
                          {printOrder.customer.notes && (
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold block">ملاحظات:</span>
                              <span className="text-slate-700 font-bold">{printOrder.customer.notes}</span>
                            </div>
                          )}
                          {prevBalance > 0 && (
                            <div className="pt-1 text-[11px] text-amber-800 font-bold bg-amber-50 p-2 rounded-xl border border-amber-200">
                              ⚠️ ملاحظة حسابية: تم إضافة رصيد الحساب والطلبات السابقة غير المسددة للإجمالي الكلي.
                            </div>
                          )}
                        </div>

                        {/* Right: Financial Totals Breakdown */}
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1 text-xs">
                          <div className="flex justify-between text-slate-600 font-bold">
                            <span>المجموع الفرعي:</span>
                            <span className="font-mono">{printOrder.subtotal.toLocaleString()} د.ع</span>
                          </div>
                          {(printOrder.deliveryFee ?? 0) > 0 && (
                            <div className="flex justify-between text-slate-600 font-bold">
                              <span>أجور التوصيل:</span>
                              <span className="font-mono">{printOrder.deliveryFee?.toLocaleString()} د.ع</span>
                            </div>
                          )}
                          {(printOrder.discount ?? 0) > 0 && (
                            <div className="flex justify-between text-emerald-700 font-bold">
                              <span>الخصم:</span>
                              <span className="font-mono">-{printOrder.discount?.toLocaleString()} د.ع</span>
                            </div>
                          )}
                          <div className="border-t border-slate-300 pt-1.5 flex justify-between items-center text-xs font-black text-slate-900">
                            <span>مجموع هذه الفاتورة:</span>
                            <span className="font-bold font-mono text-blue-700">
                              {printOrder.total.toLocaleString()} د.ع
                            </span>
                          </div>

                          {prevBalance > 0 && (
                            <div className="flex justify-between items-center text-xs font-bold text-amber-800 bg-amber-50/60 px-2 py-1 rounded-lg">
                              <span>الرصيد / الطلبات السابقة:</span>
                              <span className="font-black font-mono">
                                +{prevBalance.toLocaleString()} د.ع
                              </span>
                            </div>
                          )}

                          <div className="border-t-2 border-slate-900 pt-1.5 flex justify-between items-center text-sm font-black text-slate-900">
                            <span>المجموع الكلي المطلوب:</span>
                            <span className="text-base text-[#e0452c] font-black font-mono">
                              {grandTotal.toLocaleString()} د.ع
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block">إجمالي عدد الطرود / الكراتين:</span>
                      <span className="text-base font-black font-mono text-slate-900">
                        {printOrder.items.reduce((sum, it) => sum + it.quantity, 0)} طرد / كرتون
                      </span>
                    </div>
                    <div className="text-slate-500 text-[11px] font-bold">
                      📦 كشف تسليم بضاعة للمندوب والمستلم بدون كشف الأسعار
                    </div>
                  </div>
                )}

                {/* Signature Strip */}
                <div className="pt-4 border-t border-slate-300 grid grid-cols-2 text-center text-xs font-bold text-slate-600 gap-6">
                  <div className="space-y-8">
                    <span>توقيع واستلام الزبون / الماركت</span>
                    <div className="border-b border-dashed border-slate-400 w-36 mx-auto" />
                  </div>
                  <div className="space-y-8">
                    <span>توقيع منظم الفاتورة / السائق الموزع</span>
                    <div className="border-b border-dashed border-slate-400 w-36 mx-auto" />
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

    </>
  );
}

// 🔍 Searchable Customer / Merchant Combobox Component for High-Volume Customers
function SearchableMerchantSelect({
  merchants,
  selectedMerchantId,
  onSelect,
}: {
  merchants: UserType[];
  selectedMerchantId: string;
  onSelect: (merchant: UserType) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const selectedMerchant = merchants.find((m) => m.id === selectedMerchantId);

  const filteredMerchants = merchants.filter((m) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      m.name.toLowerCase().includes(term) ||
      (m.businessName && m.businessName.toLowerCase().includes(term)) ||
      (m.phone && m.phone.includes(term)) ||
      (m.city && m.city.toLowerCase().includes(term))
    );
  });

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
    <div className="relative w-full text-xs" ref={wrapperRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white border border-slate-300 hover:border-brand-blue rounded-xl py-2 px-3 text-right font-bold text-slate-900 flex items-center justify-between gap-2 shadow-2xs transition cursor-pointer"
      >
        <span className="truncate block">
          {selectedMerchant ? (
            <span className="text-slate-900">
              👤 {selectedMerchant.name}{' '}
              {selectedMerchant.businessName && (
                <span className="text-emerald-700 font-bold">({selectedMerchant.businessName})</span>
              )}{' '}
              <span className="text-slate-400 font-mono text-[11px]">- {selectedMerchant.phone}</span>
            </span>
          ) : (
            <span className="text-slate-400 font-normal">-- اختر أو ابحث عن التاجر / الماركت ({merchants.length} مسجل) --</span>
          )}
        </span>
        <span className="text-slate-400 text-[10px] shrink-0">▼</span>
      </button>

      {/* Dropdown Box */}
      {isOpen && (
        <div className="absolute z-50 right-0 left-0 mt-1 bg-white border border-slate-300 rounded-2xl shadow-2xl p-2 space-y-1.5 animate-fadeIn text-xs max-h-80 flex flex-col min-w-[280px]">
          
          {/* Quick Search */}
          <div className="relative shrink-0">
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="اكتب اسم الزبون، المحل، أو رقم الهاتف..."
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

          {/* Info */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 font-bold shrink-0">
            <span>{filteredMerchants.length} زبون مطابق</span>
            <span>دليل التجار والزبائن</span>
          </div>

          {/* List */}
          <div className="overflow-y-auto space-y-1 divide-y divide-slate-100 flex-1 pr-0.5 max-h-56">
            {filteredMerchants.length === 0 ? (
              <div className="py-6 text-center text-slate-400 space-y-1">
                <span className="text-base block">🔍</span>
                <span className="text-xs font-bold block">لا يوجد زبون يطابق "{searchTerm}"</span>
              </div>
            ) : (
              filteredMerchants.map((m) => {
                const isSelected = m.id === selectedMerchantId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelect(m);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`w-full text-right p-2.5 rounded-xl transition flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 text-brand-blue font-black border border-blue-200'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="truncate">
                      <div className="font-black text-xs text-slate-900 truncate flex items-center gap-1.5">
                        <span>{m.name}</span>
                        {m.businessName && (
                          <span className="text-emerald-700 font-bold">({m.businessName})</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono font-medium block">
                        📱 {m.phone || 'بدون هاتف'} • 📍 {m.city || 'كربلاء المقدسة'}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isSelected ? (
                        <span className="text-[10px] text-brand-blue font-bold">محدد ✓</span>
                      ) : (
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold">
                          اختيار ↵
                        </span>
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

// 🔍 Searchable Product Selector for Order Lines with Instant Auto-Add
function SearchableProductOrderSelect({
  products = [],
  saleType = 'wholesale',
  merchantId = '',
  merchants = [],
  onSelectProduct,
}: {
  products: Product[];
  saleType?: any;
  merchantId?: string;
  merchants?: UserType[];
  onSelectProduct: (product: Product) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const selectedMerchant = (merchants || []).find((u) => u && u.id === merchantId);
  const tier = selectedMerchant?.merchantTier || 'bronze';

  const filteredProducts = products.filter((p) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(term) ||
      (p.company && p.company.toLowerCase().includes(term)) ||
      (p.category && p.category.toLowerCase().includes(term))
    );
  });

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
    <div className="relative w-full text-xs" ref={wrapperRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white border border-slate-300 hover:border-emerald-600 rounded-xl py-2 px-3 text-right font-bold text-slate-900 flex items-center justify-between gap-2 shadow-2xs transition cursor-pointer"
      >
        <span className="text-slate-500 font-normal">
          🔍 اكتب أو اختر صنف لإضافته فورياً للطلبية ({products.length} صنف متوفر)...
        </span>
        <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
          + اختيار سريع
        </span>
      </button>

      {/* Dropdown Box */}
      {isOpen && (
        <div className="absolute z-50 right-0 left-0 mt-1 bg-white border border-slate-300 rounded-2xl shadow-2xl p-2 space-y-1.5 animate-fadeIn text-xs max-h-80 flex flex-col min-w-[280px]">
          
          {/* Quick Search */}
          <div className="relative shrink-0">
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="اكتب اسم الصنف أو الشركة للبحث السريع (مثال: رز، حار، زيت)..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 pr-8 pl-6 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
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

          {/* Info */}
          <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 font-bold shrink-0">
            <span>{filteredProducts.length} صنف مطابق</span>
            <span>التسعير: {saleType === 'wholesale' ? 'جملة 📦' : 'مفرد 🛒'}</span>
          </div>

          {/* List */}
          <div className="overflow-y-auto space-y-1 divide-y divide-slate-100 flex-1 pr-0.5 max-h-56">
            {filteredProducts.length === 0 ? (
              <div className="py-6 text-center text-slate-400 space-y-1">
                <span className="text-base block">🔍</span>
                <span className="text-xs font-bold block">لا توجد أصناف تطابق "{searchTerm}"</span>
              </div>
            ) : (
              filteredProducts.map((p) => {
                let price = p.price;
                if (saleType === 'wholesale') {
                  if (tier === 'gold') {
                    price = p.vipPrice || p.specialPrice || p.wholesalePrice;
                  } else if (tier === 'silver') {
                    price = p.specialPrice || p.wholesalePrice;
                  } else {
                    price = p.wholesalePrice;
                  }
                }
                const unit = saleType === 'wholesale' ? p.wholesaleUnit || 'كرتون' : p.retailUnit || 'قطعة';
                const isOutOfStock = p.stock === 0 || p.stock < 0;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelectProduct(p);
                      setSearchTerm('');
                      setIsOpen(false);
                    }}
                    className="w-full text-right p-2.5 rounded-xl hover:bg-emerald-50/70 transition flex items-center justify-between gap-2 cursor-pointer group"
                  >
                    <div className="truncate">
                      <span className="font-black text-xs text-slate-900 truncate block group-hover:text-emerald-950">
                        {p.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium block">
                        {p.company || p.category} • العبوة: {unit} • المخزون: {p.stock}
                      </span>
                    </div>

                    <div className="text-left shrink-0">
                      <span className="font-mono font-black text-xs text-emerald-700 block">
                        {price.toLocaleString()} د.ع
                      </span>
                      {isOutOfStock ? (
                        <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.2 rounded font-black">
                          نافذ ⚠️
                        </span>
                      ) : (
                        <span className="text-[10px] text-emerald-600 font-bold group-hover:underline">
                          + إضافة للطلبية
                        </span>
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
