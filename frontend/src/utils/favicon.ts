
let defaultFavicon: string | null = null;
let faviconImage: HTMLImageElement | null = null;

export function updateFavicon(count: number) {
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) return;

    if (!defaultFavicon) {
        // Store original favicon URL
        if (link.href.startsWith('data:')) return;
        defaultFavicon = link.href;
    }

    if (count === 0) {
        if (defaultFavicon) link.href = defaultFavicon;
        return;
    }

    const runDraw = () => drawFavicon(count, link);

    if (!faviconImage) {
        faviconImage = new Image();
        faviconImage.crossOrigin = 'anonymous';
        faviconImage.src = defaultFavicon;
        faviconImage.onload = runDraw;
    } else if (faviconImage.complete) {
        runDraw();
    } else {
        faviconImage.onload = runDraw;
    }
}

function drawFavicon(count: number, link: HTMLLinkElement) {
    if (!faviconImage) return;

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw original icon
    ctx.drawImage(faviconImage, 0, 0, 32, 32);

    // 2. Configure Badge
    const text = count > 99 ? '99+' : count.toString();
    const fontSize = 18; // Large, readable font
    ctx.font = `bold ${fontSize}px sans-serif`;

    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;

    // Height is fixed
    const height = 18;
    // Width adjusts to text
    const padding = 6;
    const width = Math.max(height, textWidth + padding);

    // 3. Position: Top Right
    // We anchor the badge to the top-right corner of the 32x32 canvas.
    // We give it a slight offset from the edge so the border doesn't clip.
    const top = 0;
    const right = 32;

    const centerX = right - (width / 2);
    const centerY = top + (height / 2);

    // 4. Draw Background
    ctx.fillStyle = '#F5222D'; // Bright Red (Ant Design 'error' color)
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3; // Thick white border to make it pop

    ctx.beginPath();

    // Draw Pill Shape (Manual Path for compatibility)
    const x = centerX - width / 2;
    const y = centerY - height / 2;
    const r = height / 2;

    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);

    ctx.fill();
    ctx.stroke();

    // 5. Draw Text
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Font size adjustment for 2-3 digits
    if (text.length > 1) {
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(text, centerX, centerY + 1);
    } else {
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(text, centerX, centerY + 1);
    }

    // 6. Apply
    link.href = canvas.toDataURL('image/png');
}
