import React from 'react';
import { ClientProfile, STATE_COLORS, ClientState } from '../utils/clientProfile';

interface ClientAvatarProps {
  profile: ClientProfile | null | undefined;
  size?: number;
}

const ClientAvatar: React.FC<ClientAvatarProps> = ({ profile, size = 32 }) => {
  const state = profile?.state as ClientState | undefined;
  const bgColor = state ? STATE_COLORS[state] : '#F0F0F0';
  const emoji = profile?.animal_emoji ?? '👤';
  const showRisk = profile?.risk_flag === true;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: bgColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.55),
          lineHeight: 1,
          border: '1px solid rgba(0,0,0,0.06)',
          userSelect: 'none',
        }}
      >
        {emoji}
      </div>

      {showRisk && (
        <div
          style={{
            position: 'absolute',
            top: -2,
            left: -2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            backgroundColor: '#FF4D4F',
            border: '2px solid #fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 8,
            color: '#fff',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          !
        </div>
      )}
    </div>
  );
};

export default ClientAvatar;
