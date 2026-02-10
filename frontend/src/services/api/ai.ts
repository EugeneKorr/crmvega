import api from './client';
import {
    AISettings, AISettingsRaw, AIModel, OperatorStyle, KnowledgeArticle, AnswerScript,
    WebsiteContent, AIAnalytics, AISuggestion, SuccessfulResponse, AIInstruction,
    InstructionLevel, InstructionLevelInfo
} from '../../types';

export const aiAPI = {
    getSettings: async (): Promise<{ settings: AISettings; raw: AISettingsRaw[] }> => {
        const response = await api.get('/ai/settings');
        return response.data;
    },

    updateSetting: async (key: string, value: any): Promise<AISettingsRaw> => {
        const response = await api.patch(`/ai/settings/${key}`, { value });
        return response.data;
    },

    updateSettingsBatch: async (settings: Partial<AISettings>): Promise<void> => {
        await api.post('/ai/settings/batch', { settings });
    },

    getModels: async (): Promise<{ models: AIModel[] }> => {
        const response = await api.get('/ai/models');
        return response.data;
    },

    getOperators: async (): Promise<{ operators: OperatorStyle[] }> => {
        const response = await api.get('/ai/operators');
        return response.data;
    },

    getOperator: async (id: number): Promise<OperatorStyle> => {
        const response = await api.get(`/ai/operators/${id}`);
        return response.data;
    },

    createOperator: async (operator: Partial<OperatorStyle>): Promise<OperatorStyle> => {
        const response = await api.post('/ai/operators', operator);
        return response.data;
    },

    updateOperator: async (id: number, operator: Partial<OperatorStyle>): Promise<OperatorStyle> => {
        const response = await api.patch(`/ai/operators/${id}`, operator);
        return response.data;
    },

    deleteOperator: async (id: number): Promise<void> => {
        await api.delete(`/ai/operators/${id}`);
    },

    getKnowledge: async (params?: { category?: string; search?: string }): Promise<{ articles: KnowledgeArticle[] }> => {
        const response = await api.get('/ai/knowledge', { params });
        return response.data;
    },

    getKnowledgeArticle: async (id: number): Promise<KnowledgeArticle> => {
        const response = await api.get(`/ai/knowledge/${id}`);
        return response.data;
    },

    createKnowledgeArticle: async (article: Partial<KnowledgeArticle>): Promise<KnowledgeArticle> => {
        const response = await api.post('/ai/knowledge', article);
        return response.data;
    },

    updateKnowledgeArticle: async (id: number, article: Partial<KnowledgeArticle>): Promise<KnowledgeArticle> => {
        const response = await api.patch(`/ai/knowledge/${id}`, article);
        return response.data;
    },

    deleteKnowledgeArticle: async (id: number): Promise<void> => {
        await api.delete(`/ai/knowledge/${id}`);
    },

    getKnowledgeCategories: async (): Promise<{ categories: string[] }> => {
        const response = await api.get('/ai/knowledge-categories');
        return response.data;
    },

    getScripts: async (params?: { search?: string }): Promise<{ scripts: AnswerScript[] }> => {
        const response = await api.get('/ai/scripts', { params });
        return response.data;
    },

    getScript: async (id: number): Promise<AnswerScript> => {
        const response = await api.get(`/ai/scripts/${id}`);
        return response.data;
    },

    createScript: async (script: Partial<AnswerScript>): Promise<AnswerScript> => {
        const response = await api.post('/ai/scripts', script);
        return response.data;
    },

    updateScript: async (id: number, script: Partial<AnswerScript>): Promise<AnswerScript> => {
        const response = await api.patch(`/ai/scripts/${id}`, script);
        return response.data;
    },

    deleteScript: async (id: number): Promise<void> => {
        await api.delete(`/ai/scripts/${id}`);
    },

    getWebsiteContent: async (params?: { section?: string; search?: string }): Promise<{ content: WebsiteContent[] }> => {
        const response = await api.get('/ai/website-content', { params });
        return response.data;
    },

    getWebsiteContentItem: async (id: number): Promise<WebsiteContent> => {
        const response = await api.get(`/ai/website-content/${id}`);
        return response.data;
    },

    createWebsiteContent: async (content: Partial<WebsiteContent>): Promise<WebsiteContent> => {
        const response = await api.post('/ai/website-content', content);
        return response.data;
    },

    updateWebsiteContent: async (id: number, content: Partial<WebsiteContent>): Promise<WebsiteContent> => {
        const response = await api.patch(`/ai/website-content/${id}`, content);
        return response.data;
    },

    deleteWebsiteContent: async (id: number): Promise<void> => {
        await api.delete(`/ai/website-content/${id}`);
    },

    getWebsiteSections: async (): Promise<{ sections: string[] }> => {
        const response = await api.get('/ai/website-sections');
        return response.data;
    },

    getAnalytics: async (): Promise<AIAnalytics> => {
        const response = await api.get('/ai/analytics');
        return response.data;
    },

    getSuggestions: async (params?: { limit?: number; feedback?: string }): Promise<{ suggestions: AISuggestion[] }> => {
        const response = await api.get('/ai/suggestions', { params });
        return response.data;
    },

    getSuccessfulResponses: async (params?: { limit?: number }): Promise<{ responses: SuccessfulResponse[] }> => {
        const response = await api.get('/ai/successful-responses', { params });
        return response.data;
    },

    testSuggestion: async (data: { client_message: string; lead_id?: string; operator_id?: number }): Promise<any> => {
        const response = await api.post('/ai/test-suggestion', data);
        return response.data;
    },

    getInstructions: async (params?: {
        level?: InstructionLevel;
        is_active?: boolean;
        category?: string
    }): Promise<{
        instructions: AIInstruction[];
        levels: Record<InstructionLevel, InstructionLevelInfo>;
        user_role: string;
    }> => {
        const response = await api.get('/ai/instructions', { params });
        return response.data;
    },

    getInstruction: async (id: number): Promise<AIInstruction> => {
        const response = await api.get(`/ai/instructions/${id}`);
        return response.data;
    },

    createInstruction: async (instruction: Partial<AIInstruction>): Promise<AIInstruction> => {
        const response = await api.post('/ai/instructions', instruction);
        return response.data;
    },

    updateInstruction: async (id: number, instruction: Partial<AIInstruction>): Promise<AIInstruction> => {
        const response = await api.patch(`/ai/instructions/${id}`, instruction);
        return response.data;
    },

    deleteInstruction: async (id: number): Promise<void> => {
        await api.delete(`/ai/instructions/${id}`);
    },

    getInstructionsForPrompt: async (): Promise<{
        prompt_text: string;
        counts: { laws: number; priority: number; normal: number }
    }> => {
        const response = await api.get('/ai/instructions/for-prompt');
        return response.data;
    },

    getInstructionCategories: async (): Promise<{ categories: string[] }> => {
        const response = await api.get('/ai/instructions-categories');
        return response.data;
    },

    getPromptAnalytics: async (params?: { days?: number }): Promise<{
        current: {
            date: string;
            edit_rate: number;
            acceptance_rate: number;
            total_suggestions: number;
            used_suggestions: number;
            edited_suggestions: number;
            avg_similarity: number;
            edit_type_distribution: Record<string, number>;
        };
        target: {
            edit_rate: number;
            met: boolean;
            gap: number;
        };
        trend: Array<{ date: string; edit_rate: number; acceptance_rate: number; total: number }>;
        recommendations: string;
        daily_stats: any[];
    }> => {
        const response = await api.get('/ai/prompt-analytics', { params });
        return response.data;
    },

    getPromptImprovements: async (params?: { status?: string; limit?: number }): Promise<{ improvements: any[] }> => {
        const response = await api.get('/ai/prompt-improvements', { params });
        return response.data;
    },

    updatePromptImprovement: async (id: number, data: { status: string }): Promise<any> => {
        const response = await api.patch(`/ai/prompt-improvements/${id}`, data);
        return response.data;
    },

    runDailyAnalysis: async (date?: string): Promise<any> => {
        const response = await api.post('/ai/run-daily-analysis', { date });
        return response.data;
    },

    getEditExamples: async (params?: { limit?: number; edit_type?: string }): Promise<{ examples: any[] }> => {
        const response = await api.get('/ai/edit-examples', { params });
        return response.data;
    },
};

export const templatesAPI = {
    getAll: async (search?: string): Promise<WebsiteContent[]> => {
        const response = await aiAPI.getWebsiteContent({ section: 'chat_templates', search });
        return response.content;
    },

    create: async (data: { title: string; content: string }): Promise<WebsiteContent> => {
        return aiAPI.createWebsiteContent({ ...data, section: 'chat_templates' });
    },

    update: async (id: number, data: { title?: string; content?: string }): Promise<WebsiteContent> => {
        return aiAPI.updateWebsiteContent(id, data);
    },

    delete: async (id: number): Promise<void> => {
        return aiAPI.deleteWebsiteContent(id);
    },
};
