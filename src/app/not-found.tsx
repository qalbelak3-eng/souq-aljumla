import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-24 text-center space-y-5">
      <div className="text-5xl">📦</div>
      <h2 className="text-2xl font-black text-slate-800">الصفحة أو الصنف غير موجود</h2>
      <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
        عذراً، لم نتمكن من العثور على الصنف أو الرابط المطلوب. قد يكون تم حذفه أو تغييره.
      </p>
      <div>
        <Link
          href="/products"
          className="inline-block bg-brand-blue hover:bg-blue-700 text-white font-bold text-xs py-3 px-6 rounded-xl shadow transition"
        >
          العودة لقائمة الأصناف
        </Link>
      </div>
    </div>
  );
}
