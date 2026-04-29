import React from 'react';
import { Button, Tooltip, Badge } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import { useDesign } from '../contexts/DesignContext';

export const DesignToggle: React.FC = () => {
  const { useNewDesign, toggleDesign } = useDesign();

  return (
    <Tooltip title={useNewDesign ? 'Новый дизайн (Ant v6)' : 'Старый дизайн'}>
      <Badge
        count={useNewDesign ? '✨' : undefined}
        style={{ backgroundColor: useNewDesign ? '#52c41a' : '#999' }}
      >
        <Button
          type="text"
          size="small"
          icon={<BgColorsOutlined />}
          onClick={toggleDesign}
          title={`Переключить на ${useNewDesign ? 'старый' : 'новый'} дизайн`}
          style={{
            color: useNewDesign ? '#52c41a' : '#999',
            border: '1px solid ' + (useNewDesign ? '#52c41a' : '#d9d9d9'),
          }}
        />
      </Badge>
    </Tooltip>
  );
};
