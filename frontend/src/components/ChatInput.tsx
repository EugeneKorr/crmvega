import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, message as antMessage, Typography } from 'antd';
import {
    SendOutlined,
    AudioOutlined,
    DeleteOutlined,
    PauseCircleOutlined,
    PaperClipOutlined,
} from '@ant-design/icons';
import { formatDuration } from '../utils/chatUtils';
import { templatesAPI } from '../services/api';
import { WebsiteContent } from '../types';
import { useAuth } from '../contexts/AuthContext';
// @ts-ignore
import Recorder from 'opus-recorder';

const { TextArea } = Input;
const { Text } = Typography;

interface ChatInputProps {
    onSendText: (text: string) => Promise<void>;
    onSendVoice: (voice: Blob, duration: number) => Promise<void>;
    onSendFile: (file: File, caption?: string) => Promise<void>;
    onTyping?: () => void;
    sending?: boolean;
    replacements?: Record<string, string>;
    placeholder?: string;
    replyTo?: any;
    onCancelReply?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
    onSendText,
    onSendVoice,
    onSendFile,
    onTyping,
    sending = false,
    replacements = {},
    placeholder,
    replyTo,
    onCancelReply
}) => {
    const { manager } = useAuth();
    const [messageInput, setMessageInput] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
    const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recorderRef = useRef<any>(null);
    const audioChunksRef = useRef<any[]>([]);
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // Template State
    const [templates, setTemplates] = useState<WebsiteContent[]>([]);
    const [showTemplates, setShowTemplates] = useState(false);
    const [filteredTemplates, setFilteredTemplates] = useState<WebsiteContent[]>([]);
    const [templateButtons, setTemplateButtons] = useState<any[]>([]);

    useEffect(() => {
        templatesAPI.getAll().then(setTemplates).catch(console.error);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setMessageInput(val);
        if (onTyping) onTyping();

        if (!val) setTemplateButtons([]);

        const slashIndex = val.lastIndexOf('/');
        if (slashIndex !== -1) {
            const query = val.slice(slashIndex + 1).toLowerCase();
            const matches = templates.filter(t => t.title?.toLowerCase().includes(query));
            setFilteredTemplates(matches);
            setShowTemplates(matches.length > 0);
            return;
        }
        setShowTemplates(false);
    };

    const handleTemplateSelect = async (template: WebsiteContent) => {
        const val = messageInput;
        const slashIndex = val.lastIndexOf('/');
        const prefix = slashIndex !== -1 ? val.slice(0, slashIndex) : val;

        let contentText = '';
        let attachments: any[] = [];
        let buttons: any[] = [];

        try {
            const parsed = JSON.parse(template.content || '{}');
            if (parsed.text !== undefined || parsed.attachments !== undefined || parsed.buttons !== undefined) {
                contentText = parsed.text || '';
                attachments = parsed.attachments || [];
                buttons = parsed.buttons || [];
            } else {
                contentText = template.content || '';
            }
        } catch {
            contentText = template.content || '';
        }

        if (replacements) {
            Object.entries(replacements).forEach(([key, value]) => {
                const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                contentText = contentText.replace(new RegExp(escapedKey, 'g'), String(value));
            });
        }

        setMessageInput(prefix + contentText);
        setTemplateButtons(buttons);

        if (attachments.length > 0) {
            const att = attachments[0];
            if (att.url) {
                try {
                    const res = await fetch(att.url);
                    const blob = await res.blob();
                    const file = new File([blob], att.name || 'image.png', { type: blob.type });
                    handleFileSelect(file);
                } catch (e) {
                    console.error('Failed to load template attachment', e);
                    antMessage.warning('Не удалось загрузить вложение шаблона');
                }
            }
        }

        setShowTemplates(false);
    };

    useEffect(() => {
        return () => {
            if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        }
    }, [audioPreviewUrl, previewUrl]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // @ts-ignore
            const recorder = new Recorder({
                encoderPath: '/opus-recorder/encoderWorker.min.js',
                streamPages: true,
                encoderApplication: 2048, // VOIP
                encoderFrameSize: 20,
                maxBuffersPerPage: 40,
                numberOfChannels: 1
            });

            recorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = (typedArray: Uint8Array) => {
                audioChunksRef.current.push(typedArray);
            };

            recorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg' });
                const url = URL.createObjectURL(audioBlob);
                setRecordedAudio(audioBlob);
                setAudioPreviewUrl(url);
                stream.getTracks().forEach(track => track.stop());
            };

            await recorder.start(stream);
            setIsRecording(true);
            setRecordingDuration(0);
            recordingTimerRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);

        } catch (error) {
            console.error('Recording error:', error);
            antMessage.error('Не удалось начать запись (доступ к микрофону или ошибка кодека)');
        }
    };

    const stopRecording = () => {
        if (recorderRef.current && isRecording) {
            recorderRef.current.stop();
            setIsRecording(false);
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
        }
    };

    const cancelRecording = () => {
        setRecordedAudio(null);
        setAudioPreviewUrl(null);
        setRecordingDuration(0);
        setIsRecording(false);
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
    };

    const handleFileSelect = (file: File) => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setSelectedFile(file);

        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        } else {
            setPreviewUrl(null);
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const file = items[i].getAsFile();
                if (file) handleFileSelect(file);
                break;
            }
        }
    };

    const clearFile = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setSelectedFile(null);
    };

    const handleSend = async () => {
        if (sending) return;

        if (selectedFile && onSendFile) {
            try {
                let caption = messageInput.trim();
                if (templateButtons.length > 0) {
                    caption = JSON.stringify({ text: caption, buttons: templateButtons });
                }

                await onSendFile(selectedFile, caption || undefined);
                clearFile();
                setMessageInput('');
                setTemplateButtons([]);
            } catch (error) {
                console.error('Failed to send file:', error);
                antMessage.error('Ошибка отправки файла');
            }
            return;
        }

        if (messageInput.trim()) {
            try {
                let contentToSend = messageInput;
                if (templateButtons.length > 0) {
                    contentToSend = JSON.stringify({ text: messageInput, buttons: templateButtons });
                }

                await onSendText(contentToSend);
                setMessageInput('');
                setTemplateButtons([]);
            } catch (e) {
                console.error('Failed to send text:', e);
            }
        }
    };

    const handleSendVoiceAction = async () => {
        if (!recordedAudio || sending) return;
        try {
            await onSendVoice(recordedAudio, recordingDuration);
            cancelRecording();
        } catch (e) {
            console.error('Failed to send voice:', e);
        }
    };

    const getTemplatePreview = (content?: string) => {
        if (!content) return '';
        try {
            const parsed = JSON.parse(content);
            if (parsed.text !== undefined || parsed.attachments !== undefined || parsed.buttons !== undefined) {
                const parts = [];
                if (parsed.attachments?.length) parts.push('📎');
                if (parsed.buttons?.length) parts.push('🔘');
                if (parsed.text) parts.push(parsed.text);
                return parts.join(' ') || 'Пустой шаблон';
            }
            return content;
        } catch {
            return content;
        }
    };

    return (
        <div style={{
            background: '#fff',
            borderTop: '1px solid #f0f0f0',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative'
        }}>
            {showTemplates && (
                <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 16,
                    width: 300,
                    maxHeight: 200,
                    overflowY: 'auto',
                    background: '#fff',
                    boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
                    borderRadius: '8px 8px 0 0',
                    zIndex: 1000,
                    border: '1px solid #f0f0f0'
                }}>
                    {filteredTemplates.map(t => (
                        <div
                            key={t.id}
                            style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #f0f0f0',
                                display: 'flex',
                                flexDirection: 'column'
                            }}
                            className="template-item"
                            onClick={() => handleTemplateSelect(t)}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                        >
                            <div style={{ fontWeight: 500 }}>{t.title}</div>
                            <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {getTemplatePreview(t.content).slice(0, 50)}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {replyTo && (
                <div style={{
                    padding: '8px 16px',
                    borderLeft: '4px solid #1890ff',
                    background: '#f0faff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12
                }}>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1890ff' }}>
                            {replyTo.author_type === 'manager' ? 'Вы' : 'Клиент'}
                        </div>
                        <div style={{
                            fontSize: 12,
                            color: '#595959',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {replyTo.content || (replyTo.message_type === 'voice' ? 'Голосовое сообщение' : 'Файл')}
                        </div>
                    </div>
                    <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                        onClick={onCancelReply}
                    />
                </div>
            )}

            {selectedFile && (
                <div style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: '#fafafa'
                }}>
                    {previewUrl ? (
                        <img
                            src={previewUrl}
                            alt="Preview"
                            style={{ height: 60, borderRadius: 8, objectFit: 'cover' }}
                        />
                    ) : (
                        <div style={{
                            height: 60,
                            width: 60,
                            borderRadius: 8,
                            background: '#f0f0f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 24
                        }}>
                            📎
                        </div>
                    )}
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {selectedFile.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                            {(selectedFile.size / 1024).toFixed(1)} KB
                        </div>
                    </div>
                    <Button
                        danger
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={clearFile}
                    />
                </div>
            )}

            <div style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: 64,
            }}>
                {recordedAudio && audioPreviewUrl ? (
                    <>
                        <Button
                            danger
                            icon={<DeleteOutlined />}
                            onClick={cancelRecording}
                            shape="circle"
                        />
                        <div style={{
                            flex: 1,
                            background: '#f5f5f5',
                            borderRadius: 20,
                            padding: '4px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12
                        }}>
                            <audio src={audioPreviewUrl} controls style={{ height: 32, width: '100%' }} />
                        </div>
                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            onClick={handleSendVoiceAction}
                            loading={sending}
                            shape="circle"
                        />
                    </>
                ) : isRecording ? (
                    <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 12, padding: '0 8px' }}>
                        <div style={{
                            color: '#ff4d4f',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}>
                            <div style={{ width: 10, height: 10, background: '#ff4d4f', borderRadius: '50%' }} />
                            {formatDuration(recordingDuration)}
                        </div>
                        <Text type="secondary" style={{ flex: 1, marginLeft: 16 }}>Запись голосового сообщения...</Text>
                        <Button
                            danger
                            type="primary"
                            icon={<PauseCircleOutlined />}
                            onClick={stopRecording}
                            shape="circle"
                        />
                    </div>
                ) : (
                    <>
                        <TextArea
                            autoSize={{ minRows: 1, maxRows: 4 }}
                            placeholder={placeholder || (selectedFile ? "Добавить описание..." : "Напишите сообщение...")}
                            value={messageInput}
                            onChange={handleInputChange}
                            onPaste={handlePaste}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            style={{ borderRadius: 12, resize: 'none', flex: 1 }}
                        />

                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />

                        {!selectedFile && (
                            <Button
                                icon={<PaperClipOutlined />}
                                shape="circle"
                                size="large"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={sending}
                            />
                        )}

                        {!messageInput.trim() && !selectedFile && (
                            <Button
                                icon={<AudioOutlined />}
                                shape="circle"
                                size="large"
                                onClick={startRecording}
                                disabled={sending}
                            />
                        )}

                        {(!!messageInput.trim() || !!selectedFile) && (
                            <Button
                                type="primary"
                                shape="circle"
                                size="large"
                                icon={<SendOutlined />}
                                onClick={handleSend}
                                loading={sending}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
