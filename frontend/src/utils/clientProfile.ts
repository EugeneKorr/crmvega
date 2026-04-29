export type ClientState = 'NEWBIE' | 'ROOKIE' | 'REGULAR' | 'LOYAL' | 'VIP' | 'DORMANT' | 'BLOCK';

export interface ClientProfile {
  telegram_id: string;
  state: ClientState | null;
  animal_name: string | null;
  animal_emoji: string | null;
  adjective: string | null;
  risk_flag: boolean;
  risk_flag_reasons: string[] | null;
  deal_count: number;
}

export const STATE_COLORS: Record<ClientState, string> = {
  BLOCK:   '#FF4D4F',
  NEWBIE:  '#F6FFED',
  ROOKIE:  '#D9F7BE',
  VIP:     '#D3ADF7',
  DORMANT: '#FFE58F',
  LOYAL:   '#91D5FF',
  REGULAR: '#F0F0F0',
};

export const STATE_LABELS: Record<ClientState, string> = {
  NEWBIE:  'Новичок',
  ROOKIE:  'Начинающий',
  REGULAR: 'Постоянный',
  LOYAL:   'Лояльный',
  VIP:     'VIP',
  DORMANT: 'Спящий',
  BLOCK:   'Заблокирован',
};

function dealWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'сделок';
  if (mod10 === 1) return 'сделка';
  if (mod10 >= 2 && mod10 <= 4) return 'сделки';
  return 'сделок';
}

export function formatAnimalSubtitle(profile: ClientProfile): string {
  const adj   = profile.adjective ?? '';
  const name  = profile.animal_name ?? '';
  const label = profile.state ? STATE_LABELS[profile.state] : '';
  const n     = profile.deal_count ?? 0;
  const adjCapital = adj ? adj.charAt(0).toUpperCase() + adj.slice(1) : '';
  const nameLower  = name.toLowerCase();
  return `${adjCapital} ${nameLower} · ${label} · ${n} ${dealWord(n)}`.trim();
}
