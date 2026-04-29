import React from 'react';
import { Switch, Tooltip } from 'antd';
import { RobotOutlined, PauseCircleOutlined } from '@ant-design/icons';
import styles from './AgentModeToggle.module.css';

interface AgentModeToggleProps {
  mode: 'auto' | 'off';
  loading: boolean;
  onChange: (newMode: 'auto' | 'off') => void;
}

export const AgentModeToggle: React.FC<AgentModeToggleProps> = ({ mode, loading, onChange }) => {
  const isAuto = mode === 'auto';
  const tooltipText = isAuto
    ? 'AI подсказки включены — нажми чтобы выключить'
    : 'AI подсказки выключены — нажми чтобы включить';

  return (
    <Tooltip title={tooltipText}>
      <div
        className={styles.container}
        onClick={() => onChange(isAuto ? 'off' : 'auto')}
      >
        {isAuto
          ? <RobotOutlined className={styles.iconActive} />
          : <PauseCircleOutlined className={styles.iconInactive} />
        }
        <Switch
          checked={isAuto}
          loading={loading}
          size="small"
          onChange={(checked) => onChange(checked ? 'auto' : 'off')}
          onClick={(_checked, e) => e.stopPropagation()}
        />
        <span className={`${styles.label} ${isAuto ? styles.labelActive : styles.labelInactive}`}>
          {isAuto ? 'Авто' : 'Выкл'}
        </span>
      </div>
    </Tooltip>
  );
};
