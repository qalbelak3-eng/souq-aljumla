'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Search,
  CheckCircle2,
  Clock,
  Archive,
  Phone,
  MessageCircle,
  Trash2,
  Send,
  User,
  Building,
  MapPin,
  Sparkles,
  AlertCircle,
  Filter,
  Check,
  X,
  ExternalLink
} from 'lucide-react';
import { CustomerComplaint } from '@/types';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmModalContext';

export default function AdminComplaintsPage() {
  const toast = useToast();
  const { confirm } = useConfirm();

  const [complaints, setComplaints] = useState<CustomerComplaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'resolved' | 'archived'>('all');
  
  // Replying state
  const [selectedComplaint, setSelectedComplaint] = useState<CustomerComplaint | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState<'pending' | 'in_progress' | 'resolved' | 'archived'>('resolved');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const fetchComplaints = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/complaints', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && Array.isArray(data.complaints)) {
        setComplaints(data.complaints);
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تحميل الرسائل والشكاوى');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, []);

  const handleOpenReplyModal = (comp: CustomerComplaint) => {
    setSelectedComplaint(comp);
    setReplyText(comp.adminReply || '');
    setReplyStatus(comp.status === 'pending' ? 'resolved' : comp.status);
  };

  const handleSaveReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint) return;

    setIsSubmittingReply(true);
    try {
      const operatorRaw = localStorage.getItem('etihad_admin_auth');
      const operator = operatorRaw ? JSON.parse(operatorRaw) : { name: 'الإدارة', username: 'admin' };

      const res = await fetch('/api/complaints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedComplaint.id,
          status: replyStatus,
          adminReply: replyText.trim() || undefined,
          operator,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('تم حفظ الرد وتحديث حالة الشكوى بنجاح! 📨✓');
        setSelectedComplaint(null);
        fetchComplaints();
      } else {
        toast.error(data.error || 'فشل حفظ الرد');
      }
    } catch (err) {
      toast.error('حدث خطأ أثناء الحفظ');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleDeleteComplaint = async (id: string, customerName: string) => {
    const isConfirmed = await confirm({
      title: 'حذف الشكوى / الرسالة',
      message: `هل أنت متأكد من حذف رسالة العميل (${customerName}) نهائياً؟`,
      confirmText: 'نعم، حذف الرسالة',
      cancelText: 'إلغاء',
      type: 'danger',
    });

    if (!isConfirmed) return;

    try {
      const res = await fetch(`/api/complaints?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('تم حذف الرسالة بنجاح ✓');
        fetchComplaints();
      } else {
        toast.error(data.error || 'فشل حذف الرسالة');
      }
    } catch (err) {
      toast.error('حدث خطأ أثناء الحذف');
    }
  };

  const handleQuickTemplate = (text: string) => {
    setReplyText(text);
  };

  // KPIs
  const totalCount = complaints.length;
  const pendingCount = complaints.filter(c => c.status === 'pending' || c.status === 'in_progress').length;
  const resolvedCount = complaints.filter(c => c.status === 'resolved').length;

  // Filtered List
  const filteredComplaints = complaints.filter((comp) => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending' && comp.status !== 'pending' && comp.status !== 'in_progress') return false;
      if (statusFilter === 'resolved' && comp.status !== 'resolved') return false;
      if (statusFilter === 'archived' && comp.status !== 'archived') return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      comp.customerName.toLowerCase().includes(q) ||
      comp.customerPhone.includes(q) ||
      (comp.businessName && comp.businessName.toLowerCase().includes(q)) ||
      (comp.city && comp.city.toLowerCase().includes(q)) ||
      comp.text.toLowerCase().includes(q) ||
      (comp.adminReply && comp.adminReply.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 text-xs select-none">
      
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center shadow-md shrink-0 text-xl font-black">
            💬
          </div>
          <div>
            <div className="inline-block bg-rose-100 text-rose-800 text-[10px] font-black px-2 py-0.5 rounded-md mb-1">
              خدمة العملاء ورضا الزبائن 💌
            </div>
            <h1 className="text-base sm:text-lg font-black text-slate-900">
              صندوق الشكاوى والملاحظات ورسائل العملاء
            </h1>
            <p className="text-xs text-slate-500 font-bold">
              استقبال رسائل وملاحظات واقتراحات أصحاب الماركتات والزبائن، والرد عليها فورياً
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchComplaints}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black px-4 py-2.5 rounded-2xl transition flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-brand-blue" />
          <span>تحديث الصندوق 🔄</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-brand-blue flex items-center justify-center font-black">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-slate-400 font-bold block">إجمالي الرسائل والشكاوى</span>
            <span className="text-base font-black text-slate-900 font-mono">{totalCount} رسالة</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-rose-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-black">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-rose-500 font-bold block">بانتظار الرد والمتابعة ⏳</span>
            <span className="text-base font-black text-rose-600 font-mono">{pendingCount} شكوى</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-emerald-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] text-emerald-600 font-bold block">تم الرد والحل بنجاح ✅</span>
            <span className="text-base font-black text-emerald-700 font-mono">{resolvedCount} تم معالجتها</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        
        {/* Search Box */}
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 ابحث بالاسم، رقم الهاتف، اسم الماركت، أو نص الشكوى..."
            className="w-full bg-slate-50 border border-slate-300 rounded-2xl py-2.5 pr-10 pl-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-slate-100 rounded-2xl">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer whitespace-nowrap ${
              statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            الكل ({totalCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer whitespace-nowrap ${
              statusFilter === 'pending' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⏳ قيد المتابعة ({pendingCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('resolved')}
            className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer whitespace-nowrap ${
              statusFilter === 'resolved' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ✅ تم الحل ({resolvedCount})
          </button>
        </div>

      </div>

      {/* Complaints Stream / List */}
      {isLoading ? (
        <div className="py-20 text-center space-y-3 bg-white rounded-3xl border border-slate-200">
          <div className="w-8 h-8 border-3 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-bold">جاري تحميل رسائل وشكاوى الزبائن...</p>
        </div>
      ) : filteredComplaints.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-slate-300 p-6 space-y-2">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-xl font-black">
            📭
          </div>
          <h3 className="font-black text-slate-800 text-sm">لا توجد رسائل أو شكاوى مطابقة</h3>
          <p className="text-xs text-slate-500 font-medium">صندوق الشكاوى فارغ حالياً أو لا توجد نتائج للبحث المكتوب.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredComplaints.map((comp) => {
            const cleanPhone = comp.customerPhone.replace(/\D/g, '');
            const intlPhone = cleanPhone.startsWith('0') ? '964' + cleanPhone.slice(1) : cleanPhone;
            const waUrl = `https://api.whatsapp.com/send?phone=${intlPhone}&text=${encodeURIComponent(`أهلاً بك أستاذ ${comp.customerName}، بخصوص ملاحظتك على متجر سوق الجملة: (${comp.text.slice(0, 60)}...)`)}`;

            const isPending = comp.status === 'pending' || comp.status === 'in_progress';

            return (
              <div
                key={comp.id}
                className={`bg-white rounded-3xl p-5 border transition-all space-y-4 shadow-xs hover:shadow-md ${
                  isPending ? 'border-rose-200 ring-1 ring-rose-100/60' : 'border-slate-200'
                }`}
              >
                
                {/* Top Info Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-slate-100 to-slate-200 text-slate-800 flex items-center justify-center font-black text-sm shrink-0 border border-slate-300">
                      {comp.customerName ? comp.customerName.charAt(0) : <User className="w-4 h-4" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-black text-slate-900">{comp.customerName}</strong>
                        {comp.businessName && (
                          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-black px-2 py-0.5 rounded-lg">
                            <Building className="w-3 h-3" />
                            <span>{comp.businessName}</span>
                          </span>
                        )}
                        {comp.city && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                            <MapPin className="w-3 h-3" />
                            <span>{comp.city}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono font-bold text-slate-600 text-[11px]" dir="ltr">
                          {comp.customerPhone}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          • {(() => {
                            try {
                              const d = new Date(comp.createdAt);
                              return d.toLocaleDateString('ar-IQ') + ' ' + d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
                            } catch {
                              return comp.createdAt;
                            }
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge & Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-black flex items-center gap-1 ${
                        comp.status === 'resolved'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : comp.status === 'in_progress'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : comp.status === 'archived'
                          ? 'bg-slate-100 text-slate-600 border border-slate-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                      }`}
                    >
                      {comp.status === 'resolved'
                        ? '✅ تم الحل والرد'
                        : comp.status === 'in_progress'
                        ? '⏳ قيد المتابعة'
                        : comp.status === 'archived'
                        ? '📁 مؤرشف'
                        : '🚨 شكوى جديدة بانتظار الرد'}
                    </span>

                    {/* Direct WhatsApp Button */}
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1 transition shadow-2xs"
                      title="مراسلة العميل عبر الواتساب مباشرة"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>واتساب</span>
                    </a>

                    {/* Phone Call */}
                    <a
                      href={`tel:${comp.customerPhone}`}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1.5 rounded-xl transition flex items-center gap-1"
                      title="اتصال هاتفي"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => handleDeleteComplaint(comp.id, comp.customerName)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                      title="حذف الرسالة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Complaint Message Body */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-xs font-bold text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {comp.text}
                </div>

                {/* Admin Reply Display (if exists) */}
                {comp.adminReply && (
                  <div className="bg-emerald-50/80 border border-emerald-200 p-3.5 rounded-2xl space-y-1 text-xs">
                    <div className="flex items-center justify-between text-emerald-800 font-black">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>رد الإدارة ({comp.repliedBy || 'المشرف'}):</span>
                      </span>
                      {comp.repliedAt && (
                        <span className="text-[10px] text-emerald-600 font-normal">
                          {(() => {
                            try {
                              const d = new Date(comp.repliedAt);
                              return d.toLocaleDateString('ar-IQ') + ' ' + d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
                            } catch {
                              return comp.repliedAt;
                            }
                          })()}
                        </span>
                      )}
                    </div>
                    <p className="text-emerald-950 font-bold">{comp.adminReply}</p>
                  </div>
                )}

                {/* Quick Reply / Edit Action Button */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleOpenReplyModal(comp)}
                    className="bg-brand-blue hover:bg-brand-blueDark text-white font-black px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{comp.adminReply ? 'تعديل رد الإدارة ✍️' : 'الرد على الشكوى وإغلاقها 💬'}</span>
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: ADMIN REPLY & RESOLUTION DIALOG */}
      {selectedComplaint && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 text-xs animate-in zoom-in-95">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-brand-blue" />
                <span>الرد على شكوى العميل: {selectedComplaint.customerName}</span>
              </h3>
              <button
                type="button"
                onClick={() => setSelectedComplaint(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveReply} className="space-y-4">
              
              {/* Customer Original Text Ref */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1">
                <span className="text-[10px] text-slate-500 font-bold block">نص رسالة العميل:</span>
                <p className="text-xs font-bold text-slate-800 max-h-24 overflow-y-auto">{selectedComplaint.text}</p>
              </div>

              {/* Status Select */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">تحديث حالة الشكوى:</label>
                <select
                  value={replyStatus}
                  onChange={(e: any) => setReplyStatus(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                >
                  <option value="resolved">✅ تم الحل والرد (إغلاق الشكوى بنجاح)</option>
                  <option value="in_progress">⏳ قيد المتابعة والتدقيق مع القسم المختص</option>
                  <option value="pending">🚨 بانتظار الإجراء</option>
                  <option value="archived">📁 أرشفة بدون إجراء</option>
                </select>
              </div>

              {/* Quick Template Replies */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 block">⚡ ردود جاهزة وسريعة:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleQuickTemplate('أهلاً بك عزيزنا، تم تدقيق ملاحظتك ومعالجة الأمر فوراً. نسعد دائماً بخدمتكم.')}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold px-2 py-1 rounded-lg transition"
                  >
                    تمت المعالجة فوراً ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickTemplate('مرحباً بك، تم إرسال المندوب لتسليم النواقص وتعديل الفاتورة مباشرة.')}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold px-2 py-1 rounded-lg transition"
                  >
                    إرسال النواقص مع المندوب 🚚
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickTemplate('شكراً لاقتراحك القيم، سيتم توفير هذا الصنف في المستودع خلال الأيام القادمة.')}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold px-2 py-1 rounded-lg transition"
                  >
                    توفير الصنف قريباً ✨
                  </button>
                </div>
              </div>

              {/* Reply Textarea */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  نص رد الإدارة (سيظهر فوراً في حساب وتطبيق العميل 📱):
                </label>
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="اكتب رد وتوضيح الإدارة للزبون هنا..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:border-brand-blue"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedComplaint(null)}
                  className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-2xl transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReply}
                  className="w-2/3 bg-brand-blue hover:bg-brand-blueDark text-white font-black py-2.5 rounded-2xl transition flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  {isSubmittingReply ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>إرسال الرد وتحديث الحالة 📨</span>
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
