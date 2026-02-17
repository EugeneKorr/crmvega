import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { runAutomations } from './automationRunner';
import { sendBubbleStatusWebhook } from '../utils/bubbleWebhook';
import { ordersCache, generateCacheKey, clearCache } from '../utils/cache';
import { ORDER_STATUSES, StatusDefinition } from '../utils/statuses';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

// Interfaces
interface OrderFilterQuery {
    contact_id?: string;
    status?: string;
    tag_id?: string;
    limit?: string | number;
    offset?: string | number;
    minimal?: string; // 'true' | 'false'
    dateFrom?: string;
    dateTo?: string;
    amountMin?: string;
    amountMax?: string;
    currency?: string;
    sources?: string | string[]; // comma separated or array
    closedBy?: string;
    statuses?: string | string[];
    amountOutputMin?: string;
    amountOutputMax?: string;
    currencyOutput?: string;
    location?: string;
    tags?: string;
    [key: string]: any;
}

interface Manager {
    id: number | string;
    name?: string;
    email?: string;
    notification_settings?: any;
}

interface OrderData {
    contact_id?: number | string;
    title?: string;
    amount?: number | string;
    currency?: string;
    status?: string;
    source?: string;
    description?: string;
    type?: string;
    main_id?: number | string;
    [key: string]: any;
}

interface UpdateOrderFields {
    title?: string;
    description?: string;
    amount?: number | string;
    currency?: string;
    status?: string;
    [key: string]: any;
}

class OrdersService {
    /**
     * Получить список заявок с фильтрацией и пагинацией
     */
    async getAll(query: OrderFilterQuery, manager?: Manager) {
        const { contact_id, status, tag_id, limit, offset = 0, minimal, ...filters } = query;

        // Кэширование (только для простых запросов без специфичных фильтров пользователя)
        const cacheKey = generateCacheKey('orders', query);
        const cachedData = ordersCache.get(cacheKey);
        if (cachedData) return cachedData;

        const isMinimal = minimal === 'true';
        let dbQuery;

        if (isMinimal) {
            dbQuery = supabase
                .from('orders')
                .select(`id, contact_id, "OrderName", "SumInput", "CurrPair1", status, created_at, main_id, "CityEsp02", "DeliveryTime", "NextDay", "SumOutput", "CurrPair2", contact:contacts(id, name), manager:managers!deals_manager_id_fkey(id, name)${tag_id ? ', order_tags!inner(tag_id)' : ''}`)
                .order('created_at', { ascending: false });
        } else {
            dbQuery = supabase
                .from('orders')
                .select(`
          *,
          contact:contacts(id, name, email, phone),
          manager:managers!deals_manager_id_fkey(id, name)${tag_id ? ', order_tags!inner(tag_id)' : ''}
        `)
                .order('created_at', { ascending: false });
        }

        if (limit) {
            dbQuery = dbQuery.range(Number(offset), Number(offset) + Number(limit) - 1);
        }

        // Применение фильтров
        await this._applyFilters(dbQuery, { contact_id, status, tag_id, ...filters });

        const { data, error } = await dbQuery;
        if (error) throw error;

        let orders = await this._processOrdersData(data, isMinimal, tag_id);

        const response = { orders };
        ordersCache.set(cacheKey, response);

        return response;
    }

    /**
     * Получить одну заявку по ID (поддерживает и id и main_id)
     */
    async getById(id: string | number) {
        const numericId = parseInt(String(id));
        let lookupField = 'id';
        let lookupValue = numericId;

        if (numericId > 1000000000) {
            lookupField = 'main_id';
            lookupValue = numericId;
        }

        const { data, error } = await supabase
            .from('orders')
            .select(`
        *,
        contact:contacts(*),
        manager:managers!deals_manager_id_fkey(id, name, email),
        tags:order_tags(tag:tags(*))
      `)
            .eq(lookupField, lookupValue)
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;

        // Форматирование
        data.tags = data.tags?.map((t: any) => t.tag).filter(Boolean) || [];
        data.amount = parseFloat(data.SumInput) || 0;

        return data;
    }

