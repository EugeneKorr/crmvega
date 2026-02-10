import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

const BUCKET_NAME = 'attachments';
const FOLDER_NAME = 'avatars';

/**
 * Downloads a file from a URL and uploads it to Supabase Storage
 */
export async function uploadAvatarFromUrl(url: string | null | undefined, customFilename: string | null = null): Promise<string | null> {
    if (!url) return null;

    try {
        console.log(`[Storage] Downloading avatar from ${url}...`);

        // Download image
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        const contentType = response.headers['content-type'] || 'image/jpeg';

        // Determine extension
        let ext = 'jpg';
        if (contentType.includes('png')) ext = 'png';
        else if (contentType.includes('gif')) ext = 'gif';
        else if (contentType.includes('webp')) ext = 'webp';

        // Generate filename if not provided
        const filename = customFilename
            ? `${customFilename}.${ext}`
            : `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

        const filePath = `${FOLDER_NAME}/${filename}`;

        console.log(`[Storage] Uploading to ${BUCKET_NAME}/${filePath}...`);

        // Upload to Supabase
        const { error } = await supabase
            .storage
            .from(BUCKET_NAME)
            .upload(filePath, buffer, {
                contentType: contentType,
                upsert: true
            });

        if (error) {
            console.error('[Storage] Upload error:', error);
            return null;
        }

        // Get Public URL
        const { data: publicUrlData } = supabase
            .storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        console.log(`[Storage] Upload successful: ${publicUrlData.publicUrl}`);
        return publicUrlData.publicUrl;

    } catch (error: any) {
        console.error('[Storage] Error processing avatar:', error.message);
        return null;
    }
}

/**
 * Re-hosts a file: downloads from URL -> uploads to Supabase Storage
 */
export async function rehostFile(url: string | null | undefined, originalName: string = 'file'): Promise<string | null> {
    if (!url) return null;

    try {
        console.log(`[Storage] Re-hosting file from ${url}...`);

        // 1. Download file
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        const contentType = response.headers['content-type'] || 'application/octet-stream';

        // 2. Determine extension and MIME type
        let ext = 'bin';
        let finalContentType = contentType;

        const mimeToExt: Record<string, string> = {
            'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
            'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv',
            'application/zip': 'zip', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg',
            'audio/wav': 'wav', 'video/mp4': 'mp4', 'video/webm': 'webm',
        };

        const extToMime: Record<string, string> = {
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif',
            'webp': 'image/webp', 'pdf': 'application/pdf', 'txt': 'text/plain',
            'mp3': 'audio/mpeg', 'ogg': 'audio/ogg', 'wav': 'audio/wav',
            'mp4': 'video/mp4', 'webm': 'video/webm'
        };

        if (originalName && originalName.includes('.')) {
            ext = originalName.split('.').pop()?.split('?')[0].toLowerCase() || 'bin';
        } else if (mimeToExt[contentType]) {
            ext = mimeToExt[contentType];
        }

        // Fix: If contentType is octet-stream but we have a known extension, force correct MIME
        if ((!finalContentType || finalContentType === 'application/octet-stream') && extToMime[ext]) {
            finalContentType = extToMime[ext];
            console.log(`[Storage] Corrected MIME from ${contentType} to ${finalContentType} based on extension .${ext}`);
        }

        // 3. Generate path
        const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const filePath = `chat/${filename}`; // Store in 'chat' folder

        // 4. Upload
        const { error } = await supabase
            .storage
            .from(BUCKET_NAME)
            .upload(filePath, buffer, {
                contentType: finalContentType,
                upsert: false
            });

        if (error) {
            console.error('[Storage] Re-host upload error:', error);
            return null;
        }

        // 5. Get Public URL
        const { data: publicUrlData } = supabase
            .storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        console.log(`[Storage] Re-hosted to: ${publicUrlData.publicUrl}`);
        return publicUrlData.publicUrl;

    } catch (error: any) {
        console.error('[Storage] Re-host failed:', error.message);
        return null;
    }
}
