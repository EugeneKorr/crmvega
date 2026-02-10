import { ORDER_STATUSES, StatusDefinition } from './statuses';

export const STATUS_MAPPING: Record<string, string> = {};

// Генерируем маппинг динамически из ORDER_STATUSES
Object.entries(ORDER_STATUSES).forEach(([key, value]) => {
    const statusDef = value as StatusDefinition;
    // Маппинг по ID (если есть)
    if (statusDef.bubble_id) {
        STATUS_MAPPING[statusDef.bubble_id] = key;
    }
    // Маппинг по названию (Label)
    if (statusDef.label) {
        STATUS_MAPPING[statusDef.label] = key;
    }
});

// Доп. алиасы для обратной совместимости (можно оставить хардкодом, если они не в конфиге)
// Например legacy значения
const LEGACY_MAPPING: Record<string, string> = {
    'Выполнен': 'completed',
    'Исполнена': 'completed',
    'duplicate': 'duplicate'
};

Object.assign(STATUS_MAPPING, LEGACY_MAPPING);

export const mapStatus = (inputStatus: string | null | undefined): string => {
    if (!inputStatus) return 'unsorted';
    const key = String(inputStatus).trim();
    // Prioritize direct match, then mapping
    if (ORDER_STATUSES[key]) return key;
    return STATUS_MAPPING[key] || 'unsorted';
};