    /**
     * Создать новую заявку
     */
    async create(orderData: OrderData, manager: Manager) {
        const {
            contact_id, title, amount, currency, status, source,
            description, type, main_id
        } = orderData;

        const { data, error } = await supabase
            .from('orders')
            .insert({
                contact_id,
                OrderName: title,
                SumInput: amount,
                CurrPair1: currency || 'RUB',
                status: status || 'new',
                type: type || 'exchange',
                source,
                Comment: description,
                manager_id: manager.id,
                main_id: main_id || parseInt(`${Date.now()}${crypto.randomInt(100, 999)}`)
            })
            .select('*, contact:contacts(name, phone, email)')
            .single();

        if (error) throw error;

        // Side effects
        clearCache('orders');
        this._runCreationSideEffects(data, manager);

        return data;
    }

    async update(id: string | number, updateFields: UpdateOrderFields, manager: Manager) {
        const numericId = parseInt(String(id));
        let lookupField = 'id';
        let lookupValue = numericId;
        if (numericId > 1000000000) {
            lookupField = 'main_id';
            lookupValue = numericId;
        }

        // 1. Get Old Data
        const { data: oldOrder, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq(lookupField, lookupValue)
            .maybeSingle();

        if (fetchError || !oldOrder) throw new Error('Order not found');

        // 2. Prepare Update Data
        const { title, description, amount, currency, ...otherData } = updateFields;
        const updateData: any = {
            ...otherData,
            ...(title ? { OrderName: title } : {}),
            ...(description ? { Comment: description } : {}),
            ...(amount !== undefined ? { SumInput: amount } : {}),
            ...(currency ? { CurrPair1: currency } : {})
        };

        // Auto-track closer
        if (updateData.status) {
            const FINAL_STATUSES = ['completed', 'client_rejected', 'scammer', 'partially_completed', 'postponed'];
            if (FINAL_STATUSES.includes(updateData.status) && !FINAL_STATUSES.includes(oldOrder.status)) {
                updateData.closed_by_manager_id = manager.id;
            }
        }

        // 3. Perform Update
        const { data, error } = await supabase
            .from('orders')
            .update(updateData)
            .eq(lookupField, lookupValue)
            .select('*, contact:contacts(name, phone, email)')
            .single();

        if (error) throw error;

        // 4. Side Effects
        clearCache('orders');
        await this._runUpdateSideEffects(data, oldOrder, updateData, manager);

        return data;
    }

    async delete(id: string | number) {
        const { error } = await supabase
            .from('orders')
            .delete()
            .eq('id', id);

        if (error) throw error;

        clearCache('orders');
        return true;
    }

    async clearUnsorted(manager: Manager) {
        const { error, count } = await supabase
            .from('orders')
            .delete({ count: 'exact' })
            .or('status.eq.unsorted,status.eq.new,status.is.null');

        if (error) throw error;

        clearCache('orders');
        return count;
    }

    async bulkUpdateStatus(ids: (number | string)[], status: string, manager: Manager) {
        if (!Array.isArray(ids) || ids.length === 0) throw new Error('ids must be a non-empty array');
        if (!ids.every(id => Number.isInteger(Number(id)))) throw new Error('ids must contain valid identifiers');

        // 1. Get Old Data
        const { data: oldOrders } = await supabase.from('orders').select('id, status, main_id, OrderName').in('id', ids);

        // 2. Update
        const { data: updatedOrders, error } = await supabase
            .from('orders')
            .update({ status })
            .in('id', ids)
            .select('*, contact:contacts(name, phone, email)');

        if (error) throw error;

        clearCache('orders');

        // 3. Side Effects (Parallel)
        if (updatedOrders) {
            await Promise.all(updatedOrders.map(async (newOrder) => {
                const oldOrder = oldOrders?.find(o => o.id === newOrder.id);
                if (oldOrder && oldOrder.status !== status) {
                    await this._runStatusChangeSideEffects(newOrder, oldOrder, manager);
                }
            }));
        }

        return updatedOrders?.length || 0;
    }

    async bulkDelete(ids: (number | string)[]) {
        if (!Array.isArray(ids) || ids.length === 0) throw new Error('ids must be a non-empty array');

        const { error, count } = await supabase
            .from('orders')
            .delete({ count: 'exact' })
            .in('id', ids);

        if (error) throw error;

        clearCache('orders');
        return count;
    }

    async getUnreadCount(managerId: string | number) {
        const { data: manager } = await supabase
            .from('managers')
            .select('notification_settings')
            .eq('id', managerId)
            .single();

        const settings = manager?.notification_settings || {};
        const { all_active = true, statuses = [] } = settings;

        // Fetch all unique main_ids that have unread messages using optimized RPC
        const { data: unreadMainIds, error: rpcError } = await supabase.rpc('get_unread_main_ids');
        if (rpcError) throw rpcError;

        if (!unreadMainIds || unreadMainIds.length === 0) return 0;

        const distinctMainIds = unreadMainIds.map((m: any) => m.main_id);

        // Count distinct orders that have unread messages and match the status filter
        let query = supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .in('main_id', distinctMainIds);

        if (!all_active && statuses && statuses.length > 0) {
            query = query.in('status', statuses);
        }

        const { count, error } = await query;
        if (error) throw error;

        return count || 0;
    }

    // --- Private Helpers ---

    async _applyFilters(query: any, filters: OrderFilterQuery) {
        const { contact_id, status, tag_id, dateFrom, dateTo, amountMin, amountMax,
            currency, sources, closedBy, statuses, amountOutputMin,
            amountOutputMax, currencyOutput, location, tags } = filters;

        if (contact_id) {
            const { data: contactResolve } = await supabase.from('contacts').select('id').eq('telegram_user_id', contact_id).maybeSingle();
            query.eq('contact_id', contactResolve ? contactResolve.id : contact_id);
        }
        if (status) query.eq('status', status);
        if (tag_id) query.eq('order_tags.tag_id', tag_id); // Note: handled before .range in route, but inner join works
        if (dateFrom) query.gte('created_at', dateFrom);
        if (dateTo) query.lte('created_at', dateTo);
        if (amountMin) query.gte('SumInput', parseFloat(amountMin));
        if (amountMax) query.lte('SumInput', parseFloat(amountMax));
        if (currency) query.eq('CurrPair1', currency);
        if (sources) query.in('source', Array.isArray(sources) ? sources : (sources as string).split(','));
        if (closedBy) query.eq('closed_by_manager_id', parseInt(closedBy));
        if (statuses) query.in('status', Array.isArray(statuses) ? statuses : (statuses as string).split(','));
        if (amountOutputMin) query.gte('SumOutput', parseFloat(amountOutputMin));
        if (amountOutputMax) query.lte('SumOutput', parseFloat(amountOutputMax));
        if (currencyOutput) query.eq('CurrPair2', currencyOutput);
        if (location) query.ilike('CityEsp02', `%${location}%`);

        // Tags logic remains as comment in original
    }

    async _processOrdersData(data: any[] | null, isMinimal: boolean, tag_id?: string) {
        if (!data) return [];
        // Tags Filter (Post-fetch for now to match original logic safely)
        // Note: tag_id param is handled via !inner join in SELECT string if present.

        let processed = data.map(order => ({
            ...order,
            title: order.OrderName,
            amount: parseFloat(order.SumInput) || 0,
            currency: order.CurrPair1 || 'RUB',
            description: order.Comment
        }));

        // Kanban specific enrichments
        if (isMinimal && processed.length > 0) {
            // ... (Logic to fetch messages/unread counts)
            const mainIds = processed.map(o => o.main_id).filter(Boolean);
            if (mainIds.length > 0) {
                const [latestMsgResult, unreadCountResult] = await Promise.all([
                    supabase.rpc('get_latest_messages', { target_main_ids: mainIds.map(String), only_client: true }),
                    supabase.rpc('get_unread_client_counts', { target_main_ids: mainIds.map(String) })
                ]);

                const lastMessagesMap: any = {};
                (latestMsgResult.data || []).forEach((msg: any) => lastMessagesMap[String(msg.main_id)] = msg);
                const unreadCountMap: any = {};
                (unreadCountResult.data || []).forEach((row: any) => unreadCountMap[String(row.main_id)] = row.unread_count);

                processed = processed.map(order => ({
                    ...order,
                    last_message: order.main_id ? lastMessagesMap[String(order.main_id)] : null,
                    unread_count: order.main_id ? (unreadCountMap[String(order.main_id)] || 0) : 0
                }));
            }
        }

        // Append Tags
        if (processed.length > 0) {
            const orderIds = processed.map(o => o.id);
            const { data: tagsData } = await supabase.from('order_tags').select('order_id, tag:tags(*)').in('order_id', orderIds);
            const tagsByOrder: any = {};
            tagsData?.forEach((t: any) => {
                if (!tagsByOrder[t.order_id]) tagsByOrder[t.order_id] = [];
                if (t.tag) tagsByOrder[t.order_id].push(t.tag);
            });
            processed = processed.map(o => ({ ...o, tags: tagsByOrder[o.id] || [] }));
        }

        return processed;
    }

    async _runCreationSideEffects(data: any, manager: Manager) {
        try {
            runAutomations('order_created', data).catch(console.error);
            if (data.SumInput && parseFloat(data.SumInput) > 0) {
                runAutomations('order_amount_threshold', data).catch(console.error);
            }

            // System Message
            const managerName = manager.name || manager.email;
            const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid' });
            const systemContent = `✨ ${managerName} создал заявку [${timeStr}]`;
            await this._createSystemMessage(data.id, data.main_id, manager.id, systemContent);

        } catch (e) {
            console.error('Creation side effects error:', e);
        }
    }

    async _runUpdateSideEffects(data: any, oldOrder: any, updateData: any, manager: Manager) {
        const managerName = manager.name || manager.email;
        const changes = [];

        // Status
        if (updateData.status && updateData.status !== oldOrder.status) {
            await this._runStatusChangeSideEffects(data, oldOrder, manager);
        }

        // Other fields (System Messages)
        if (updateData.SumInput !== undefined && parseFloat(updateData.SumInput) !== parseFloat(oldOrder.SumInput || 0)) {
            const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid' });
            await this._createSystemMessage(data.id, data.main_id, manager.id, `💰 ${managerName} изменил сумму: ${updateData.SumInput} [было: ${oldOrder.SumInput || 0}] (${timeStr})`);
        }
        if (updateData.CurrPair1 && updateData.CurrPair1 !== oldOrder.CurrPair1) {
            const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid' });
            await this._createSystemMessage(data.id, data.main_id, manager.id, `💱 ${managerName} изменил валюту отдачи: ${updateData.CurrPair1} [было: ${oldOrder.CurrPair1 || '-'}] (${timeStr})`);
        }
    }

    async _runStatusChangeSideEffects(newOrder: any, oldOrder: any, manager: Manager) {
        const oldLabel = ORDER_STATUSES[oldOrder.status]?.label || oldOrder.status;
        const newLabel = ORDER_STATUSES[newOrder.status]?.label || newOrder.status;
        const managerName = manager.name || manager.email;
        const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid' });

        await this._createSystemMessage(newOrder.id, newOrder.main_id, manager.id, `🔄 ${managerName} смена этапа: ${newLabel} (было: ${oldLabel}) [${timeStr}]`);

        runAutomations('order_status_changed', newOrder).catch(console.error);

        if (newOrder.main_id) {
            sendBubbleStatusWebhook({
                mainId: newOrder.main_id,
                newStatus: newOrder.status,
                oldStatus: oldOrder.status
            }).catch(console.error);
        }
    }

    async _createSystemMessage(orderId: number | string, mainId: number | string | null, managerId: number | string, content: string) {
        await supabase.from('internal_messages').insert({
            order_id: orderId,
            main_id: mainId,
            sender_id: managerId,
            content,
            is_read: false,
            attachment_type: 'system'
        });
    }
}

export default new OrdersService();
