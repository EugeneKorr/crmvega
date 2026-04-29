import React from 'react';
import { Button, Typography } from 'antd';
import { RobotOutlined, CloseOutlined } from '@ant-design/icons';

export interface SuggestionData {
  id: number;
  suggested_response: string;
  client_message: string;
  shown_at: number;
}

interface SuggestionBarProps {
  suggestion: SuggestionData | null;
  onInsert: (suggestion: SuggestionData) => void;
  onIgnore: (suggestion: SuggestionData) => void;
}

export const SuggestionBar: React.FC<SuggestionBarProps> = ({ suggestion, onInsert, onIgnore }) => {
  if (!suggestion) return null;

  return (
    <div
      style={{
        background: '#E6F4FF',
        border: '1px solid #91CAFF',
        borderRadius: 8,
        padding: '8px 12px',
        margin: '0 8px 6px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        animation: 'slideDown 0.2s ease',
      }}
    >
      <RobotOutlined style={{ color: '#1677ff', marginTop: 3, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          Предложение AI
        </Typography.Text>
        <Typography.Paragraph
          style={{ margin: '2px 0 0', fontSize: 13, color: '#1d1d1d' }}
          ellipsis={{ rows: 3, expandable: true }}
        >
          {suggestion.suggested_response}
        </Typography.Paragraph>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center', marginTop: 2 }}>
        <Button
          size="small"
          type="primary"
          onClick={() => onInsert(suggestion)}
        >
          Вставить
        </Button>
        <Button
          size="small"
          icon={<CloseOutlined />}
          onClick={() => onIgnore(suggestion)}
        />
      </div>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
