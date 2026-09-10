import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string[] } }
) {
  try {
    const filename = (params.filename || []).join('/');
    
    // Security: sanitize path against directory traversal
    const safeFilename = path.normalize(filename).replace(/^(\.\.[\/\\])+/, '');
    
    // Check multiple potential locations (public/uploads or root uploads)
    const possiblePaths = [
      path.join(process.cwd(), 'public', 'uploads', safeFilename),
      path.join(process.cwd(), 'uploads', safeFilename),
      path.join(process.cwd(), '.next', 'standalone', 'public', 'uploads', safeFilename),
    ];

    let targetPath = '';
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        targetPath = p;
        break;
      }
    }

    if (targetPath) {
      const fileBuffer = fs.readFileSync(targetPath);
      const ext = path.extname(safeFilename).toLowerCase();
      const contentType =
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
          ? 'image/gif'
          : ext === '.svg'
          ? 'image/svg+xml'
          : 'application/octet-stream';

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // Fallback placeholder image if physical file is missing
    const placeholderPath = path.join(process.cwd(), 'public', 'images', 'placeholder.png');
    if (fs.existsSync(placeholderPath)) {
      const placeholderBuffer = fs.readFileSync(placeholderPath);
      return new NextResponse(placeholderBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    return new NextResponse('File not found', { status: 404 });
  } catch (error) {
    console.error('Error serving upload image:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
