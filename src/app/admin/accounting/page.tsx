'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FileText,
  DollarSign,
  TrendingUp,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Search,
  Plus,
  Printer,
  MessageCircle,
  Clock,
  ArrowLeft,
  Store,
  User,
  ExternalLink,
  Filter,
  ShieldCheck,
  X,
  CreditCard,
  Banknote,
  Edit2,
  Trash2,
  Eye,
  Calendar,
  Package,
  Minus,
  Wallet,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpRight,
  Shield,
  ShieldAlert,
  History,
  Sparkles,
  RefreshCw,
  Activity,
  Key,
  Users
} from 'lucide-react';
import {
  CustomerAccountSummary,
  AccountStatement,
  PaymentRecord,
  AccountTransaction,
  Order,
  OrderItem,
  Product,
  CashVaultMovement,
  CashVaultSummary,
  AuditLogEntry
} from '@/types';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';
import EtihadLogo from '@/components/EtihadLogo';

function AdminAccountingContent() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [activeMainTab, setActiveMainTab] = useState<'accounts' | 'vault' | 'audit'>('accounts');
  const [currentOperator, setCurrentOperator] = useState<{ name: string; username: string; role: string } | null>(null);

  // Accounts & Debt State
  const [accounts, setAccounts] = useState<CustomerAccountSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'debtors' | 'settled'>('all');
  const searchParams = useSearchParams();

  // Cash Vault 181 State
  const [vaultSummary, setVaultSummary] = useState<CashVaultSummary | null>(null);
  const [vaultMovements, setVaultMovements] = useState<CashVaultMovement[]>([]);
  const [isLoadingVault, setIsLoadingVault] = useState(false);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [vaultFormType, setVaultFormType] = useState<'inflow' | 'outflow'>('inflow');
  const [vaultFormCategory, setVaultFormCategory] = useState<string>('deposit_adjustment');
  const [vaultFormAmount, setVaultFormAmount] = useState('');
  const [vaultFormParty, setVaultFormParty] = useState('');
  const [vaultFormNotes, setVaultFormNotes] = useState('');
  const [isSubmittingVault, setIsSubmittingVault] = useState(false);
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');

  // Audit Log State
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [auditCategoryFilter, setAuditCategoryFilter] = useState<string>('all');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');

  // Stats
  const [totalDebt, setTotalDebt] = useState(0);
  const [totalInvoiced, setTotalInvoiced] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);

  const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Selected Account for Detailed Statement Modal
  const [selectedStatement, setSelectedStatement] = useState<AccountStatement | null>(null);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);
  const [statementStartDate, setStatementStartDate] = useState('');
  const [statementEndDate, setStatementEndDate] = useState('');

  // Payment Receipt Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<{ phone: string; name: string; balance: number } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'zaincash' | 'qicard' | 'bank_transfer' | 'other'>('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState('');

  // Edit Payment Modal State
  const [editingPayment, setEditingPayment] = useState<{
    id: string;
    receiptNumber: string;
    amount: number;
    paymentMethod: string;
    notes: string;
    customerPhone: string;
  } | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Edit Invoice / Order Modal State
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [selectedAddProductId, setSelectedAddProductId] = useState('');
  const [selectedAddSaleType, setSelectedAddSaleType] = useState<'wholesale' | 'retail'>('wholesale');
  const [selectedAddQty, setSelectedAddQty] = useState(1);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);

  const router = useRouter();

  // Check auth and operator profile
  useEffect(() => {
    const auth = localStorage.getItem('etihad_admin_auth');
    if (!auth) {
      router.push('/admin/login');
    } else {
      try {
        const parsed = JSON.parse(auth);
        setCurrentOperator({
          name: parsed.name || parsed.username || 'المحاسب',
          username: parsed.username || 'admin',
          role: parsed.role || 'staff',
        });
      } catch {}
    }
  }, [router]);

  const fetchAccounts = async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const res = await fetch('/api/accounting/accounts', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.accounts) {
        setAccounts(data.accounts);
        setTotalDebt(data.totalMarketDebt || 0);
        setTotalInvoiced(data.totalMarketInvoiced || 0);
        setTotalPaid(data.totalMarketPaid || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  };

  const fetchVaultData = async (isSilent = false) => {
    if (!isSilent) setIsLoadingVault(true);
    try {
      const res = await fetch('/api/accounting/vault', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setVaultSummary(data.summary);
        setVaultMovements(data.movements || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!isSilent) setIsLoadingVault(false);
    }
  };

  const fetchAuditLogs = async (isSilent = false) => {
    if (!isSilent) setIsLoadingAudit(true);
    try {
      let url = '/api/admin/audit?limit=200';
      if (auditCategoryFilter !== 'all') url += `&category=${encodeURIComponent(auditCategoryFilter)}`;
      if (auditSearchQuery.trim()) url += `&search=${encodeURIComponent(auditSearchQuery.trim())}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!isSilent) setIsLoadingAudit(false);
    }
  };

  useEffect(() => {
    fetchAccounts(false);
    fetchVaultData(true);
    fetchAuditLogs(true);

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (activeMainTab === 'accounts') fetchAccounts(true);
      else if (activeMainTab === 'vault') fetchVaultData(true);
      else if (activeMainTab === 'audit') fetchAuditLogs(true);
    }, 30000);

    const handleFocus = () => {
      if (activeMainTab === 'accounts') fetchAccounts(true);
      else if (activeMainTab === 'vault') fetchVaultData(true);
      else if (activeMainTab === 'audit') fetchAuditLogs(true);
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [activeMainTab, auditCategoryFilter]);

  const handleOpenVaultModal = (type: 'inflow' | 'outflow') => {
    setVaultFormType(type);
    setVaultFormCategory(type === 'inflow' ? 'deposit_adjustment' : 'expense');
    setVaultFormAmount('');
    setVaultFormParty('');
    setVaultFormNotes('');
    setIsVaultModalOpen(true);
  };

  const handleSaveVaultMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultFormAmount || Number(vaultFormAmount) <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح');
      return;
    }

    setIsSubmittingVault(true);
    try {
      const catLabels: Record<string, string> = {
        sales_cash: 'مقبوضات مبيعات نقدية',
        debt_collection: 'سند قبض وتحصيل دين',
        driver_settlement: 'تصفية عهدة سائق',
        purchase_payment: 'سداد مشتريات نقدية',
        expense: 'مصروفات تشغيلية ونثرية',
        owner_withdrawal: 'مسحوبات أرباح / المالك',
        deposit_adjustment: 'إيداع وتغذية الصندوق',
      };

      const res = await fetch('/api/accounting/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: vaultFormType,
          category: vaultFormCategory,
          categoryLabel: catLabels[vaultFormCategory] || (vaultFormType === 'inflow' ? 'إيداع نقدي' : 'صرف نقدي'),
          amount: Number(vaultFormAmount),
          partyName: vaultFormParty || (vaultFormType === 'inflow' ? 'تغذية الصندوق' : 'مصروفات عامة'),
          notes: vaultFormNotes,
          operator: currentOperator || { name: 'المحاسب', username: 'accountant' },
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'تم تسجيل حركة الصندوق بنجاح');
        setIsVaultModalOpen(false);
        fetchVaultData();
        fetchAuditLogs(true);
      } else {
        toast.error(data.error || 'فشل تسجيل الحركة');
      }
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmittingVault(false);
    }
  };

  const handleViewStatement = async (phone: string, start?: string, end?: string) => {
    setIsLoadingStatement(true);
    try {
      let url = `/api/accounting/statement?phone=${encodeURIComponent(phone)}`;
      if (start) url += `&startDate=${encodeURIComponent(start)}`;
      if (end) url += `&endDate=${encodeURIComponent(end)}`;

      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.statement) {
        setSelectedStatement(data.statement);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingStatement(false);
    }
  };

  const handleOpenStatement = (phone: string) => {
    setStatementStartDate('');
    setStatementEndDate('');
    handleViewStatement(phone, undefined, undefined);
  };

  // Auto-open statement and apply search filter if navigated with query params
  useEffect(() => {
    const paramPhone = searchParams.get('openPhone') || searchParams.get('phone');
    const paramSearch = searchParams.get('search');

    if (paramPhone) {
      setSearchQuery(paramPhone);
      handleOpenStatement(paramPhone);
    } else if (paramSearch) {
      setSearchQuery(paramSearch);
    }
  }, [searchParams]);

  const handleApplyDateFilter = () => {
    if (!selectedStatement) return;
    handleViewStatement(selectedStatement.customer.phone, statementStartDate || undefined, statementEndDate || undefined);
  };

  const handleResetDateFilter = () => {
    if (!selectedStatement) return;
    setStatementStartDate('');
    setStatementEndDate('');
    handleViewStatement(selectedStatement.customer.phone, undefined, undefined);
  };

  const handleQuickDateFilter = (preset: 'all' | 'today' | 'week' | 'month') => {
    if (!selectedStatement) return;
    const today = new Date();
    const formatDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    if (preset === 'all') {
      setStatementStartDate('');
      setStatementEndDate('');
      handleViewStatement(selectedStatement.customer.phone, undefined, undefined);
    } else if (preset === 'today') {
      const t = formatDate(today);
      setStatementStartDate(t);
      setStatementEndDate(t);
      handleViewStatement(selectedStatement.customer.phone, t, t);
    } else if (preset === 'week') {
      const past = new Date(today);
      past.setDate(past.getDate() - 7);
      const start = formatDate(past);
      const end = formatDate(today);
      setStatementStartDate(start);
      setStatementEndDate(end);
      handleViewStatement(selectedStatement.customer.phone, start, end);
    } else if (preset === 'month') {
      const start = formatDate(new Date(today.getFullYear(), today.getMonth(), 1));
      const end = formatDate(today);
      setStatementStartDate(start);
      setStatementEndDate(end);
      handleViewStatement(selectedStatement.customer.phone, start, end);
    }
  };

  // Open Payment Modal
  const handleOpenPayment = (phone: string, name: string, balance: number) => {
    setPaymentTarget({ phone, name, balance });
    setPaymentAmount(balance > 0 ? String(balance) : '');
    setPaymentNotes('');
    setPaymentSuccessMessage('');
    setIsPaymentModalOpen(true);
  };

  // Submit Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTarget || !paymentAmount || Number(paymentAmount) <= 0) return;

    setIsSubmittingPayment(true);
    try {
      const res = await fetch('/api/accounting/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerPhone: paymentTarget.phone,
          customerName: paymentTarget.name,
          amount: Number(paymentAmount),
          paymentMethod,
          notes: paymentNotes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setPaymentSuccessMessage(`تم تسجيل سند القبض رقم #${data.payment.receiptNumber} بمبلغ ${Number(paymentAmount).toLocaleString()} د.ع بنجاح!`);
        fetchAccounts();
        if (selectedStatement && selectedStatement.customer.phone.replace(/\D/g, '') === paymentTarget.phone.replace(/\D/g, '')) {
          handleViewStatement(paymentTarget.phone, statementStartDate, statementEndDate);
        }
        setTimeout(() => {
          setIsPaymentModalOpen(false);
        }, 1200);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Open Edit Payment Modal
  const handleOpenEditPayment = (tx: AccountTransaction) => {
    if (!selectedStatement) return;
    setEditingPayment({
      id: tx.referenceId || '',
      receiptNumber: tx.referenceNumber,
      amount: tx.credit,
      paymentMethod: tx.paymentMethod || 'cash',
      notes: tx.notes || '',
      customerPhone: selectedStatement.customer.phone,
    });
  };

  // Submit Payment Edit
  const handleSavePaymentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment || !selectedStatement) return;

    setIsSubmittingEdit(true);
    try {
      const res = await fetch('/api/accounting/payments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingPayment.id,
          amount: Number(editingPayment.amount),
          paymentMethod: editingPayment.paymentMethod,
          notes: editingPayment.notes,
          customerPhone: editingPayment.customerPhone,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingPayment(null);
        fetchAccounts();
        handleViewStatement(selectedStatement.customer.phone, statementStartDate, statementEndDate);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Delete Payment
  const handleDeletePayment = async (tx: AccountTransaction) => {
    if (!selectedStatement || !tx.referenceId) return;
    if (!confirm(`هل أنت متأكد من حذف سند القبض رقم #${tx.referenceNumber} بمبلغ ${tx.credit.toLocaleString()} د.ع؟\nسيتم إعادة احتساب الرصيد المتبقي فوراً.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/accounting/payments?id=${encodeURIComponent(tx.referenceId)}&phone=${encodeURIComponent(selectedStatement.customer.phone)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchAccounts();
        handleViewStatement(selectedStatement.customer.phone, statementStartDate, statementEndDate);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Open Edit Invoice Directly
  const handleOpenEditOrder = async (orderIdOrNumber: string) => {
    setIsLoadingOrder(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderIdOrNumber)}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.order) {
        setEditingOrder(data.order);
        // Load products if not loaded
        if (productsList.length === 0) {
          const prodRes = await fetch('/api/products');
          const prodData = await prodRes.json();
          if (prodData.success && prodData.products) {
            setProductsList(prodData.products);
          }
        }
      } else {
        alert(data.error || 'تعذر جلب تفاصيل الفاتورة');
      }
    } catch (err) {
      alert('حدث خطأ أثناء تحميل الفاتورة');
    } finally {
      setIsLoadingOrder(false);
    }
  };

  // Update Item Quantity in Invoice
  const handleUpdateItemQty = (index: number, newQty: number) => {
    if (!editingOrder) return;
    const items = [...editingOrder.items];
    if (newQty <= 0) {
      items.splice(index, 1);
    } else {
      items[index] = { ...items[index], quantity: newQty };
    }
    const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const total = Math.max(0, subtotal + (editingOrder.deliveryFee || 0) - (editingOrder.discount || 0));
    setEditingOrder({ ...editingOrder, items, subtotal, total });
  };

  // Update Item Unit Price in Invoice
  const handleUpdateItemPrice = (index: number, newPrice: number) => {
    if (!editingOrder) return;
    const items = [...editingOrder.items];
    items[index] = { ...items[index], price: Math.max(0, newPrice) };
    const subtotal = items.reduce((sum, it) => sum + items[index].price * it.quantity, 0);
    const total = Math.max(0, subtotal + (editingOrder.deliveryFee || 0) - (editingOrder.discount || 0));
    setEditingOrder({ ...editingOrder, items, subtotal, total });
  };

  // Remove Item from Invoice
  const handleRemoveItem = (index: number) => {
    if (!editingOrder) return;
    const items = [...editingOrder.items];
    items.splice(index, 1);
    const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const total = Math.max(0, subtotal + (editingOrder.deliveryFee || 0) - (editingOrder.discount || 0));
    setEditingOrder({ ...editingOrder, items, subtotal, total });
  };

  // Add Product to Invoice
  const handleAddItemToOrder = () => {
    if (!editingOrder || !selectedAddProductId) return;
    const prod = productsList.find((p) => p.id === selectedAddProductId);
    if (!prod) return;

    const unitPrice = selectedAddSaleType === 'wholesale' ? prod.wholesalePrice : prod.price;
    const newItem: OrderItem = {
      productId: prod.id,
      name: prod.name,
      price: unitPrice,
      quantity: selectedAddQty > 0 ? selectedAddQty : 1,
      image: prod.images?.[0] || '',
      saleType: selectedAddSaleType,
      unitLabel: selectedAddSaleType === 'wholesale' ? (prod.wholesaleUnit || 'كرتون') : (prod.retailUnit || 'قطعة'),
    };

    const items = [...editingOrder.items, newItem];
    const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const total = Math.max(0, subtotal + (editingOrder.deliveryFee || 0) - (editingOrder.discount || 0));
    setEditingOrder({ ...editingOrder, items, subtotal, total });
    setSelectedAddProductId('');
    setSelectedAddQty(1);
  };

  // Save Order Edits
  const handleSaveOrderEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    if (editingOrder.items.length === 0) {
      alert('يجب أن تحتوي الفاتورة على صنف واحد على الأقل، أو قم بحذف الفاتورة بالكامل');
      return;
    }

    setIsSavingOrder(true);
    try {
      const subtotal = editingOrder.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
      const total = Math.max(0, subtotal + (editingOrder.deliveryFee || 0) - (editingOrder.discount || 0));

      const res = await fetch(`/api/orders/${editingOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: editingOrder.items,
          deliveryFee: editingOrder.deliveryFee || 0,
          discount: editingOrder.discount || 0,
          notes: editingOrder.notes || '',
          status: editingOrder.status,
          subtotal,
          total,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setEditingOrder(null);
        fetchAccounts();
        if (selectedStatement) {
          handleViewStatement(selectedStatement.customer.phone, statementStartDate, statementEndDate);
        }
        alert('تم تعديل الفاتورة وتحديث المخزون وكشف الحساب بنجاح ✓');
      } else {
        alert(data.error || 'فشل حفظ التعديل');
      }
    } catch (err) {
      alert('حدث خطأ أثناء حفظ تعديل الفاتورة');
    } finally {
      setIsSavingOrder(false);
    }
  };

  // Delete Invoice Directly
  const handleDeleteOrder = async (orderIdOrNumber: string, orderNumber: string) => {
    const isConfirmed = await confirm({
      title: 'حذف الفاتورة بالكامل',
      message: `هل أنت متأكد من حذف الفاتورة رقم #${orderNumber} بالكامل؟\nسيتم استرجاع كافة المواد إلى المخزن وإلغاء قيمتها من كشف حساب العميل فوراً.`,
      confirmText: 'نعم، احذف الفاتورة',
      cancelText: 'تراجع',
      type: 'danger',
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderIdOrNumber)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setEditingOrder(null);
        fetchAccounts();
        if (selectedStatement) {
          handleViewStatement(selectedStatement.customer.phone, statementStartDate, statementEndDate);
        }
        toast.success('تم حذف الفاتورة واسترجاع المواد للمخزن وتحديث كشف الحساب بنجاح ✓');
      } else {
        toast.error(data.error || 'فشل حذف الفاتورة');
      }
    } catch (err) {
      toast.error('حدث خطأ أثناء حذف الفاتورة');
    }
  };

  const filteredAccounts = accounts.filter(acc => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery = acc.name.toLowerCase().includes(q) ||
      acc.phone.includes(q) ||
      (acc.businessName && acc.businessName.toLowerCase().includes(q)) ||
      (acc.city && acc.city.toLowerCase().includes(q));

    if (!matchesQuery) return false;

    if (filterMode === 'debtors') return acc.remainingBalance > 0;
    if (filterMode === 'settled') return acc.remainingBalance <= 0;
    return true;
  });

  return (
    <div className="space-y-6 text-xs">
        
      {/* 3 TOP NAVIGATION TABS */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-200/70 backdrop-blur-xs rounded-2xl max-w-fit shadow-inner no-print print:hidden">
        <button
          type="button"
          onClick={() => setActiveMainTab('accounts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition cursor-pointer ${
            activeMainTab === 'accounts'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <FileText className="w-4 h-4 text-brand-blue" />
          <span>أستاذ حسابات الزبائن والديون</span>
          <span className="bg-brand-blue/10 text-brand-blue text-[10px] font-mono px-2 py-0.5 rounded-md font-bold">
            {accounts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveMainTab('vault');
            fetchVaultData();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition cursor-pointer ${
            activeMainTab === 'vault'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Wallet className="w-4 h-4 text-emerald-600" />
          <span>صندوق النقدية (حساب 181) 💵</span>
          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-mono px-2 py-0.5 rounded-md font-bold">
            {(vaultSummary?.currentBalance ?? 0).toLocaleString()} د.ع
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveMainTab('audit');
            fetchAuditLogs();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition cursor-pointer ${
            activeMainTab === 'audit'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-purple-600" />
          <span>سجل الرقابة وتدقيق الموظفين 🛡️</span>
          <span className="bg-purple-100 text-purple-800 text-[10px] font-mono px-2 py-0.5 rounded-md font-bold">
            Audit Log
          </span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: CUSTOMER DEBTS & ACCOUNTS (أستاذ حسابات الزبائن والديون)
          ========================================================================= */}
      {activeMainTab === 'accounts' && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          
          {/* KPI Financial Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 no-print print:hidden">
            
            {/* 1. Total Debt in Market */}
            <div className="bg-gradient-to-br from-[#ef533a] to-[#d03b24] text-white p-5 rounded-3xl shadow-sm space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-white/90">
                <span>إجمالي الديون المطلوبة بالسوق</span>
                <AlertCircle className="w-4 h-4 text-white" />
              </div>
              <div className="text-2xl font-black font-mono">
                {totalDebt.toLocaleString()} <span className="text-xs font-bold font-sans">د.ع</span>
              </div>
              <p className="text-[10px] text-white/80 font-bold">
                مبالغ متبقية بذمة العملاء والماركتات
              </p>
            </div>

            {/* 2. Total Invoiced */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 font-bold">
                <span>إجمالي مبيعات السوق المسجلة</span>
                <Receipt className="w-4 h-4 text-brand-blue" />
              </div>
              <div className="text-2xl font-black font-mono text-slate-900">
                {totalInvoiced.toLocaleString()} <span className="text-xs font-bold font-sans text-slate-500">د.ع</span>
              </div>
              <p className="text-[10px] text-slate-400 font-bold">
                إجمالي قيمة الطلبيات غير الملغاة
              </p>
            </div>

            {/* 3. Total Collected */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 font-bold">
                <span>إجمالي المبالغ المسددة</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black font-mono text-emerald-700">
                {totalPaid.toLocaleString()} <span className="text-xs font-bold font-sans text-emerald-600">د.ع</span>
              </div>
              <p className="text-[10px] text-emerald-600 font-bold">
                المبالغ المحصلة بسندات القبض
              </p>
            </div>

            {/* 4. Total Accounts */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 font-bold">
                <span>عدد حسابات العملاء</span>
                <Store className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-2xl font-black font-mono text-purple-900">
                {accounts.length} <span className="text-xs font-bold font-sans text-slate-500">حساب</span>
              </div>
              <p className="text-[10px] text-slate-400 font-bold">
                تجار معتمدين وزبائن مباشرين
              </p>
            </div>

          </div>

          {/* Main Ledger Table Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5 no-print print:hidden">
            
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-brand-blue" />
                  <span>أستاذ حسابات العملاء والديون 📖</span>
                </h2>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                  متابعة أرصدة كل عميل، كشوفات الحساب اللحظية، وتوثيق سندات القبض
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Filter Pills */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                      filterMode === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    الكل ({accounts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('debtors')}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                      filterMode === 'debtors' ? 'bg-[#ef533a] text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    مطلوبين ديون ({accounts.filter(a => a.remainingBalance > 0).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('settled')}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                      filterMode === 'settled' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    مسددين بالكامل ({accounts.filter(a => a.remainingBalance <= 0).length})
                  </button>
                </div>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
              <input
                type="text"
                placeholder="ابحث باسم الزبون، الماركت، رقم الهاتف، أو المدينة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pr-10 pl-4 py-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-blue"
              />
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-black text-[11px]">
                    <th className="py-3 px-4">العميل / الماركت</th>
                    <th className="py-3 px-4">رقم الهاتف والمدينة</th>
                    <th className="py-3 px-4">نوع الحساب</th>
                    <th className="py-3 px-4">إجمالي المسحوبات</th>
                    <th className="py-3 px-4">المسدد والمدفوع</th>
                    <th className="py-3 px-4">الرصيد المتبقي (المطلوب)</th>
                    <th className="py-3 px-4">حالة الحساب</th>
                    <th className="py-3 px-4 text-center">إجراءات الحساب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                        <div className="w-6 h-6 border-2 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <span>جاري تحميل السجلات المحاسبية...</span>
                      </td>
                    </tr>
                  ) : filteredAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                        <span>لا توجد حسابات تطابق معايير البحث</span>
                      </td>
                    </tr>
                  ) : (
                    filteredAccounts.map((acc) => {
                      const isDebtor = acc.remainingBalance > 0;

                      return (
                        <tr key={acc.phone} className="hover:bg-slate-50/80 transition text-[11px]">
                          <td className="py-3 px-4">
                            <div className="font-black text-slate-900 flex items-center gap-1.5">
                              <span>{acc.businessName || acc.name}</span>
                              {acc.businessName && (
                                <span className="text-[10px] font-bold text-slate-400">({acc.name})</span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-mono text-slate-600 font-bold" dir="ltr">{acc.phone}</div>
                            <div className="text-[10px] text-slate-400">{acc.city || 'العراق'}</div>
                          </td>

                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md text-[10px] ${
                              acc.accountType === 'تاجر / ماركت' 
                                ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {acc.accountType}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-mono font-bold text-slate-800">
                            {acc.totalInvoiced.toLocaleString()} د.ع
                            <div className="text-[10px] text-slate-400 font-sans">{acc.ordersCount} طلبية</div>
                          </td>

                          <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                            {acc.totalPaid.toLocaleString()} د.ع
                            <div className="text-[10px] text-slate-400 font-sans">{acc.paymentsCount || 0} دفعة</div>
                          </td>

                          <td className="py-3 px-4 font-mono font-black">
                            <span className={`px-2 py-1 rounded-lg ${
                              isDebtor 
                                ? 'bg-red-50 text-[#ef533a] border border-red-200' 
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {acc.remainingBalance.toLocaleString()} د.ع
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            {isDebtor ? (
                              <span className="inline-flex items-center gap-1 bg-red-100 text-[#ef533a] text-[10px] font-bold px-2 py-0.5 rounded-md">
                                <AlertCircle className="w-3 h-3" />
                                <span>مطلوب دين</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>مسدد بالكامل</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Open Payment Receipt Modal Button */}
                              <button
                                onClick={() => handleOpenPayment(acc.phone, acc.businessName || acc.name, acc.remainingBalance)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-xl transition flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                                title="تسجيل سند قبض واستلام دفعة مالية"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>سند قبض 💵</span>
                              </button>

                              {/* View Statement Button */}
                              <button
                                onClick={() => handleOpenStatement(acc.phone)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-1.5 px-3 rounded-xl transition flex items-center gap-1 cursor-pointer"
                                title="عرض كشف الحساب التفصيلي والطباعة"
                              >
                                <FileText className="w-3.5 h-3.5 text-brand-blue" />
                                <span>كشف الحساب 📄</span>
                              </button>
                            </div>
                          </td>

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      )}

      {/* =========================================================================
          TAB 2: CASH VAULT (صندوق النقدية - حساب 181)
          ========================================================================= */}
      {activeMainTab === 'vault' && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          
          {/* Vault KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* 1. Current Balance in Safe */}
            <div className="bg-gradient-to-br from-emerald-600 to-teal-800 text-white p-5 rounded-3xl shadow-sm space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-100">
                <span>الرصيد الفعلي الحالي بالصندوق (181)</span>
                <Wallet className="w-5 h-5 text-emerald-200" />
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono">
                {(vaultSummary?.currentBalance ?? 0).toLocaleString()} <span className="text-xs font-bold font-sans">د.ع</span>
              </div>
              <p className="text-[11px] text-emerald-100/90 font-bold">
                النقدية الحاضرة بالخزينة الرئيسية للمتجر
              </p>
            </div>

            {/* 2. Total Inflows / Collections */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-slate-500 font-bold">
                <span>إجمالي المقبوضات والإيداعات (داخل)</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ArrowDownRight className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black font-mono text-emerald-700">
                {(vaultSummary?.totalInflowAllTime ?? 0).toLocaleString()} <span className="text-xs font-bold font-sans text-slate-500">د.ع</span>
              </div>
              <p className="text-[11px] text-slate-400 font-bold">
                مبيعات نقدية + تحصيلات زبائن + تصفيات سواق
              </p>
            </div>

            {/* 3. Total Outflows / Expenses */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-slate-500 font-bold">
                <span>إجمالي المصروفات والمدفوعات (خارج)</span>
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black font-mono text-rose-700">
                {(vaultSummary?.totalOutflowAllTime ?? 0).toLocaleString()} <span className="text-xs font-bold font-sans text-slate-500">د.ع</span>
              </div>
              <p className="text-[11px] text-slate-400 font-bold">
                مصاريف تشغيلية + سداد شركات مجهزة + مسحوبات
              </p>
            </div>

          </div>

          {/* Action Bar & Controls */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleOpenVaultModal('inflow')}
                className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2.5 rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إيداع وتغذية الصندوق 💵</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenVaultModal('outflow')}
                className="flex-1 sm:flex-initial bg-rose-600 hover:bg-rose-700 text-white font-black px-4 py-2.5 rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Minus className="w-4 h-4" />
                <span>صرف / تسجيل مصروف 📤</span>
              </button>
            </div>

            <div className="relative w-full sm:w-80">
              <input
                type="text"
                value={vaultSearchQuery}
                onChange={(e) => setVaultSearchQuery(e.target.value)}
                placeholder="ابحث برقم السند، الطرف، أو البيان..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pr-9 pl-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-brand-blue"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>

          </div>

          {/* Vault Movements Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>سجل وحركات صندوق النقدية (حساب 181)</span>
              </h3>
              <span className="text-xs font-mono font-bold text-slate-400">
                {vaultMovements.length} حركة مسجلة
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-100 font-black text-[11px]">
                  <tr className="divide-x divide-x-reverse divide-slate-100">
                    <th className="py-3 px-4">رقم الحركة</th>
                    <th className="py-3 px-4">التاريخ والوقت</th>
                    <th className="py-3 px-4">نوع الحركة والتصنيف</th>
                    <th className="py-3 px-4">الطرف المعني</th>
                    <th className="py-3 px-4">البيان والتفاصيل</th>
                    <th className="py-3 px-4 text-center">المبلغ (د.ع)</th>
                    <th className="py-3 px-4 text-center">المسؤول والموثق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold">
                  {vaultMovements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 space-y-2">
                        <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mx-auto text-xl">
                          💵
                        </div>
                        <p className="font-black text-slate-600">لا توجد حركات مسجلة بالصندوق بعد</p>
                        <p className="text-[11px] text-slate-400">
                          استخدم أزرار "إيداع" أو "صرف" أعلاه لتسجيل وتوثيق الحركات النقدية.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    vaultMovements
                      .filter((m) => {
                        if (!vaultSearchQuery) return true;
                        const q = vaultSearchQuery.toLowerCase();
                        return (
                          (m.transactionNumber && m.transactionNumber.toLowerCase().includes(q)) ||
                          (m.partyName && m.partyName.toLowerCase().includes(q)) ||
                          (m.notes && m.notes.toLowerCase().includes(q)) ||
                          (m.categoryLabel && m.categoryLabel.toLowerCase().includes(q))
                        );
                      })
                      .map((m) => {
                        const isInflow = m.type === 'inflow';
                        return (
                          <tr key={m.id} className="hover:bg-slate-50/80 transition divide-x divide-x-reverse divide-slate-100">
                            <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                              #{m.transactionNumber || m.id.slice(-6)}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500">
                              {new Date(m.date).toLocaleString('ar-IQ')}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-1 rounded-xl text-[11px] font-black inline-flex items-center gap-1 ${
                                  isInflow
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                                }`}
                              >
                                {isInflow ? '⬇️ إيداع / قبض' : '⬆️ صرف / مدفوعات'} • {m.categoryLabel || m.category}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-black text-slate-900 whitespace-nowrap">
                              {m.partyName || '-'}
                            </td>
                            <td className="py-3 px-4 max-w-xs text-slate-700">
                              {m.notes || '-'}
                            </td>
                            <td className="py-3 px-4 text-center whitespace-nowrap font-mono font-black">
                              <span className={isInflow ? 'text-emerald-700' : 'text-rose-700'}>
                                {isInflow ? '+' : '-'} {m.amount.toLocaleString()} د.ع
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center whitespace-nowrap font-mono text-[11px] text-slate-500">
                              {m.performedBy?.name || 'مدير النظام'}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      )}

      {/* =========================================================================
          TAB 3: AUDIT LOG (سجل الرقابة وتدقيق الموظفين)
          ========================================================================= */}
      {activeMainTab === 'audit' && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-purple-600" />
              <h3 className="font-black text-sm text-slate-900">
                سجل الرقابة والتدقيق المالي الشامل (Audit Trail)
              </h3>
              <span className="bg-purple-100 text-purple-800 font-mono text-xs px-2 py-0.5 rounded-lg font-bold">
                {auditLogs.length} سجل
              </span>
            </div>

            <div className="relative w-full sm:w-80">
              <input
                type="text"
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
                placeholder="ابحث بالموظف، الإجراء، أو التفاصيل..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pr-9 pl-3 text-xs font-bold text-slate-900 focus:outline-none focus:border-purple-600"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-100 font-black text-[11px]">
                  <tr className="divide-x divide-x-reverse divide-slate-100">
                    <th className="py-3 px-4">التاريخ والوقت</th>
                    <th className="py-3 px-4">الموظف / المسؤول</th>
                    <th className="py-3 px-4">نوع الإجراء</th>
                    <th className="py-3 px-4">التفاصيل والبيان المالي</th>
                    <th className="py-3 px-4 text-center">المبلغ المتأثر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 space-y-2">
                        <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mx-auto text-xl">
                          🛡️
                        </div>
                        <p className="font-black text-slate-600">لا توجد سجلات تدقيق بعد</p>
                        <p className="text-[11px] text-slate-400">
                          كافة عمليات القبض، الصرف، وتعديل الفواتير سيتم توثيقها هنا آلياً وبشكل غير قابل للتلاعب.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    auditLogs
                      .filter((log) => {
                        if (!auditSearchQuery) return true;
                        const q = auditSearchQuery.toLowerCase();
                        return (
                          (log.operator?.name && log.operator.name.toLowerCase().includes(q)) ||
                          (log.actionLabel && log.actionLabel.toLowerCase().includes(q)) ||
                          (log.actionType && log.actionType.toLowerCase().includes(q)) ||
                          (log.details && log.details.toLowerCase().includes(q))
                        );
                      })
                      .map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/80 transition divide-x divide-x-reverse divide-slate-100">
                          <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500">
                            {new Date(log.timestamp).toLocaleString('ar-IQ')}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap font-black text-slate-900">
                            <span className="bg-slate-100 px-2.5 py-1 rounded-xl text-slate-800 border border-slate-200">
                              👤 {log.operator?.name || 'المحاسب'}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="bg-purple-50 text-purple-800 border border-purple-200 px-2.5 py-1 rounded-xl text-[11px] font-bold">
                              {log.actionLabel || log.actionType}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            {log.details || log.target?.name || '-'}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-black text-slate-900 whitespace-nowrap">
                            {log.financialImpact?.amount ? `${log.financialImpact.amount.toLocaleString()} د.ع` : '-'}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* MODAL 1: RECORD PAYMENT RECEIPT VOUCHER */}
      {isPaymentModalOpen && paymentTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 text-xs animate-in zoom-in-95">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-600" />
                <span>تسجيل سند قبض / دفعة نقدية 💵</span>
              </h3>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Info */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
              <div className="flex justify-between font-bold">
                <span className="text-slate-500">اسم العميل:</span>
                <span className="text-slate-900">{paymentTarget.name}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-slate-500">رقم الهاتف:</span>
                <span className="text-slate-900 font-mono" dir="ltr">{paymentTarget.phone}</span>
              </div>
              <div className="flex justify-between font-bold pt-1 border-t border-slate-200">
                <span className="text-slate-500">الرصيد المدين المتبقي:</span>
                <span className="text-[#e0452c] font-mono font-black">{paymentTarget.balance.toLocaleString()} د.ع</span>
              </div>
            </div>

            {paymentSuccessMessage && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-2xl font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{paymentSuccessMessage}</span>
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="space-y-3.5">
              
              <div className="space-y-1">
                <label className="font-black text-slate-800 block">المبلغ المقبوض (د.ع) *:</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="مثال: 50000"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-sm font-black font-mono text-slate-900 focus:bg-white focus:border-emerald-600"
                />
              </div>

              <div className="space-y-1">
                <label className="font-black text-slate-800 block">طريقة القبض والدفع:</label>
                <select
                  value={paymentMethod}
                  onChange={(e: any) => setPaymentMethod(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-600"
                >
                  <option value="cash">💵 نقداً (كاش للمندوب/المحل)</option>
                  <option value="zaincash">📱 زين كاش (Zain Cash)</option>
                  <option value="qicard">💳 ماستركارد / كي كارد (Qi Card)</option>
                  <option value="bank_transfer">🏦 حوالة مصرفية / مكتب صرافة</option>
                  <option value="other">📝 أخرى</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-black text-slate-800 block">ملاحظات أو رقم الحوالة (اختياري):</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="مثال: تسديد دفعة الفاتورة نقداً مع المندوب"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 rounded-xl transition shadow-md flex items-center justify-center gap-1.5"
                >
                  {isSubmittingPayment ? 'جاري الحفظ...' : 'تأكيد وحفظ السند ✓'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* MODAL 2: DETAILED STATEMENT VIEW & CLEAN PRINT LAYOUT */}
      {selectedStatement && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto print:static print:p-0 print:m-0 print:bg-transparent statement-modal-overlay">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full p-6 space-y-4 text-xs my-8 max-h-[90vh] flex flex-col print:max-h-none print:shadow-none print:border-none print:p-0 print:my-0 print:w-full statement-modal-card">
            
            {/* Modal Screen Top Bar (Hidden on Print) */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 no-print print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-blue" />
                <h3 className="text-base font-black text-slate-900">
                  كشف حساب العميل والتحكم بالحركات
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-brand-blue hover:bg-brand-blueDark text-white font-bold py-1.5 px-3.5 rounded-xl transition flex items-center gap-1.5 shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الكشف النظيف 🖨️</span>
                </button>
                <button
                  onClick={() => setSelectedStatement(null)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* DATE RANGE FILTER BAR (Hidden on Print) */}
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-2.5 no-print print:hidden">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4 text-brand-blue" />
                  <span className="font-bold text-slate-700 text-xs">الفترة:</span>
                </div>

                {/* Quick Presets */}
                <button
                  type="button"
                  onClick={() => handleQuickDateFilter('all')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                    !statementStartDate && !statementEndDate
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  كل الحركات 🔄
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickDateFilter('today')}
                  className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  اليوم 📅
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickDateFilter('week')}
                  className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  آخر 7 أيام 🗓️
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickDateFilter('month')}
                  className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  هذا الشهر 📊
                </button>

                {/* Manual Clean Text/Date Inputs */}
                <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1 shadow-2xs">
                  <span className="text-slate-500 font-bold text-xs">من:</span>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="2026-08-01"
                    value={statementStartDate}
                    onChange={(e) => setStatementStartDate(e.target.value)}
                    className="w-24 text-xs font-bold font-mono text-slate-800 text-center focus:outline-none bg-transparent"
                  />
                  <input
                    type="date"
                    value={statementStartDate}
                    onChange={(e) => setStatementStartDate(e.target.value)}
                    className="w-4 h-4 opacity-70 cursor-pointer"
                    title="اختيار من التقويم"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1 shadow-2xs">
                  <span className="text-slate-500 font-bold text-xs">إلى:</span>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="2026-08-24"
                    value={statementEndDate}
                    onChange={(e) => setStatementEndDate(e.target.value)}
                    className="w-24 text-xs font-bold font-mono text-slate-800 text-center focus:outline-none bg-transparent"
                  />
                  <input
                    type="date"
                    value={statementEndDate}
                    onChange={(e) => setStatementEndDate(e.target.value)}
                    className="w-4 h-4 opacity-70 cursor-pointer"
                    title="اختيار من التقويم"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleApplyDateFilter}
                  className="bg-brand-blue hover:bg-brand-blueDark text-white font-bold px-3 py-1.5 rounded-xl transition shadow-xs cursor-pointer text-xs"
                >
                  تطبيق 🔍
                </button>
              </div>

              {isLoadingStatement && (
                <span className="text-brand-blue font-bold text-xs animate-pulse">جاري تحديث الحركات...</span>
              )}
            </div>

            {/* CLEAN OFFICIAL STATEMENT DOCUMENT (Formatted for Screen & Print) */}
            <div id="printable-statement-sheet" className="space-y-4 print:p-0 relative overflow-y-auto max-h-[calc(88vh-140px)] print:max-h-none print:overflow-visible pr-1">
              
              {/* Subtle Watermark Logo for A4 Paper & Screen */}
              <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center opacity-[0.045] z-0">
                <div className="w-80 h-80 flex items-center justify-center scale-125">
                  <EtihadLogo size="lg" />
                </div>
              </div>

              <div className="relative z-10 space-y-4">
                
                {/* Clean Official Header */}
                <div className="flex items-center justify-between border-b border-slate-300 pb-3">
                  <div>
                    <EtihadLogo size="sm" />
                    <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                      سوق الجملة لتجارة المواد الغذائية والسناكات 🇮🇶
                    </p>
                  </div>
                  <div className="text-left font-mono">
                    <span className="text-sm font-black text-slate-900 block font-sans">كشف حساب مالي 📄</span>
                    <span className="text-[11px] text-slate-600">التاريخ: {new Date().toLocaleDateString('ar-IQ')}</span>
                    {(statementStartDate || statementEndDate) && (
                      <span className="text-[10px] text-brand-blue font-bold block">
                        الفترة: {statementStartDate || 'البداية'} إلى {statementEndDate || 'الآن'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Customer Minimal Info Strip */}
                <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">اسم العميل:</span>
                    <span className="font-black text-slate-900">{selectedStatement.customer.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">رقم الهاتف:</span>
                    <span className="font-bold text-slate-800 font-mono" dir="ltr">{selectedStatement.customer.phone}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">المتجر / الماركت:</span>
                    <span className="font-bold text-emerald-800">{selectedStatement.customer.businessName || 'عميل تجاري'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">المدينة:</span>
                    <span className="font-bold text-slate-800">{selectedStatement.customer.city || 'العراق'}</span>
                  </div>
                </div>

                {/* Simplified 3-Box Financial Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-right">
                    <span className="text-[10px] text-slate-500 font-bold block">
                      {statementStartDate || statementEndDate ? 'مشتريات الفترة' : 'إجمالي المشتريات (المدين)'}
                    </span>
                    <span className="text-sm sm:text-base font-black font-mono text-slate-900">
                      {selectedStatement.summary.totalInvoiced.toLocaleString()} د.ع
                    </span>
                  </div>

                  <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200 text-right">
                    <span className="text-[10px] text-emerald-800 font-bold block">
                      {statementStartDate || statementEndDate ? 'مسدد الفترة' : 'إجمالي المسدد (الدائن)'}
                    </span>
                    <span className="text-sm sm:text-base font-black font-mono text-emerald-700">
                      {selectedStatement.summary.totalPaid.toLocaleString()} د.ع
                    </span>
                  </div>

                  <div className={`p-2.5 rounded-xl border text-right ${
                    selectedStatement.summary.remainingBalance > 0
                      ? 'bg-red-50/80 border-red-200'
                      : 'bg-emerald-50 border-emerald-200'
                  }`}>
                    <span className="text-[10px] font-bold block text-slate-700">الرصيد المتبقي (المطلوب)</span>
                    <span className={`text-sm sm:text-base font-black font-mono ${
                      selectedStatement.summary.remainingBalance > 0 ? 'text-[#e0452c]' : 'text-emerald-700'
                    }`}>
                      {selectedStatement.summary.remainingBalance.toLocaleString()} د.ع
                    </span>
                  </div>
                </div>

                {/* Clean Minimal Statement Table with Fixed Layout & Responsive Scroll */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs print:border print:border-slate-300 print:rounded-none print:shadow-none">
                  <div className="overflow-x-auto print:overflow-visible">
                    <table className="w-full text-right text-xs min-w-[700px] print:min-w-0 print:w-full print:table-fixed">
                      <thead className="bg-slate-100 text-slate-700 text-[11px] font-black border-b border-slate-200">
                        <tr className="divide-x divide-x-reverse divide-slate-200">
                          <th className="py-2.5 px-3 w-8 text-center print:w-[6%]">#</th>
                          <th className="py-2.5 px-3 w-28 text-center print:w-[15%]">التاريخ</th>
                          <th className="py-2.5 px-3 w-32 print:w-[18%]">رقم الحركة</th>
                          <th className="py-2.5 px-3 print:w-[22%]">نوع الحركة</th>
                          <th className="py-2.5 px-3 w-28 text-left print:w-[13%]">مدين (مشتريات)</th>
                          <th className="py-2.5 px-3 w-28 text-left print:w-[13%]">دائن (مسدد)</th>
                          <th className="py-2.5 px-3 w-28 text-left print:w-[13%]">الرصيد</th>
                          <th className="py-2.5 px-3 w-28 text-center no-print print:hidden">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {selectedStatement.transactions.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-slate-400 font-bold">
                              لا توجد حركات مسجلة خلال الفترة الزمنية المحددة
                            </td>
                          </tr>
                        ) : (
                          selectedStatement.transactions.map((tx, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/80 transition divide-x divide-x-reverse divide-slate-100">
                              <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px] text-center">{idx + 1}</td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 text-center whitespace-nowrap">
                                {new Date(tx.date).toLocaleDateString('en-GB')}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold whitespace-nowrap text-slate-900" dir="ltr">
                                #{tx.referenceNumber}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-block ${
                                  tx.type === 'invoice' ? 'bg-blue-50 text-brand-blue border border-blue-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                }`}>
                                  {tx.type === 'invoice' ? '📦 فاتورة مبيعات' : '💵 سند قبض'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-left font-mono font-bold whitespace-nowrap text-slate-900">
                                {tx.debit > 0 ? `${tx.debit.toLocaleString()} د.ع` : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700 whitespace-nowrap">
                                {tx.credit > 0 ? `${tx.credit.toLocaleString()} د.ع` : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-left font-mono font-black whitespace-nowrap">
                                <span className={tx.balance > 0 ? 'text-[#e0452c]' : 'text-emerald-700'}>
                                  {tx.balance.toLocaleString()} د.ع
                                </span>
                              </td>

                              {/* Transaction Row Controls (Hidden on Print) */}
                              <td className="py-2.5 px-3 text-center whitespace-nowrap no-print print:hidden">
                                {tx.type === 'payment' ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => handleOpenEditPayment(tx)}
                                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-1.5 rounded-lg border border-slate-200 transition"
                                      title="تعديل سند القبض"
                                    >
                                      <Edit2 className="w-3.5 h-3.5 text-brand-blue" />
                                    </button>
                                    <button
                                      onClick={() => handleDeletePayment(tx)}
                                      className="bg-red-50 hover:bg-red-100 text-red-600 p-1.5 rounded-lg border border-red-200 transition"
                                      title="حذف سند القبض وتصحيح الكشف"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => handleOpenEditOrder(tx.referenceId || tx.referenceNumber)}
                                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-1.5 rounded-lg border border-slate-200 transition"
                                      title="تعديل الفاتورة مباشرة"
                                    >
                                      <Edit2 className="w-3.5 h-3.5 text-brand-blue" />
                                    </button>

                                    <button
                                      onClick={() => handleDeleteOrder(tx.referenceId || tx.referenceNumber, tx.referenceNumber)}
                                      className="bg-red-50 hover:bg-red-100 text-red-600 p-1.5 rounded-lg border border-red-200 transition"
                                      title="حذف الفاتورة واسترجاع المواد للمخزن"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </td>

                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

            </div>

            {/* Modal Bottom Footer Bar (Hidden on Print) */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 no-print print:hidden">
              <button
                onClick={() => window.print()}
                className="bg-brand-blue hover:bg-brand-blueDark text-white font-bold py-2 px-4 rounded-xl transition flex items-center gap-1.5 shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الكشف النظيف</span>
              </button>

              <button
                onClick={() => setSelectedStatement(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2 px-6 rounded-xl transition"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL 3: EDIT PAYMENT VOUCHER (Z-[70] TO APPEAR ON TOP) */}
      {editingPayment && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 text-xs animate-in zoom-in-95">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-brand-blue" />
                <span>تعديل سند القبض #{editingPayment.receiptNumber} ⚙️</span>
              </h3>
              <button
                onClick={() => setEditingPayment(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePaymentEdit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="font-black text-slate-800 block">المبلغ المقبوض (د.ع) *:</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={editingPayment.amount}
                  onChange={(e) => setEditingPayment({ ...editingPayment, amount: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-sm font-black font-mono text-slate-900 focus:bg-white focus:border-brand-blue"
                />
              </div>

              <div className="space-y-1">
                <label className="font-black text-slate-800 block">طريقة القبض والدفع:</label>
                <select
                  value={editingPayment.paymentMethod}
                  onChange={(e) => setEditingPayment({ ...editingPayment, paymentMethod: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                >
                  <option value="cash">💵 نقداً (كاش للمندوب/المحل)</option>
                  <option value="zaincash">📱 زين كاش (Zain Cash)</option>
                  <option value="qicard">💳 ماستركارد / كي كارد (Qi Card)</option>
                  <option value="bank_transfer">🏦 حوالة مصرفية / مكتب صرافة</option>
                  <option value="other">📝 أخرى</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-black text-slate-800 block">ملاحظات السند:</label>
                <input
                  type="text"
                  value={editingPayment.notes}
                  onChange={(e) => setEditingPayment({ ...editingPayment, notes: e.target.value })}
                  placeholder="ملاحظات توضيحية..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="flex-1 bg-brand-blue hover:bg-brand-blueDark text-white font-black py-2.5 rounded-xl transition shadow-md flex items-center justify-center gap-1.5"
                >
                  {isSubmittingEdit ? 'جاري الحفظ...' : 'حفظ التعديلات 💾'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* MODAL 4: DIRECT EDIT INVOICE MODAL (Z-[80] TO OPEN DIRECTLY OVER STATEMENT) */}
      {editingOrder && (
        <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs z-[80] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-5 sm:p-6 space-y-4 text-xs my-6 animate-in zoom-in-95 max-h-[92vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-blue-50 text-brand-blue flex items-center justify-center">
                    <Receipt className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="font-black text-slate-900 text-sm">
                      تعديل فاتورة مبيعات #{editingOrder.orderNumber}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold">
                      الزبون: {editingOrder.customer.name} ({editingOrder.customer.phone})
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Delete Entire Order Button */}
                <button
                  type="button"
                  onClick={() => handleDeleteOrder(editingOrder.id, editingOrder.orderNumber)}
                  className="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[11px] py-1.5 px-3 rounded-xl transition flex items-center gap-1 border border-red-200"
                  title="حذف الفاتورة واسترجاع المواد للمخزن"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">حذف الفاتورة 🗑️</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Order Items List */}
            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              <span className="font-black text-slate-800 text-xs block">أصناف الفاتورة والكميات:</span>
              
              <div className="space-y-2">
                {editingOrder.items.map((it, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
                  >
                    {/* Item Image and Title */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-white border border-slate-200 shrink-0 p-0.5">
                        <img src={it.image} alt={it.name} className="w-full h-full object-contain" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 block truncate">{it.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                          it.saleType === 'wholesale' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'
                        }`}>
                          {it.saleType === 'wholesale' ? '📦 جملة' : '🛒 مفرد'}
                        </span>
                      </div>
                    </div>

                    {/* Unit Price & Qty Controls */}
                    <div className="flex items-center gap-3 justify-between sm:justify-end">
                      
                      {/* Editable Price */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-500 font-bold">السعر:</span>
                        <input
                          type="number"
                          min="0"
                          value={it.price}
                          onChange={(e) => handleUpdateItemPrice(idx, Number(e.target.value))}
                          className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-900 text-left"
                        />
                        <span className="text-[10px] text-slate-400">د.ع</span>
                      </div>

                      {/* Quantity Buttons */}
                      <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-xl p-0.5">
                        <button
                          type="button"
                          onClick={() => handleUpdateItemQty(idx, it.quantity - 1)}
                          className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-black"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={it.quantity}
                          onChange={(e) => handleUpdateItemQty(idx, Number(e.target.value))}
                          className="w-10 text-center font-black font-mono text-xs text-slate-900 bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateItemQty(idx, it.quantity + 1)}
                          className="w-6 h-6 rounded-lg bg-brand-blue text-white flex items-center justify-center font-black"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Line Total */}
                      <div className="font-mono font-black text-slate-900 text-xs w-20 text-left whitespace-nowrap">
                        {(it.price * it.quantity).toLocaleString()} د.ع
                      </div>

                      {/* Delete Item Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition"
                        title="حذف هذا الصنف من الفاتورة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add New Item Box */}
              <div className="bg-blue-50/50 p-3 rounded-2xl border border-blue-100 space-y-2 mt-3">
                <span className="font-black text-brand-blue text-[11px] flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة منتج آخر لهذه الفاتورة:</span>
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedAddProductId}
                    onChange={(e) => setSelectedAddProductId(e.target.value)}
                    className="flex-1 min-w-[180px] bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900"
                  >
                    <option value="">-- اختر المنتج لإضافته --</option>
                    {productsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (جملة: {p.wholesalePrice.toLocaleString()} د.ع)
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedAddSaleType}
                    onChange={(e: any) => setSelectedAddSaleType(e.target.value)}
                    className="bg-white border border-slate-300 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-900"
                  >
                    <option value="wholesale">📦 سعر جملة</option>
                    <option value="retail">🛒 سعر مفرد</option>
                  </select>

                  <input
                    type="number"
                    min="1"
                    value={selectedAddQty}
                    onChange={(e) => setSelectedAddQty(Math.max(1, Number(e.target.value)))}
                    className="w-14 bg-white border border-slate-300 rounded-xl px-2 py-1.5 text-xs font-mono font-bold text-center text-slate-900"
                    placeholder="العدد"
                  />

                  <button
                    type="button"
                    onClick={handleAddItemToOrder}
                    disabled={!selectedAddProductId}
                    className="bg-brand-blue hover:bg-brand-blueDark disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-xl transition text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة +</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Totals & Notes Section */}
            <form onSubmit={handleSaveOrderEdit} className="border-t border-slate-100 pt-3 space-y-3">
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="font-bold text-slate-600 text-[11px] block">أجور التوصيل (د.ع):</label>
                  <input
                    type="number"
                    min="0"
                    value={editingOrder.deliveryFee || 0}
                    onChange={(e) => {
                      const deliveryFee = Number(e.target.value);
                      const total = Math.max(0, editingOrder.subtotal + deliveryFee - (editingOrder.discount || 0));
                      setEditingOrder({ ...editingOrder, deliveryFee, total });
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-600 text-[11px] block">خصم إضافي (د.ع):</label>
                  <input
                    type="number"
                    min="0"
                    value={editingOrder.discount || 0}
                    onChange={(e) => {
                      const discount = Number(e.target.value);
                      const total = Math.max(0, editingOrder.subtotal + (editingOrder.deliveryFee || 0) - discount);
                      setEditingOrder({ ...editingOrder, discount, total });
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-600 text-[11px] block">حالة الطلبية:</label>
                  <select
                    value={editingOrder.status}
                    onChange={(e: any) => setEditingOrder({ ...editingOrder, status: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-900"
                  >
                    <option value="pending">⏳ قيد المراجعة</option>
                    <option value="processing">📦 قيد التجهيز بالمستودع</option>
                    <option value="shipped">🚚 خرج مع المندوب للتوصيل</option>
                    <option value="delivered">✅ تم التوصيل بنجاح</option>
                    <option value="cancelled">❌ ملغي</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 text-[11px] block">ملاحظات الفاتورة:</label>
                <input
                  type="text"
                  value={editingOrder.notes || ''}
                  onChange={(e) => setEditingOrder({ ...editingOrder, notes: e.target.value })}
                  placeholder="ملاحظات وتوجيهات للعميل أو المندوب..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900"
                />
              </div>

              {/* Final Calculated Total */}
              <div className="bg-slate-100 p-3 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block">إجمالي الفاتورة الجديد:</span>
                  <span className="font-mono font-black text-base text-brand-coral">
                    {editingOrder.total.toLocaleString()} د.ع
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingOrder(null)}
                    className="bg-white hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl transition"
                  >
                    إلغاء
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingOrder}
                    className="bg-brand-blue hover:bg-brand-blueDark text-white font-black px-5 py-2 rounded-xl shadow-md transition flex items-center gap-1.5"
                  >
                    {isSavingOrder ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>جاري الحفظ...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>حفظ التعديلات وتحديث الكشف 💾</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* MODAL: CASH VAULT DEPOSIT / EXPENSE (تسجيل حركة صندوق 181) */}
      {isVaultModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 text-xs animate-in zoom-in-95">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                {vaultFormType === 'inflow' ? (
                  <>
                    <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                    <span>إيداع وتغذية الصندوق (181) 💵</span>
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="w-5 h-5 text-rose-600" />
                    <span>صرف / مصروفات من الصندوق (181) 📤</span>
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setIsVaultModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveVaultMovement} className="space-y-4">
              
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setVaultFormType('inflow');
                    setVaultFormCategory('deposit_adjustment');
                  }}
                  className={`py-2 rounded-xl font-black text-xs transition cursor-pointer ${
                    vaultFormType === 'inflow'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📥 إيداع نقدي (داخل)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setVaultFormType('outflow');
                    setVaultFormCategory('expense');
                  }}
                  className={`py-2 rounded-xl font-black text-xs transition cursor-pointer ${
                    vaultFormType === 'outflow'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📤 صرف نقدي (خارج)
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">المبلغ بالدينار العراقي (د.ع):</label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="1000"
                    step="500"
                    value={vaultFormAmount}
                    onChange={(e) => setVaultFormAmount(e.target.value)}
                    placeholder="مثال: 250000"
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3 text-sm font-mono font-black text-slate-900 focus:bg-white focus:border-emerald-600"
                  />
                  <span className="absolute left-3.5 top-3.5 font-bold text-slate-400">د.ع</span>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">تصنيف الحركة:</label>
                <select
                  value={vaultFormCategory}
                  onChange={(e) => setVaultFormCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-2.5 text-xs font-bold text-slate-900"
                >
                  {vaultFormType === 'inflow' ? (
                    <>
                      <option value="deposit_adjustment">💵 تغذية وإيداع رصيد بالصندوق</option>
                      <option value="debt_collection">🧾 تحصيل دفعة من زبون</option>
                      <option value="sales_cash">🛍️ إيراد مبيعات نقدية</option>
                      <option value="driver_settlement">🚚 تصفية عهدة كاش من سائق</option>
                    </>
                  ) : (
                    <>
                      <option value="expense">🏢 مصاريف تشغيلية ونثرية (كهرباء، ضيافة، وقود...)</option>
                      <option value="purchase_payment">📦 سداد دفعة مشتريات لشركة مجهزة</option>
                      <option value="owner_withdrawal">👑 مسحوبات أرباح / المالك</option>
                    </>
                  )}
                </select>
              </div>

              {/* Party Name */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">الطرف المستلم / المودع:</label>
                <input
                  type="text"
                  value={vaultFormParty}
                  onChange={(e) => setVaultFormParty(e.target.value)}
                  placeholder="مثال: إدارة المتجر، اسم المستلم، أو الشركة..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-2.5 text-xs font-bold text-slate-900"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">البيان والتفاصيل (سيوثق في سجل الرقابة 🛡️):</label>
                <textarea
                  rows={2}
                  value={vaultFormNotes}
                  onChange={(e) => setVaultFormNotes(e.target.value)}
                  placeholder="اكتب تفاصيل وسبب الإيداع أو الصرف للتوثيق المالي..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-2.5 text-xs font-bold text-slate-900"
                />
              </div>

              {/* Submitting Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsVaultModalOpen(false)}
                  className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-2xl transition"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingVault}
                  className={`w-2/3 text-white font-black py-2.5 rounded-2xl transition flex items-center justify-center gap-2 shadow-md cursor-pointer ${
                    vaultFormType === 'inflow'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {isSubmittingVault ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>جاري التوثيق...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>تأكيد الحركة وتوثيقها 💾</span>
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}

export default function AdminAccountingPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-bold">جاري تحميل السجلات المحاسبية وكشوفات الحساب...</p>
        </div>
      }
    >
      <AdminAccountingContent />
    </Suspense>
  );
}
