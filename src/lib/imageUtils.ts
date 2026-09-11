/**
 * Automatically resizes and compresses high-resolution images from phones/cameras
 * into optimized lightweight Base64 data URLs without quality loss.
 */
export function compressImageFile(
  file: File,
  maxWidth: number = 1200,
  maxHeight: number = 1200,
  quality: number = 0.85
): Promise<string> {
  // Safety check: if 3rd parameter is passed as quality (e.g. 0.85) instead of maxHeight
  if (typeof maxHeight === 'number' && maxHeight > 0 && maxHeight <= 1) {
    quality = maxHeight;
    maxHeight = maxWidth;
  }

  return new Promise((resolve, reject) => {
    // If SVG or small gif, read as data URL directly
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        // Draw image on canvas
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, quality);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Automatically extracts the dominant background color from the top edge of a banner image.
 * This powers the Hungerstation-style hero carousel where the background naturally extends
 * behind the status bar and search bar without requiring manual color selection.
 */
export function extractDominantEdgeColor(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      if (typeof window === 'undefined' || !dataUrl) return resolve('#ffffff');
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const w = Math.min(img.naturalWidth || 200, 400);
          const h = Math.min(img.naturalHeight || 200, 400);
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve('#ffffff');

          ctx.drawImage(img, 0, 0, w, h);

          // Sample pixels from top edge: (12, 12), (w/2, 12), (w-12, 12)
          const samples = [
            ctx.getImageData(Math.min(12, w - 1), Math.min(12, h - 1), 1, 1).data,
            ctx.getImageData(Math.floor(w / 2), Math.min(12, h - 1), 1, 1).data,
            ctx.getImageData(Math.max(0, w - 12), Math.min(12, h - 1), 1, 1).data,
          ];

          const pixel = samples.find(s => s[3] > 128) || samples[0];
          const hex = `#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1)}`;
          resolve(hex);
        } catch {
          resolve('#ffffff');
        }
      };
      img.onerror = () => resolve('#ffffff');
      img.src = dataUrl;
    } catch {
      resolve('#ffffff');
    }
  });
}

