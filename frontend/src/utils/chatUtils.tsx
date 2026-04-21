import React from 'react';

// Determine if message is from client
export const isClientMessage = (authorType?: string): boolean => {
    if (!authorType) return false;
    const clientTypes = ['Клиент', 'user', 'client', 'customer'];
    return clientTypes.includes(authorType);
};

// Get avatar color based on author type
export const getAvatarColor = (authorType?: string): string => {
    if (!authorType) return '#8c8c8c';
    const colors: Record<string, string> = {
        'Клиент': '#52c41a',
        'user': '#52c41a',
        'client': '#52c41a',
        'Оператор': '#1890ff',
        'Менеджер': '#722ed1',
        'Админ': '#eb2f96',
        'Бот': '#faad14',
        'Служба заботы': '#13c2c2',
        'manager': '#1890ff',
    };
    return colors[authorType] || '#8c8c8c';
};

const MADRID_TZ = 'Europe/Madrid';

// Parse date string safely
// Bubble.io sends timestamps as "2026-04-21 12:03:15" (no 'Z', no offset) — these are UTC
export const parseDate = (date: string | number | Date): Date => {
    if (date instanceof Date) return date;
    if (!date) return new Date();
    if (typeof date === 'string' && !date.includes('+') && !date.endsWith('Z') &&
        /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(date)) {
        return new Date(date.replace(' ', 'T') + 'Z');
    }
    return new Date(date);
};
export const formatTime = (date?: string | number): string => {
    if (!date) return '';
    const d = parseDate(date);
    return d.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: MADRID_TZ
    });
};

export const formatMadridDateTime = (date?: string | number | Date): string => {
    if (!date) return '';
    const d = parseDate(date as string | number | Date);
    return d.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: MADRID_TZ
    });
};

export const formatMadridDate = (date?: string | number | Date): string => {
    if (!date) return '';
    const d = parseDate(date as string | number | Date);
    return d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        timeZone: MADRID_TZ
    });
};

// Format date
export const formatDate = (date?: string | number): string => {
    if (!date) return '';
    const d = parseDate(date);
    const now = new Date();

    const madridOptions: Intl.DateTimeFormatOptions = {
        timeZone: MADRID_TZ,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
    };

    const dString = d.toLocaleDateString('ru-RU', madridOptions);
    const nowString = now.toLocaleDateString('ru-RU', madridOptions);

    if (dString === nowString) {
        return 'Сегодня';
    }

    // Check Yesterday: Create a date that is "Now in Madrid" minus 24h
    // Since we can't easily manipulate "Madrid Time" directly without a lib, 
    // we approximate by checking if the date string matches yesterday's date string in Madrid.
    // 86400000 ms = 1 day.
    const yesterdayTime = now.getTime() - 86400000;
    const yesterday = new Date(yesterdayTime);
    const yesterdayString = yesterday.toLocaleDateString('ru-RU', madridOptions);

    if (dString === yesterdayString) {
        return 'Вчера';
    }

    return d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        timeZone: MADRID_TZ
    });
};

// Linkify text
export const linkifyText = (text?: string): React.ReactNode => {
    if (!text) return null;

    const combinedRegex = /(https?:\/\/[^\s]+|@\w+)/g;
    const parts = text.split(combinedRegex);

    return parts.map((part, index) => {
        // URL
        if (/(https?:\/\/[^\s]+)/g.test(part)) {
            return (
                <a
                    key={index}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        color: 'inherit',
                        textDecoration: 'underline',
                        wordBreak: 'break-all'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {part}
                </a>
            );
        }

        // Username
        if (/(@\w+)/g.test(part)) {
            const username = part.substring(1);
            return (
                <a
                    key={index}
                    href={`https://t.me/${username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        color: 'inherit',
                        textDecoration: 'underline',
                        fontWeight: 500
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {part}
                </a>
            );
        }

        return part;
    });
};

export const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};
