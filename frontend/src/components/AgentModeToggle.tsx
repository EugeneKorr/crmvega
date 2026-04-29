import React from 'react';
import { Switch, Tooltip } from 'antd';
import { RobotOutlined, PauseCircleOutlined } from '@ant-design/icons';

interface AgentModeToggleProps {
  mode: 'auto' | 'off';
  loading: boolean;
  onChange: (newMode: 'auto' | 'off') => void;
}

export const AgentModeToggle: React.FC<AgentModeToggleProps> = ({ mode, loading, onChange }) => {
  const isAuto = mode === 'auto';

  return (
    <Tooltip title={isAuto ? 'AI подсказки включены — нажми чтобы выключить' : 'AI подсказки выключены — нажми чтобы включить'}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
        onClick={() => onChange(isAuto ? 'off' : 'auto')}
      >
        {isAuto
          ? <RobotOutlined style={{ color: '#1677ff', fontSize: 16 }} />
          : <PauseCircleOutlined style={{ color: '#8c8c8c', fontSize: 16 }} />
        }
        <Switch
          checked={isAuto}
          loading={loading}
          size="small"
          style={{ background: isAuto ? '#1677ff' : '#d9d9d9' }}
          onChange={(checked) => onChange(checked ? 'auto' : 'off')}
          onClick={(_checked, e) => e.stopPropagation()}
        />
        <span style={{ fontSize: 12, color: isAuto ? '#1677ff' : '#8c8c8c' }}>
          {isAuto ? 'Авто' : 'Выкл'}
        </span>
      </div>
    </Tooltip>
  );
};
