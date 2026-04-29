import React from 'react';
import { Button, Typography } from 'antd';
import { RobotOutlined, CloseOutlined } from '@ant-design/icons';
import { useDesign } from '../contexts/DesignContext';
import styles from './SuggestionBar.module.css';

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
  const { useNewDesign } = useDesign();

  if (!suggestion) return null;

  const containerClass = `${styles.container} ${useNewDesign ? styles.newDesign : styles.oldDesign}`;
  const iconClass = `${styles.icon} ${useNewDesign ? styles.newDesign : styles.oldDesign}`;
  const messageClass = `${styles.message} ${useNewDesign ? styles.newDesign : styles.oldDesign}`;

  return (
    <div className={containerClass}>
      <RobotOutlined className={iconClass} />
      <div className={styles.content}>
        <Typography.Text type="secondary" className={styles.label}>
          Предложение AI
        </Typography.Text>
        <Typography.Paragraph
          className={messageClass}
          ellipsis={{ rows: 3, expandable: true }}
        >
          {suggestion.suggested_response}
        </Typography.Paragraph>
      </div>
      <div className={styles.actions}>
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
    </div>
  );
};
