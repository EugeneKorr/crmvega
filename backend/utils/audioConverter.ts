import ffmpeg from 'fluent-ffmpeg';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';

ffmpeg.setFfmpegPath(ffmpegPath);

// Helper to convert buffer to OGG/Opus
export const convertToOgg = async (inputBuffer: Buffer, originalName: string): Promise<Buffer> => {
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `input_${Date.now()}_${originalName}`);
    const outputPath = path.join(tempDir, `output_${Date.now()}.ogg`);

    fs.writeFileSync(inputPath, inputBuffer);

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat('ogg')
            .audioCodec('libopus')
            .on('error', (err) => {
                // Try cleanup
                try { fs.unlinkSync(inputPath); } catch (e) { }
                try { fs.unlinkSync(outputPath); } catch (e) { }
                reject(err);
            })
            .on('end', () => {
                try {
                    const outputBuffer = fs.readFileSync(outputPath);
                    // Cleanup
                    fs.unlinkSync(inputPath);
                    fs.unlinkSync(outputPath);
                    resolve(outputBuffer);
                } catch (e) {
                    reject(e);
                }
            })
            .save(outputPath);
    });
};
