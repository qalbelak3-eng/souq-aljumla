import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin, hasPermission } from '@/lib/auth';
import { pgGetVehicleById, pgUpdateVehicle, pgDeleteVehicle } from '@/lib/postgres-drivers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await getAuthenticatedAdmin(req);
    if (!admin) return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    if (!hasPermission(admin, 'drivers')) return NextResponse.json({ success: false, error: 'ليس لديك صلاحية تعديل بيانات المركبات' }, { status: 403 });
    const existing = await pgGetVehicleById(params.id);
    if (!existing) return NextResponse.json({ success: false, error: 'المركبة غير موجودة' }, { status: 404 });
    const body = await req.json();
    const updated = await pgUpdateVehicle(params.id, body);
    return NextResponse.json({ success: true, vehicle: updated, message: 'تم تحديث بيانات المركبة بنجاح! ✅' });
  } catch (error: any) {
    console.error('Error updating vehicle:', error);
    const message = error.message || 'حدث خطأ أثناء تعديل بيانات المركبة';
    return NextResponse.json({ success: false, error: message }, { status: message.includes('مسجل مسبقاً') ? 400 : 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await getAuthenticatedAdmin(req);
    if (!admin) return NextResponse.json({ success: false, error: 'غير مصرح لك بالوصول (جلسة غير مسجلة)' }, { status: 401 });
    if (!hasPermission(admin, 'drivers')) return NextResponse.json({ success: false, error: 'ليس لديك صلاحية حذف المركبات' }, { status: 403 });
    const result = await pgDeleteVehicle(params.id);
    return NextResponse.json({ success: true, message: result.message || 'تم حذف المركبة بنجاح 🗑️' });
  } catch (error: any) {
    console.error('Error deleting vehicle:', error);
    const message = error.message || 'حدث خطأ أثناء حذف المركبة';
    return NextResponse.json({ success: false, error: message }, { status: message === 'المركبة غير موجودة' ? 404 : 500 });
  }
}
