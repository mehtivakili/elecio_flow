/**
 * PDF helpers. Both libraries are loaded on first use, so they stay out of the main bundle.
 *  - pdf.js renders stored PDFs page by page (phones cannot show PDFs inline).
 *  - html-to-image + jsPDF turn the on-screen proforma / invoice into an A4 PDF; the
 *    browser draws the Persian text, so shaping and right-to-left order stay correct.
 */

type PdfJs = typeof import('pdfjs-dist');
let pdfjsLib: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  pdfjsLib ??= (async () => {
    const lib = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    lib.GlobalWorkerOptions.workerSrc = worker;
    return lib;
  })();
  return pdfjsLib;
}

/** Renders every page of a PDF as a canvas, sized to `width` CSS pixels. */
export async function renderPdfPages(data: ArrayBuffer, width: number, isCancelled: () => boolean = () => false): Promise<HTMLCanvasElement[]> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(data) }).promise;
  const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
  const pages: HTMLCanvasElement[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      if (isCancelled()) break;
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width / base.width) * ratio });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.height = 'auto';
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      pages.push(canvas);
    }
  } finally {
    doc.destroy();
  }
  return pages;
}

/** First page as a small image, for document tiles. */
export async function pdfThumbnail(data: ArrayBuffer, width = 220): Promise<string> {
  const [first] = await renderPdfPagesLimited(data, width);
  return first ? first.toDataURL('image/jpeg', 0.8) : '';
}

async function renderPdfPagesLimited(data: ArrayBuffer, width: number) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(data) }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    return [canvas];
  } finally {
    doc.destroy();
  }
}

/**
 * Captures a rendered A4 element (794px wide) into a PDF. Content taller than one page is
 * split into several pages at the A4 aspect ratio.
 */
export async function elementToPdf(node: HTMLElement): Promise<Blob> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  await document.fonts?.ready;
  const canvas = await toCanvas(node, { pixelRatio: 2.5, backgroundColor: '#ffffff', cacheBust: true });
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageW = 210;
  const pageH = 297;
  const pxPerPage = Math.floor(canvas.width * (pageH / pageW));
  for (let y = 0, page = 0; y < canvas.height; y += pxPerPage, page++) {
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.min(pxPerPage, canvas.height - y);
    const ctx = slice.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    if (page > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, (slice.height / canvas.width) * pageW);
  }
  return pdf.output('blob');
}

/** Hands a file to the user: the share sheet on phones (WhatsApp, Telegram…), a download elsewhere. */
export async function shareOrDownload(blob: Blob, fileName: string, preferShare: boolean) {
  const file = new File([blob], fileName, { type: blob.type || 'application/pdf' });
  if (preferShare && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return 'shared' as const;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled' as const;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded' as const;
}

/** Shrinks large photos (phone camera shots) before upload; PDFs and small images pass through. */
export async function compressImage(file: File, maxSide = 2400, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) { bitmap.close(); return file; }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return out && out.size < file.size ? out : file;
}
