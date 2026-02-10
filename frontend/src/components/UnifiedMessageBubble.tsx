import React, { useState, useRef } from 'react';
import {
    Avatar,
    Popover,
    message as antMessage
} from 'antd';
import {
    PlayCircleOutlined,
    PauseCircleOutlined,
    UserOutlined,
    RollbackOutlined,
    FileOutlined,
    DownloadOutlined,
    CopyOutlined,
    ClockCircleOutlined,
    ExclamationCircleFilled,
    SmileOutlined
} from '@ant-design/icons';
import { Image, Typography, Button as AntButton } from 'antd';
import { isClientMessage, getAvatarColor, formatTime, linkifyText } from '../utils/chatUtils';
import { Message } from '../types';

const { Text } = Typography;

interface UnifiedMessageBubbleProps {
    msg: Message;
    isOwn: boolean;
    onReply?: (msg: Message) => void;
    onAddReaction?: (msg: Message, emoji: string) => void;
    replyMessage?: Message;
    isPending?: boolean;
    error?: boolean;
    alignment?: 'left' | 'right';
    variant?: 'client' | 'internal';
    onRecall?: (msg: Message) => void;
}

const DEFAULT_REACTIONS = ['👍', '❤️', '🔥', '😱', '😢', '🙏', '👌', '😇'];

