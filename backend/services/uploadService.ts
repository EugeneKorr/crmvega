import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

class UploadService {
    async uploadFile(file: any) {
        if (!file) {
            throw new Error('No file uploaded');
        }

        const fileExt = file.originalname.split('.').pop();
        const fileName = `templates/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('attachments')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('attachments')
            .getPublicUrl(fileName);

        return {
            url: urlData.publicUrl,
            filename: fileName,
            originalName: file.originalname
        };
    }
}

export default new UploadService();
