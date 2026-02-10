import { Request, Response } from 'express';
import uploadService from '../services/uploadService';

class UploadController {
    async upload(req: Request, res: Response) {
        try {
            const file = req.file;
            const result = await uploadService.uploadFile(file);
            res.json(result);
        } catch (error: any) {
            console.error('Error uploading file:', error);
            res.status(400).json({ error: error.message });
        }
    }
}

export default new UploadController();
