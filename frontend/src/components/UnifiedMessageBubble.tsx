import React, { useState, useRef } from 'react';
import {
    Avatar,
    Popover,
    Dropdown,
    message as antMessage
} from 'antd';
import type { MenuProps } from 'antd';
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
    const audioRef = useRef<HTMLAudioElement>(null);

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

    const [menuOpen, setMenuOpen] = useState(false);

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

    const menuItems: MenuProps['items'] = [
        {
            key: 'reply',
            label: 'Ответить',
            icon: <RollbackOutlined />,
            onClick: () => { onReply && onReply(msg); }
        },
        {
            key: 'copy',
            label: 'Копировать',
            icon: <CopyOutlined />,
            disabled: !msg.content,
            onClick: handleCopy
        },
        {
            type: 'divider',
        },
        {
            key: 'reactions',
            label: 'Реакции',
            children: DEFAULT_REACTIONS.map(emoji => ({
                key: `reaction-${emoji}`,
                label: <span style={{ fontSize: 18 }}>{emoji}</span>,
                onClick: () => handleReactionClick(emoji)
            }))
        }
    ];

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

    const toggleAudio = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };


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

    const { text: rawText, buttons: displayButtons } = msg.content ? parseContent(msg.content) : { text: '', buttons: [] };

    // Detect Attachment Types
    const effectiveFileUrl = msg.file_url || msg.attachment_url || (msg as any).attachment_url_internal || (
        (/^https?:\/\/[^\s]+$/i.test(msg.content?.trim() || ''))
            ? msg.content?.trim()
            : null
    );

    const isVoice = msg.message_type === 'voice' || (effectiveFileUrl && (effectiveFileUrl.endsWith('.ogg') || effectiveFileUrl.endsWith('.oga') || effectiveFileUrl.endsWith('.wav') || effectiveFileUrl.endsWith('.mp3')));
    const isImage = (effectiveFileUrl && effectiveFileUrl.match(/\.(jpg|jpeg|png|gif|webp|heic)$/i)) || (effectiveFileUrl && effectiveFileUrl.includes('bubble.io') && !effectiveFileUrl.includes('.') && !msg.file_name);
    const isVideo = msg.message_type === 'video' || (effectiveFileUrl && effectiveFileUrl.match(/\.(mp4|webm|mov|quicktime)$/i));

    // Hide text if it is just the link or if it is a media message
    const shouldHideText = isVoice || isImage || isVideo || (rawText?.trim() === effectiveFileUrl?.trim()) || ['📎 Файл', '📷 Изображение', '🎤 Голосовое сообщение'].includes(rawText?.trim() || '');
    const displayText = shouldHideText ? '' : rawText;

    const renderAttachment = () => {
        if (!effectiveFileUrl) return null;

        if (isVoice) {
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120, marginTop: 4 }}>
                    <div
                        onClick={(e) => { e.stopPropagation(); toggleAudio(); }}
                        style={{
                            cursor: 'pointer',
                            fontSize: 24,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                    </div>
                    <span style={{ fontSize: 12 }}>
                        {msg.voice_duration ? new Date(msg.voice_duration * 1000).toISOString().substr(14, 5) : '0:00'}
                    </span>
                    <audio ref={audioRef} src={effectiveFileUrl} onEnded={() => setIsPlaying(false)} style={{ display: 'none' }} />
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

        if (isVideo) {
            return (
                <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 4 }}>
                    <video
                        width="100%"
                        controls
                        src={effectiveFileUrl}
                        style={{ borderRadius: 8, maxHeight: 300, objectFit: 'cover' }}
                    />
                </div>
            );
        }

        if (effectiveFileUrl.startsWith('http')) {
            return (
                <div
                    onClick={(e) => { e.stopPropagation(); handleDownload(effectiveFileUrl!, msg.file_name || 'file'); }}
                    style={{ color: styles.linkColor, textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer' }}
                >
                    <DownloadOutlined /> {msg.file_name || 'Скачать файл'}
                </div>
            );
        }
        return null;
    };

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

                <Dropdown
                    menu={{ items: menuItems }}
                    trigger={['contextMenu']}
                >
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

                        {displayButtons && displayButtons.length > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {displayButtons.map((btn: any, idx: number) => (
                                    <AntButton
                                        key={idx}
                                        size="small"
                                        block
                                        href={btn.url}
                                        target="_blank"
                                        style={{
                                            background: 'rgba(255,255,255,0.9)',
                                            color: '#1890ff',
                                            borderColor: 'transparent',
                                            fontWeight: 500
                                        }}
                                    >
                                        {btn.text}
                                    </AntButton>
                                ))}
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
                                        isOwn && (
                                            <span style={{ color: isRight ? 'white' : '#1890ff', fontWeight: 'bold', fontSize: 10 }}>
                                                {msg.is_read ? '✓✓' : '✓'}
                                            </span>
                                        )
                                    )}
                                </>
                            )}
                        </div>

                    </div>
                </Dropdown>
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
                .message-bubble-container:hover .message-menu-trigger {
                    opacity: 1 !important;
                    background: #f0f0f0 !important;
                }
            `}</style>
        </div>
    );
};
