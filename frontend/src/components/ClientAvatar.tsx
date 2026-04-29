import React from 'react';
import { ClientProfile, STATE_COLORS, ClientState } from '../utils/clientProfile';
import styles from './ClientAvatar.module.css';

interface ClientAvatarProps {
  profile: ClientProfile | null | undefined;
  size?: number;
}

const ClientAvatar: React.FC<ClientAvatarProps> = ({ profile, size = 32 }) => {
  const state = profile?.state as ClientState | undefined;
  const bgColor = state ? STATE_COLORS[state] : '#F0F0F0';
  const emoji = profile?.animal_emoji ?? '👤';
  const showRisk = profile?.risk_flag === true;

  const avatarStyle: React.CSSProperties = {
    width: size,
    height: size,
    backgroundColor: bgColor,
    fontSize: Math.round(size * 0.55),
  };

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
  };

  return (
    <div className={styles.container} style={containerStyle}>
      <div className={styles.avatar} style={avatarStyle}>
        {emoji}
      </div>

      {showRisk && (
        <div className={styles.riskBadge}>
          !
        </div>
      )}
    </div>
  );
};

export default ClientAvatar;
