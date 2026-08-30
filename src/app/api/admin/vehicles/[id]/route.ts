import { NextResponse } from 'next/server';
import { getVehicleById, saveVehicle, deleteVehicle } from '@/lib/db';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const existing = getVehicleById(params.id);

    if (!existing) {
      return NextResponse.json({ success: false, error: 'المركبة غير موجودة' }, { status: 404 });
    }

    const updated = saveVehicle({
      id: params.id,
      ...body,
    });

    return NextResponse.json({
      success: true,
      vehicle: updated,
      message: 'تم تحديث بيانات المركبة بنجاح! ✅',
    });
  } catch (error) {
    console.error('Error updating vehicle:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء تعديل بيانات المركبة' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const success = deleteVehicle(params.id);
    if (!success) {
      return NextResponse.json({ success: false, error: 'المركبة غير موجودة' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      message: 'تم حذف المركبة بنجاح 🗑️',
    });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ أثناء حذف المركبة' }, { status: 500 });
  }
}
