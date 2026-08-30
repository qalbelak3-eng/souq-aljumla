'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  FileText,
  Search,
  Printer,
  MessageCircle,
  Clock,
  ArrowRight,
  User,
  Store,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  Receipt,
  Download
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AccountStatement, AccountTransaction } from '@/types';
import EtihadLogo from '@/components/EtihadLogo';

function StatementContent() {
  const searchParams = useSearchParams();
  const phoneFromUrl = searchParams.get('phone') || searchParams.get('identifier') || '';

  const { user } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const fetchStatement = async (phoneToSearch: string) => {
    if (!phoneToSearch || !phoneToSearch.trim()) {
      setError('يرجى إدخال رقم الهاتف المسجل في الطلب');
      return;
    }

    setIsLoading(true);
    setError('');
    setHasSearched(true);

    try {
      const res = await fetch(`/api/accounting/statement?phone=${encodeURIComponent(phoneToSearch.trim())}`);
      const data = await res.json();

      if (data.success && data.statement) {
        setStatement(data.statement);
      } else {
        setStatement(null);
        setError(data.error || 'لم يتم العثور على أي حركات أو فواتير مسجلة بهذا الرقم');
      }
    } catch (err: any) {
      setStatement(null);
      setError('حدث خطأ أثناء جلب كشف الحساب، يرجى المحاولة لاحقاً');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (phoneFromUrl) {
      setPhoneNumber(phoneFromUrl);
      fetchStatement(phoneFromUrl);
    } else if (user?.phone) {
      setPhoneNumber(user.phone);
      fetchStatement(user.phone);
    }
  }, [phoneFromUrl, user]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStatement(phoneNumber);
  };

  const handlePrint = () => {
    window.print();
  };

  const shareViaWhatsApp = () => {
    if (!statement) return;
    const text = `*كشف حساب - سوق الجملة 🇮🇶🏬*\n` +
      `👤 *العميل:* ${statement.customer.name} ${statement.customer.businessName ? `(${statement.customer.businessName})` : ''}\n` +
      `📱 *رقم الهاتف:* ${statement.customer.phone}\n` +
      `📦 *إجمالي المشتريات:* ${statement.summary.totalInvoiced.toLocaleString()} د.ع\n` +
      `💵 *إجمالي المسدد:* ${statement.summary.totalPaid.toLocaleString()} د.ع\n` +
      `⚖️ *الرصيد المتبقي:* ${statement.summary.remainingBalance.toLocaleString()} د.ع\n` +
      `🗓️ *التاريخ:* ${new Date().toLocaleDateString('ar-IQ')}\n` +
      `🔗 رابط الكشف المباشر: ${window.location.origin}/statement?phone=${encodeURIComponent(statement.customer.phone)}`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#f3f8fc] text-slate-900 pb-20 print:p-0 print:pb-0 print:bg-white">
      
      {/* Header Bar - SCREEN ONLY */}
      <div className="bg-white border-b border-slate-100 shadow-xs py-4 px-4 sm:px-6 print:hidden">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <EtihadLogo size="md" />
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-xs font-bold text-slate-600 hover:text-brand-blue flex items-center gap-1 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 transition"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>العودة للمتجر</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 space-y-6 print:p-0 print:m-0 print:max-w-none print:space-y-0">
        
        {/* Title & Search Card */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-4 print:hidden">
          <div className="text-center sm:text-right space-y-1">
            <div className="inline-flex items-center gap-1.5 bg-blue-50 text-brand-blue text-xs font-bold px-3 py-1 rounded-full border border-blue-100 mb-1">
              <FileText className="w-3.5 h-3.5" />
              <span>النظام المحاسبي وكشوفات الحسابات</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">
              كشف الحساب وسجل المعاملات المالية 🧾
            </h1>
            <p className="text-xs text-slate-500 font-bold">
              استعرض سجل مشترياتك، الدفعات المسددة، والرصيد المتبقي برقم هاتفك المسجل في الطلبات
            </p>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3 pt-2">
            <div className="relative flex-1">
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="أدخل رقم هاتفك (مثال: 07701234567)"
                className="w-full bg-slate-50 border border-slate-300 rounded-2xl py-3 pr-11 pl-4 text-xs sm:text-sm font-bold text-slate-900 focus:bg-white focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 transition placeholder:text-slate-400"
                dir="ltr"
              />
              <Search className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="bg-brand-blue hover:bg-brand-blueDark active:scale-98 text-white font-black py-3 px-6 rounded-2xl shadow-md transition text-xs sm:text-sm flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>جاري البحث...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>عرض كشف الحساب ⚡</span>
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-2xl font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* STATEMENT RESULT CONTENT */}
        {statement && (
          <div className="space-y-6">
            
            {/* ═══ PRINT-ONLY: Official header with logo, customer info, summary ═══ */}
            <div className="hidden print:block">
              {/* Logo row */}
              <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3 mb-4">
                <EtihadLogo size="md" />
                <div className="text-left">
                  <span className="text-base font-black text-slate-900 block">كشف حساب مالي رسمي 📄</span>
                  <span className="text-[11px] text-slate-600 font-bold">
                    تاريخ الإصدار: {new Date().toLocaleDateString('ar-IQ')} — {new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Customer details box */}
              <div className="border border-slate-300 rounded p-3 mb-4 grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                <p className="font-black text-slate-900 text-sm col-span-2 border-b border-slate-200 pb-1 mb-1">بيانات الزبون / العميل</p>
                <div className="flex gap-2">
                  <span className="text-slate-400 font-bold w-20 shrink-0">الاسم الكامل:</span>
                  <span className="font-black text-slate-900">{statement.customer.businessName || statement.customer.name}</span>
                </div>
                {statement.customer.businessName && (
                  <div className="flex gap-2">
                    <span className="text-slate-400 font-bold w-20 shrink-0">المسؤول:</span>
                    <span className="font-bold text-slate-700">{statement.customer.name}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="text-slate-400 font-bold w-20 shrink-0">رقم الهاتف:</span>
                  <span className="font-mono font-bold text-slate-900" dir="ltr">{statement.customer.phone}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-400 font-bold w-20 shrink-0">المدينة:</span>
                  <span className="font-bold text-slate-900">{statement.customer.city}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-400 font-bold w-20 shrink-0">نوع الحساب:</span>
                  <span className="font-bold text-slate-900">{statement.customer.accountType}</span>
                </div>
              </div>

              {/* Summary boxes */}
              <div className="grid grid-cols-3 gap-3 mb-4 text-center text-xs">
                <div className="border border-slate-300 rounded p-2">
                  <p className="text-slate-500 font-bold mb-0.5">إجمالي المشتريات (مدين)</p>
                  <p className="font-black text-slate-900 text-sm font-mono">{statement.summary.totalInvoiced.toLocaleString()} د.ع</p>
                </div>
                <div className="border border-slate-300 rounded p-2">
                  <p className="text-slate-500 font-bold mb-0.5">إجمالي المسدد (دائن)</p>
                  <p className="font-black text-slate-900 text-sm font-mono">{statement.summary.totalPaid.toLocaleString()} د.ع</p>
                </div>
                <div className={`border rounded p-2 ${statement.summary.remainingBalance > 0 ? 'border-red-400' : 'border-green-400'}`}>
                  <p className="text-slate-500 font-bold mb-0.5">الرصيد المتبقي</p>
                  <p className={`font-black text-sm font-mono ${statement.summary.remainingBalance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                    {statement.summary.remainingBalance.toLocaleString()} د.ع
                  </p>
                </div>
              </div>
            </div>

            {/* ═══ SCREEN-ONLY: Customer card + actions + KPI ═══ */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4 print:hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-blue to-emerald-600 text-white flex items-center justify-center font-black text-xl shadow-md">
                    {statement.customer.name.slice(0, 1)}
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                      <span>🏪 {statement.customer.businessName || statement.customer.name}</span>
                    </h2>
                    <p className="text-xs text-slate-500 font-bold flex items-center gap-2 mt-0.5">
                      <span>👤 {statement.customer.name}</span>
                      <span>•</span>
                      <span dir="ltr">{statement.customer.phone}</span>
                      <span>•</span>
                      <span>{statement.customer.city}</span>
                      <span>•</span>
                      <span className="text-brand-blue">{statement.customer.accountType}</span>
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handlePrint}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-2 px-3.5 rounded-xl transition flex items-center gap-1.5 shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>طباعة الكشف</span>
                  </button>
                  <button
                    onClick={shareViaWhatsApp}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3.5 rounded-xl transition flex items-center gap-1.5 shadow-xs"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>مشاركة عبر واتساب</span>
                  </button>
                </div>
              </div>

              {/* Financial KPI Summary Cards */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl space-y-1 text-right">
                  <span className="text-[10px] text-slate-500 font-bold block">إجمالي المشتريات (المدين)</span>
                  <div className="text-base sm:text-xl font-black font-mono text-slate-900">
                    {statement.summary.totalInvoiced.toLocaleString()} <span className="text-[10px] font-bold font-sans text-slate-500">د.ع</span>
                  </div>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-200 p-3 rounded-2xl space-y-1 text-right">
                  <span className="text-[10px] text-emerald-800 font-bold block">إجمالي المسدد (الدائن)</span>
                  <div className="text-base sm:text-xl font-black font-mono text-emerald-700">
                    {statement.summary.totalPaid.toLocaleString()} <span className="text-[10px] font-bold font-sans text-emerald-600">د.ع</span>
                  </div>
                </div>

                <div className={`p-3 rounded-2xl space-y-1 text-right border ${
                  statement.summary.remainingBalance > 0
                    ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                }`}>
                  <span className="text-[10px] font-bold block">الرصيد المتبقي (المطلوب)</span>
                  <div className={`text-base sm:text-xl font-black font-mono ${
                    statement.summary.remainingBalance > 0 ? 'text-[#e0452c]' : 'text-emerald-700'
                  }`}>
                    {statement.summary.remainingBalance.toLocaleString()} <span className="text-[10px] font-bold font-sans">د.ع</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ TRANSACTIONS TABLE — screen + print ═══ */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden print:rounded-none print:border-slate-300 print:shadow-none">

              {/* Table heading — screen only */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 print:hidden">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-blue" />
                  <span>جدول القيود وسجل الحركات المحاسبية ({statement.transactions.length})</span>
                </h3>
                <span className="text-[11px] text-slate-500 font-bold">مرتبة زمنياً من الأقدم إلى الأحدث 📅</span>
              </div>

              {/* Print-only micro heading */}
              <div className="hidden print:block pb-1">
                <p className="text-xs font-black text-slate-700 border-b border-slate-300 pb-1">
                  سجل الحركات المالية ({statement.transactions.length} حركة) — مرتبة من الأقدم إلى الأحدث
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/80 text-slate-700 text-[11px] font-black border-y border-slate-200 print:bg-slate-100">
                    <tr className="divide-x divide-x-reverse divide-slate-200">
                      <th className="py-3 px-4">التاريخ</th>
                      <th className="py-3 px-4">رقم المستند</th>
                      <th className="py-3 px-4">نوع الحركة</th>
                      <th className="py-3 px-4 text-left">مدين (مشتريات)</th>
                      <th className="py-3 px-4 text-left">دائن (مسدد)</th>
                      <th className="py-3 px-4 text-left">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statement.transactions.map((tx, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition divide-x divide-x-reverse divide-slate-100 print:hover:bg-transparent">
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {new Date(tx.date).toLocaleDateString('en-GB')}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {/* Screen: clickable link */}
                          <span className="print:hidden">
                            {tx.type === 'invoice' && tx.referenceId ? (
                              <Link
                                href={`/order-success/${tx.referenceId}`}
                                className="font-mono font-bold text-brand-blue hover:underline bg-blue-50 px-2 py-0.5 rounded border border-blue-100 inline-flex items-center gap-1"
                                dir="ltr"
                              >
                                <span>#{tx.referenceNumber}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </Link>
                            ) : (
                              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200" dir="ltr">
                                #{tx.referenceNumber}
                              </span>
                            )}
                          </span>
                          {/* Print: plain text */}
                          <span className="hidden print:inline font-mono font-bold text-slate-900" dir="ltr">
                            #{tx.referenceNumber}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border print:border-slate-400 print:bg-transparent print:text-slate-900 ${
                            tx.type === 'invoice'
                              ? 'bg-blue-50 text-brand-blue border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {tx.type === 'invoice' ? 'فاتورة مبيعات' : 'سند قبض'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-left font-mono font-bold text-slate-900 whitespace-nowrap">
                          {tx.debit > 0 ? `${tx.debit.toLocaleString()} د.ع` : '—'}
                        </td>

                        <td className="py-3.5 px-4 text-left font-mono font-bold text-emerald-700 whitespace-nowrap print:text-slate-900">
                          {tx.credit > 0 ? `${tx.credit.toLocaleString()} د.ع` : '—'}
                        </td>

                        <td className="py-3.5 px-4 text-left font-mono font-black text-slate-900 whitespace-nowrap">
                          <span className={tx.balance > 0 ? 'text-[#e0452c]' : 'text-emerald-700'}>
                            {tx.balance.toLocaleString()} د.ع
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Print-only totals footer */}
                  <tfoot className="hidden print:table-footer-group">
                    <tr className="bg-slate-200 font-black text-xs border-t-2 border-slate-700">
                      <td colSpan={3} className="py-2 px-4 text-right">الإجمالي الكلي</td>
                      <td className="py-2 px-4 text-left font-mono">{statement.summary.totalInvoiced.toLocaleString()} د.ع</td>
                      <td className="py-2 px-4 text-left font-mono">{statement.summary.totalPaid.toLocaleString()} د.ع</td>
                      <td className={`py-2 px-4 text-left font-mono ${statement.summary.remainingBalance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {statement.summary.remainingBalance.toLocaleString()} د.ع
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Screen footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2 print:hidden">
                <span className="font-bold">سوق الجملة | سوق الجملة الأكبر في كربلاء 🇮🇶</span>
                <span>تاريخ إصدار الكشف: {new Date().toLocaleDateString('ar-IQ')}</span>
              </div>
            </div>

            {/* ═══ PRINT-ONLY: Signature + footer ═══ */}
            <div className="hidden print:block mt-10">
              <div className="grid grid-cols-2 gap-12 text-xs text-slate-700 mb-6">
                <div className="border-t border-slate-400 pt-2 text-center">
                  <p className="font-bold">توقيع المحاسب / مُصدِر الكشف</p>
                </div>
                <div className="border-t border-slate-400 pt-2 text-center">
                  <p className="font-bold">توقيع الزبون / العميل</p>
                </div>
              </div>
              <p className="text-center text-[10px] text-slate-400 border-t border-slate-200 pt-2">
                سوق الجملة — جميع الحقوق محفوظة {new Date().getFullYear()} • هذا الكشف صادر آلياً من النظام المحاسبي
              </p>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

export default function StatementPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f3f8fc] flex items-center justify-center p-4">
        <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <StatementContent />
    </Suspense>
  );
}