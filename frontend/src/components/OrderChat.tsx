import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Spin,
  Empty,
  Switch,
  Tooltip,
} from 'antd';
import {
  TeamOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { Message, Order } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { UnifiedMessageBubble } from './UnifiedMessageBubble';
import { ChatInput } from './ChatInput';
import { formatDate, isClientMessage } from '../utils/chatUtils';
import { useOrderChat } from '../hooks/useOrderChat';

interface OrderChatProps {
  orderId: number;
  mainId?: number | string;
  contactName?: string;
  isMobile?: boolean;
  order?: Order | null; // Pass order for replacements
}

// Helper for type casting if needed, though hook provides typed messages
interface TimelineMessage extends Message {
  source_type?: 'client' | 'internal';
  sort_date?: string;
  is_system?: boolean;
  display_author?: string;
}

const OrderChat: React.FC<OrderChatProps> = ({ orderId, mainId, contactName, isMobile = false, order }) => {
  const { manager } = useAuth();

  // Use new hook
  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    sending,
    replyTo,
    setReplyTo,
    fetchTimeline,
    sendMessage,
    addReaction
  } = useOrderChat(orderId, mainId ? String(mainId) : undefined, order?.contact_id);

  // Input mode: 'client' (default) or 'internal'
  const [inputMode, setInputMode] = useState<'client' | 'internal'>('client');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  }, []);

  // Initial load
  useEffect(() => {
    fetchTimeline(false);
  }, [fetchTimeline]);

  // Scroll on new messages (simple implementation)
  useEffect(() => {
    // If we are at the bottom or it's initial load, scroll. 
    // For now, just scroll on length change if near bottom or validation needed.
    // But simple approach: scroll on initial load (messages changed from 0 to N)
    if (!loading && !loadingMore && messages.length > 0 && messages.length <= 50) {
      scrollToBottom();
    }
  }, [messages.length, loading, loadingMore, scrollToBottom]);

  // Replacements logic
  const replacements: Record<string, string> = order ? {
    '[Клиент отдает]': order.SumInput != null ? String(order.SumInput) : '',
    '[Отдает в валюте]': order.CurrPair1 || '',
    '[Отправляет из банка]': order.BankRus01 || order.BankEsp || '',
    '[Город РФ где отдает]': order.CityRus01 || order.CityEsp01 || '',
    '[Сеть с какой отправляет USDT]': order.NetworkUSDT01 || '',
    '[Оплата сейчас или при встрече?]': order.PayNow || '',
    '[Клиент получает]': order.SumOutput != null ? String(order.SumOutput) : ''
  } : {};

  // Handlers
  const handleSendText = async (text: string) => {
    const success = await sendMessage(text, inputMode);
    if (success) scrollToBottom();
  };

  const handleSendVoice = async (voice: Blob, duration: number) => {
    const success = await sendMessage('', inputMode, undefined, voice, duration);
    if (success) scrollToBottom();
  };

  const handleSendFile = async (file: File, caption?: string) => {
    const success = await sendMessage(caption || '', inputMode, file);
    if (success) scrollToBottom();
  };

  // Rendering
  const renderList = () => {
    // Messages are DESC (Newest first) from hook. We reverse for display (Oldest top).
    const displayList = [...messages].reverse();

    const groupedMessages: { date: string, msgs: TimelineMessage[] }[] = [];
    displayList.forEach(msg => {
      const d = msg.sort_date || msg['Created Date'] || msg.created_at;
      const dateKey = formatDate(d);
      const lastGroup = groupedMessages[groupedMessages.length - 1];
      if (lastGroup && lastGroup.date === dateKey) {
        lastGroup.msgs.push(msg as TimelineMessage);
      } else {
        groupedMessages.push({ date: dateKey, msgs: [msg as TimelineMessage] });
      }
    });

    return (
      <>
        {hasMore && (
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <button
              onClick={() => fetchTimeline(true)}
              disabled={loadingMore}
              style={{
                background: 'none',
                border: 'none',
                color: '#1890ff',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '13px'
              }}
            >
              {loadingMore ? 'Загрузка...' : 'Загрузить предыдущие'}
            </button>
          </div>
        )}

        {groupedMessages.map(group => (
          <div key={group.date}>
            <div style={{ textAlign: 'center', margin: '16px 0', opacity: 0.5, fontSize: 12 }}>
              <span style={{ background: '#f5f5f5', padding: '4px 12px', borderRadius: 12 }}>{group.date}</span>
            </div>
            {group.msgs.map(msg => {
              if (msg.is_system) {
                return (
                  <div key={`${msg.source_type}_${msg.id}`} style={{
                    textAlign: 'center',
                    margin: '12px 0',
                  }}>
                    <div style={{
                      background: '#f0f0f0',
                      display: 'inline-block',
                      padding: '6px 14px',
                      borderRadius: 16,
                      fontSize: 12,
                      color: '#8c8c8c',
                      maxWidth: '80%',
                      wordWrap: 'break-word'
                    }}>
                      {msg.content}
                    </div>
                  </div>
                );
              }

              let variant: 'client' | 'internal' = 'client';
              if (msg.source_type === 'internal') {
                variant = 'internal';
              }

              let isOwn = false;
              if (msg.source_type === 'client') {
                // For client messages: 
                // If author_type is 'client' -> NOT OWN (Left)
                // If author_type is 'manager' or Manager Name -> OWN (Right)
                // Checking !isClientMessage is safer if we trust chatUtils
                isOwn = !isClientMessage(msg.author_type);
              } else {
                // Internal
                isOwn = msg.sender?.id === manager?.id;
                if (!msg.sender?.id && msg.manager_id === manager?.id) isOwn = true;
              }

              let alignment: 'left' | 'right' | undefined = undefined;
              if (msg.source_type === 'internal') {
                alignment = isOwn ? 'right' : 'left';
              }

              // Resolve Reply Context
              // We search in the *full* messages list (descending)
              let replyCtx: Message | undefined = undefined;
              if (msg.reply_to_mess_id_tg) {
                replyCtx = messages.find(m => m.message_id_tg === msg.reply_to_mess_id_tg);
              } else if ((msg as any).reply_to_id) {
                replyCtx = messages.find(m => m.id === (msg as any).reply_to_id && m.source_type === 'internal');
              }

              return (
                <UnifiedMessageBubble
                  key={`${msg.source_type}_${msg.id}`}
                  msg={msg}
                  isOwn={isOwn}
                  onReply={(m) => setReplyTo(m as TimelineMessage)}
                  onAddReaction={(m, e) => addReaction(m.id, e)}
                  replyMessage={replyCtx}
                  variant={variant}
                  alignment={alignment}
                />
              );
            })}
          </div>
        ))}
      </>
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#fff',
      borderRadius: isMobile ? 0 : 8,
      border: isMobile ? 'none' : '1px solid #f0f0f0',
    }}>
      {/* Header / Mode Switcher */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#fafafa',
        borderRadius: isMobile ? 0 : '8px 8px 0 0'
      }}>
        <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          {contactName || 'Чат с клиентом'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tooltip title="Переключить режим отправки">
            <Switch
              checkedChildren={<><TeamOutlined /> Свои</>}
              unCheckedChildren={<><GlobalOutlined /> Клиент</>}
              checked={inputMode === 'internal'}
              onChange={(checked) => setInputMode(checked ? 'internal' : 'client')}
              style={{ background: inputMode === 'internal' ? '#faad14' : '#1890ff' }}
            />
          </Tooltip>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '8px 4px' : 16 }}>
        {loading && messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
        ) : messages.length === 0 ? (
          <Empty description="Нет сообщений" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : renderList()}
        <div ref={messagesEndRef} />
      </div>

      {replyTo && (
        <div style={{
          padding: '8px 16px',
          background: '#f9f9f9',
          borderTop: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12
        }}>
          <div>
            Ответ на: <b>{replyTo.display_author || (replyTo as any).sender?.name}</b>
            <div style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#888' }}>
              {replyTo.content || 'Вложение'}
            </div>
          </div>
          <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: '#1890ff', cursor: 'pointer', padding: 0 }}>Отмена</button>
        </div>
      )}

      {/* Input Area with visual indicator of mode */}
      <div style={{
        borderLeft: inputMode === 'internal' ? '4px solid #faad14' : '4px solid #1890ff',
        transition: 'all 0.3s'
      }}>
        <ChatInput
          onSendText={handleSendText}
          onSendVoice={handleSendVoice}
          onSendFile={handleSendFile}
          sending={sending}
          replacements={replacements}
          placeholder={inputMode === 'internal' ? "Внутренняя заметка..." : "Написать клиенту..."}
        />
      </div>
    </div>
  );
};

export default OrderChat;