export const UnifiedMessageBubble: React.FC<UnifiedMessageBubbleProps> = ({
    msg,
    isOwn,
    onReply,
    onAddReaction,
    replyMessage,
    alignment,
    variant = 'client',
    isPending: propIsPending,
    error: propError
}) => {
    const isPending = propIsPending || (msg as any).isPending;
    const isError = propError || (msg as any).error;

    const isFromClient = isClientMessage(msg.author_type);
    const align = alignment || (isFromClient ? 'left' : 'right');
    const isRight = align === 'right';
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const isLongPress = useRef(false);

    const getBubbleStyles = () => {
        if (msg.message_type === 'system') {
            return {
                background: '#f5f5f5',
                color: '#595959',
                borderRadius: '8px',
                border: '1px dashed #d9d9d9',
                linkColor: '#1890ff',
                width: '100%',
                margin: '8px 0',
                fontSize: 12,
                textAlign: 'center' as const
            };
        }

        const baseStyles = variant === 'internal'
            ? (isRight ? { background: 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)', color: 'white', borderRadius: '16px 4px 16px 16px' } : { background: 'linear-gradient(135deg, #13c2c2 0%, #08979c 100%)', color: 'white', borderRadius: '4px 16px 16px 16px' })
            : (isRight ? { background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)', color: 'white', borderRadius: '16px 4px 16px 16px' } : { background: '#ffffff', color: 'rgba(0,0,0,0.85)', borderRadius: '4px 16px 16px 16px', border: '1px solid #f0f0f0' });

        return {
            ...baseStyles,
            opacity: isPending ? 0.6 : 1,
            transition: 'opacity 0.3s ease',
            linkColor: isRight ? 'rgba(255,255,255,0.9)' : '#1890ff'
        };
    };

    const styles = getBubbleStyles();

    const handleCopy = () => {
        if (msg.content) {
            navigator.clipboard.writeText(msg.content)
                .then(() => antMessage.success('Скопировано'))
                .catch(() => antMessage.error('Ошибка копирования'));
        }
        setMenuOpen(false);
    };

    const handleReactionClick = (emoji: string) => {
        if (onAddReaction) onAddReaction(msg, emoji);
        setMenuOpen(false);
    };

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const contentMenu = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
            <div style={{ display: 'flex', gap: 4, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                {DEFAULT_REACTIONS.map(emoji => (
                    <div
                        key={emoji}
                        onClick={() => handleReactionClick(emoji)}
                        style={{ fontSize: 20, cursor: 'pointer', padding: 4, borderRadius: 4, transition: 'background 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        {emoji}
                    </div>
                ))}
            </div>

            <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 4px', borderRadius: 4 }}
                onClick={() => { onReply && onReply(msg); setMenuOpen(false); }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
                <RollbackOutlined /> Ответить
            </div>
            {msg.content && (
                <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 4px', borderRadius: 4 }}
                    onClick={handleCopy}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <CopyOutlined /> Копировать текст
                </div>
            )}
        </div>
    );

    const handleDownload = async (url: string, filename: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename || 'download';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            window.open(url, '_blank');
        }
    };

    const renderAttachment = () => {
        const effectiveFileUrl = msg.file_url || (
            (/^https?:\/\/[^\s]+$/i.test(msg.content?.trim() || ''))
                ? msg.content?.trim()
                : null
        );

        if (effectiveFileUrl) {
            const isImage = effectiveFileUrl.match(/\.(jpg|jpeg|png|gif|webp|heic)$/i) || (effectiveFileUrl.includes('bubble.io') && !effectiveFileUrl.includes('.') && !msg.file_name);
            const isVoice = msg.message_type === 'voice' || effectiveFileUrl.endsWith('.ogg') || effectiveFileUrl.endsWith('.wav');
            const fileName = msg.file_name || 'file';

            if (isVoice) {
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160, marginTop: 8 }}>
                        <div onClick={(e) => { e.stopPropagation(); toggleAudio(); }} style={{ cursor: 'pointer', fontSize: 24 }}>
                            {isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                        </div>
                        <audio ref={audioRef} src={effectiveFileUrl} onEnded={() => setIsPlaying(false)} style={{ display: 'none' }} />
                        {msg.voice_duration && <span style={{ fontSize: 11 }}>{formatTime(new Date(0).setSeconds(msg.voice_duration || 0)).substr(3)}</span>}
                    </div>
                );
            }

            if (isImage) {
                return (
                    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 4 }}>
                        <Image width="100%" src={effectiveFileUrl} alt="attachment" style={{ borderRadius: 8, maxHeight: 300, objectFit: 'cover' }} preview={{ mask: false }} />
                    </div>
                );
            }

            if (effectiveFileUrl.startsWith('http')) {
                return (
                    <div
                        onClick={(e) => { e.stopPropagation(); handleDownload(effectiveFileUrl!, fileName); }}
                        style={{ color: styles.linkColor, textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer' }}
                    >
                        <DownloadOutlined /> {msg.file_name || 'Скачать файл'}
                    </div>
                );
            }
        }
        return null;
    };

    const parseContent = (content: string) => {
        try {
            if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
                const parsed = JSON.parse(content);
                if (parsed && (parsed.text !== undefined || parsed.buttons !== undefined)) {
                    return { text: parsed.text || '', buttons: parsed.buttons || [], isJson: true };
                }
            }
        } catch (e) { }
        return { text: content, buttons: [], isJson: false };
    };

    const { text: rawText, buttons: displayButtons } = msg.content ? parseContent(msg.content) : { text: '', buttons: [] };
    const displayText = rawText;

    return (
        <div className="message-bubble-container" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: isRight ? 'flex-end' : 'flex-start',
            marginBottom: 16,
            position: 'relative',
            width: '100%'
        }}>
            {replyMessage && (
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, maxWidth: '80%' }}>
                    <RollbackOutlined style={{ fontSize: 10 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {replyMessage.content ? parseContent(replyMessage.content).text : 'Вложение'}
                    </span>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: isRight ? 'row-reverse' : 'row', maxWidth: '100%', gap: 8 }}>
                <Avatar
                    style={{ backgroundColor: getAvatarColor(msg.author_type), flexShrink: 0, marginTop: 'auto', border: '2px solid #fff' }}
                    icon={msg.author_type === 'customer' ? <UserOutlined /> : undefined}
                >
                    {msg.author_type && msg.author_type !== 'customer' ? msg.author_type.charAt(0).toUpperCase() : <UserOutlined />}
                </Avatar>

                <div style={{ ...styles, padding: '10px 14px', minWidth: 60, boxShadow: '0 1px 2px rgba(0,0,0,0.05)', position: 'relative' }}>
                    {!isFromClient && (
                        <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.9, marginBottom: 2, textAlign: isRight ? 'right' : 'left' }}>
                            {msg.sender?.name || msg.user || 'Оператор'}
                        </div>
                    )}

                    <div className="message-hover-actions" style={{
                        position: 'absolute',
                        right: isRight ? 'auto' : -30,
                        left: isRight ? -30 : 'auto',
                        top: 0,
                        display: 'none',
                        flexDirection: 'column',
                        gap: 4
                    }}>
                        {onReply && (
                            <AntButton
                                size="small"
                                type="text"
                                icon={<RollbackOutlined />}
                                onClick={() => onReply(msg)}
                                style={{ color: '#8c8c8c', background: 'rgba(255,255,255,0.8)', borderRadius: '50%', width: 28, height: 28, padding: 0 }}
                            />
                        )}
                    </div>

                    {renderAttachment()}

                    {displayText && (
                        <div style={{ fontSize: 14, lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: msg.file_url ? 8 : 0 }}>
                            {linkifyText(displayText)}
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4, gap: 4, opacity: 0.7, fontSize: 10 }}>
                        {isError ? (
                            <span style={{ color: '#ff4d4f', display: 'flex', alignItems: 'center', gap: 2 }}>
                                <ExclamationCircleFilled /> Ошибка
                            </span>
                        ) : (
                            <>
                                {formatTime(msg['Created Date'] || msg.created_at)}
                                {isPending ? (
                                    <ClockCircleOutlined style={{ animation: 'spin 2s linear infinite' }} />
                                ) : (
                                    isOwn && <span style={{ color: isRight ? 'white' : '#1890ff' }}>✓</span>
                                )}
                            </>
                        )}
                    </div>

                    <Popover content={contentMenu} trigger="click" open={menuOpen} onOpenChange={setMenuOpen} placement="bottom">
                        <div style={{
                            cursor: 'pointer',
                            position: 'absolute',
                            right: isRight ? 'auto' : -24,
                            left: isRight ? -24 : 'auto',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            opacity: 0.6,
                            padding: '4px',
                            fontSize: 16,
                            color: '#8c8c8c'
                        }}>
                            ⋮
                        </div>
                    </Popover>
                </div>
            </div>

            {msg.reactions && msg.reactions.length > 0 && (
                <div style={{
                    display: 'flex',
                    gap: 4,
                    marginTop: 4,
                    marginLeft: isRight ? 0 : 48,
                    marginRight: isRight ? 48 : 0,
                    flexWrap: 'wrap'
                }}>
                    {msg.reactions.map((r, i) => (
                        <div key={i} style={{
                            background: '#fff',
                            border: '1px solid #f0f0f0',
                            borderRadius: 10,
                            padding: '2px 6px',
                            fontSize: 12,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2
                        }}>
                            {r.emoji}
                        </div>
                    ))}
                </div>
            )}
            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .message-bubble-container:hover .message-hover-actions {
                    display: flex !important;
                }
            `}</style>
        </div>
    );
};
