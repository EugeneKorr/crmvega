import React, { useState } from 'react';
import { Button, Card, message, Typography } from 'antd';
import { LoginOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const { Text, Title } = Typography;

// TEMPORARY: Quick login without password
const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { quickLogin } = useAuth() as any;
  const navigate = useNavigate();

  const handleQuickLogin = async () => {
    setLoading(true);
    try {
      await quickLogin();
      message.success('Добро пожаловать!');
      navigate('/orders');
    } catch (error: any) {
      message.error('Ошибка входа: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Card
        style={{
          width: '100%',
          maxWidth: 420,
          margin: '0 16px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          borderRadius: 12
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ margin: 0, color: '#1890ff' }}>MINI CRM</Title>
          <Text type="secondary">Система управления клиентами</Text>
        </div>

        <div style={{ padding: '0 24px' }}>
          <Title level={4} style={{ textAlign: 'center', marginBottom: 24 }}>Вход в систему</Title>
          <Button
            type="primary"
            icon={<LoginOutlined />}
            loading={loading}
            block
            size="large"
            onClick={handleQuickLogin}
            style={{ height: 48 }}
          >
            Войти
          </Button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            © 2025 MINI CRM. Все права защищены.
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default Login;

