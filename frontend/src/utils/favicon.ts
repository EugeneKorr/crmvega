
let defaultFavicon: string | null = null;
let faviconImage: HTMLImageElement | null = null;

export const updateFavicon = (count: number) => {
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) return;

    // Save the original favicon URL once
    if (!defaultFavicon) {
        defaultFavicon = link.href;
    }

    // If no unread items, restore the original favicon
    if (count === 0) {
        link.href = defaultFavicon;
        return;
    }

    // Load image if not loaded
    if (!faviconImage) {
        faviconImage = new Image();
        faviconImage.crossOrigin = 'anonymous'; // helpful if serving from different origin
        faviconImage.src = defaultFavicon;
        faviconImage.onload = () => {
            drawFavicon(count, link);
        };
        // Handle error loading favicon
        faviconImage.onerror = () => {
            console.warn("Failed to load favicon for badge update");
        };
    } else if (faviconImage.complete) {
        drawFavicon(count, link);
    } else {
        // If currently loading, attach a one-time listener or just let the onload handle the current call if it was just set
        // Simpler: just set onload again (it overrides)
        faviconImage.onload = () => drawFavicon(count, link);
    }
};

const drawFavicon = (count: number, link: HTMLLinkElement) => {
    if (!faviconImage) return;

    const canvas = document.createElement('canvas');
    // Use 32x32 for standard high-quality favicon rendering
    canvas.width = 32;
    canvas.height = 32;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw original favicon
    // We use 32x32 destination size
    ctx.drawImage(faviconImage, 0, 0, 32, 32);

    // Draw red circle (dot)
    // Position: Top Right
    const dotRadius = 5;
    const x = 24; // (32 - 8) roughly
    const y = 8;

    ctx.beginPath();
    ctx.arc(x, y, dotRadius, 0, 2 * Math.PI, false);
    ctx.fillStyle = '#ff4d4f'; // Ant Design error color
    ctx.fill();

    // Add 1.5px white border to make it pop against the icon
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // If count is needed, we could draw text here. 
    // User asked for "small circle", so a simple dot is safer and cleaner unless requested otherwise.
    // "malenkiy kruzhochek" = small circle.

    // Update favicon
    link.href = canvas.toDataURL('image/png');
};
