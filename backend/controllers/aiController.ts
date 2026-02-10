import { Request, Response } from 'express';
import aiService from '../services/aiService';

interface Manager {
    id: string | number;
    role?: string;
    [key: string]: any;
}

const INSTRUCTION_LEVELS: { [key: number]: { name: string, label: string, description: string } } = {
    1: { name: 'law', label: 'Закон', description: 'Неизменяемые правила, нарушать запрещено' },
    2: { name: 'priority', label: 'Приоритетная', description: 'Важные инструкции от администрации' },
    3: { name: 'normal', label: 'Обычная', description: 'Дополнительные инструкции для тонкой настройки' }
};

// Хелперы для проверки прав
function canCreateInstruction(role: string, level: number) {
    if (role === 'admin') return true;
    if (level === 1) return false;
    if (level === 2) return false;
    return true;
}

function canEditInstruction(role: string, level: number, userId: string | number | null = null, createdBy: string | number | null = null) {
    if (role === 'admin') return true;
    if (level === 1) return false;
    if (level === 2) return false;
    if (level === 3) {
        return role === 'admin' || (userId && userId === createdBy);
    }
    return false;
}

function canDeleteInstruction(role: string, level: number, userId: string | number | null = null, createdBy: string | number | null = null) {
    if (level === 1) return false;
    if (role === 'admin') return true;
    if (level === 2) return false;
    if (level === 3) {
        return role === 'admin' || (userId && userId === createdBy);
    }
    return false;
}

const aiController = {
    // SETTINGS
    async getSettings(req: Request, res: Response) {
        try {
            const result = await aiService.getSettings();
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching AI settings:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updateSetting(req: Request, res: Response) {
        try {
            const data = await aiService.updateSetting(req.params.key as string, req.body.value);
            res.json({ success: true, data });
        } catch (error: any) {
            console.error('Error updating AI setting:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updateSettingsBatch(req: Request, res: Response) {
        try {
            const data = await aiService.updateSettingsBatch(req.body.settings);
            res.json({ success: true, data });
        } catch (error: any) {
            console.error('Error batch updating AI settings:', error);
            res.status(400).json({ error: error.message });
        }
    },

    // OPERATORS
    async getOperators(req: Request, res: Response) {
        try {
            const result = await aiService.getOperators();
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching operators:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getOperator(req: Request, res: Response) {
        try {
            const data = await aiService.getOperator(req.params.id as string);
            res.json(data);
        } catch (error: any) {
            console.error('Error fetching operator:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async createOperator(req: Request, res: Response) {
        try {
            const data = await aiService.createOperator(req.body);
            res.json(data);
        } catch (error: any) {
            console.error('Error creating operator:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updateOperator(req: Request, res: Response) {
        try {
            const data = await aiService.updateOperator(req.params.id as string, req.body);
            res.json(data);
        } catch (error: any) {
            console.error('Error updating operator:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async deleteOperator(req: Request, res: Response) {
        try {
            const result = await aiService.deleteOperator(req.params.id as string);
            res.json(result);
        } catch (error: any) {
            console.error('Error deleting operator:', error);
            res.status(400).json({ error: error.message });
        }
    },

    // KNOWLEDGE BASE
    async getKnowledgeArticles(req: Request, res: Response) {
        try {
            const result = await aiService.getKnowledgeArticles(req.query as any);
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching knowledge base:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getKnowledgeArticle(req: Request, res: Response) {
        try {
            const data = await aiService.getKnowledgeArticle(req.params.id as string);
            res.json(data);
        } catch (error: any) {
            console.error('Error fetching knowledge article:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async createKnowledgeArticle(req: Request, res: Response) {
        try {
            const data = await aiService.createKnowledgeArticle(req.body);
            res.json(data);
        } catch (error: any) {
            console.error('Error creating knowledge article:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updateKnowledgeArticle(req: Request, res: Response) {
        try {
            const data = await aiService.updateKnowledgeArticle(req.params.id as string, req.body);
            res.json(data);
        } catch (error: any) {
            console.error('Error updating knowledge article:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async deleteKnowledgeArticle(req: Request, res: Response) {
        try {
            const result = await aiService.deleteKnowledgeArticle(req.params.id as string);
            res.json(result);
        } catch (error: any) {
            console.error('Error deleting knowledge article:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getKnowledgeCategories(req: Request, res: Response) {
        try {
            const result = await aiService.getKnowledgeCategories();
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching knowledge categories:', error);
            res.status(400).json({ error: error.message });
        }
    },

    // SCRIPTS
    async getScripts(req: Request, res: Response) {
        try {
            const result = await aiService.getScripts(req.query as any);
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching scripts:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getScript(req: Request, res: Response) {
        try {
            const data = await aiService.getScript(req.params.id as string);
            res.json(data);
        } catch (error: any) {
            console.error('Error fetching script:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async createScript(req: Request, res: Response) {
        try {
            const data = await aiService.createScript(req.body);
            res.json(data);
        } catch (error: any) {
            console.error('Error creating script:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updateScript(req: Request, res: Response) {
        try {
            const data = await aiService.updateScript(req.params.id as string, req.body);
            res.json(data);
        } catch (error: any) {
            console.error('Error updating script:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async deleteScript(req: Request, res: Response) {
        try {
            const result = await aiService.deleteScript(req.params.id as string);
            res.json(result);
        } catch (error: any) {
            console.error('Error deleting script:', error);
            res.status(400).json({ error: error.message });
        }
    },

    // WEBSITE CONTENT
    async getWebsiteContent(req: Request, res: Response) {
        try {
            const result = await aiService.getWebsiteContent(req.query as any);
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching website content:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getWebsiteContentItem(req: Request, res: Response) {
        try {
            const data = await aiService.getWebsiteContentItem(req.params.id as string);
            res.json(data);
        } catch (error: any) {
            console.error('Error fetching website content:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async createWebsiteContent(req: Request, res: Response) {
        try {
            const data = await aiService.createWebsiteContent(req.body);
            res.json(data);
        } catch (error: any) {
            console.error('Error creating website content:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updateWebsiteContent(req: Request, res: Response) {
        try {
            const data = await aiService.updateWebsiteContent(req.params.id as string, req.body);
            res.json(data);
        } catch (error: any) {
            console.error('Error updating website content:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async deleteWebsiteContent(req: Request, res: Response) {
        try {
            const result = await aiService.deleteWebsiteContent(req.params.id as string);
            res.json(result);
        } catch (error: any) {
            console.error('Error deleting website content:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getWebsiteSections(req: Request, res: Response) {
        try {
            const result = await aiService.getWebsiteSections();
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching website sections:', error);
            res.status(400).json({ error: error.message });
        }
    },

    // ANALYTICS
    async getAnalytics(req: Request, res: Response) {
        try {
            const result = await aiService.getAnalytics();
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching AI analytics:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getSuggestions(req: Request, res: Response) {
        try {
            const result = await aiService.getSuggestions(req.query as any);
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching suggestions:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getSuccessfulResponses(req: Request, res: Response) {
        try {
            const result = await aiService.getSuccessfulResponses(req.query as any);
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching successful responses:', error);
            res.status(400).json({ error: error.message });
        }
    },

    // TESTING
    async testSuggestion(req: Request, res: Response) {
        try {
            const result = await aiService.testSuggestion(req.body);
            res.json(result);
        } catch (error: any) {
            console.error('Error testing suggestion:', error.message);
            res.status(400).json({ error: error.message });
        }
    },

    async getModels(req: Request, res: Response) {
        try {
            const models = aiService.getAvailableModels();
            res.json({ models });
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    },

    // INSTRUCTIONS
    async getInstructions(req: Request, res: Response) {
        try {
            const manager = req.manager as Manager;
            const userRole = manager?.role || 'operator';
            const instructions = await aiService.getInstructions({ ...(req.query as any), userRole });

            const enriched = instructions.map(inst => ({
                ...inst,
                level_info: INSTRUCTION_LEVELS[inst.level],
                can_edit: canEditInstruction(userRole, inst.level),
                can_delete: canDeleteInstruction(userRole, inst.level)
            }));

            res.json({
                instructions: enriched,
                levels: INSTRUCTION_LEVELS,
                user_role: userRole
            });
        } catch (error: any) {
            console.error('Error fetching instructions:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getInstructionsForPrompt(req: Request, res: Response) {
        try {
            const data = await aiService.getInstructionsForPrompt();

            const grouped = {
                laws: data.filter((i: any) => i.level === 1).map((i: any) => `• ${i.title}: ${i.content}`),
                priority: data.filter((i: any) => i.level === 2).map((i: any) => `• ${i.title}: ${i.content}`),
                normal: data.filter((i: any) => i.level === 3).map((i: any) => `• ${i.title}: ${i.content}`)
            };

            let promptText = '';
            if (grouped.laws.length) promptText += `\n\n=== ЗАКОНЫ ===\n${grouped.laws.join('\n')}`;
            if (grouped.priority.length) promptText += `\n\n=== ПРИОРИТЕТНЫЕ ===\n${grouped.priority.join('\n')}`;
            if (grouped.normal.length) promptText += `\n\n=== ОБЫЧНЫЕ ===\n${grouped.normal.join('\n')}`;

            res.json({
                prompt_text: promptText,
                counts: {
                    laws: grouped.laws.length,
                    priority: grouped.priority.length,
                    normal: grouped.normal.length
                }
            });
        } catch (error: any) {
            console.error('Error fetching instructions for prompt:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getInstruction(req: Request, res: Response) {
        try {
            const data = await aiService.getInstruction(req.params.id as string);
            const manager = req.manager as Manager;
            const userRole = manager?.role || 'operator';

            res.json({
                ...data,
                level_info: INSTRUCTION_LEVELS[data.level],
                can_edit: canEditInstruction(userRole, data.level),
                can_delete: canDeleteInstruction(userRole, data.level)
            });
        } catch (error: any) {
            console.error('Error fetching instruction:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async createInstruction(req: Request, res: Response) {
        try {
            const { level, title } = req.body;
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const userRole = manager.role || 'operator';
            const userId = manager.id;

            if (!canCreateInstruction(userRole, level)) {
                return res.status(403).json({ error: 'Недостаточно прав' });
            }

            const data = await aiService.createInstruction(req.body, userId);
            res.json({ ...data, level_info: INSTRUCTION_LEVELS[data.level] });
        } catch (error: any) {
            console.error('Error creating instruction:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updateInstruction(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const userRole = manager.role || 'operator';
            const userId = manager.id;

            const existing = await aiService.getInstruction(id as string); // Returns any

            if (!canEditInstruction(userRole, existing.level, userId, existing.created_by)) {
                return res.status(403).json({ error: 'Недостаточно прав' });
            }

            const updateData = { ...req.body };
            delete updateData.id;
            delete updateData.created_by;
            delete updateData.created_at;

            const data = await aiService.updateInstruction(id as string, updateData);
            res.json({ ...data, level_info: INSTRUCTION_LEVELS[data.level] });
        } catch (error: any) {
            console.error('Error updating instruction:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async deleteInstruction(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const userRole = manager.role || 'operator';
            const userId = manager.id;

            const existing = await aiService.getInstruction(id as string);

            if (!canDeleteInstruction(userRole, existing.level, userId, existing.created_by)) {
                return res.status(403).json({ error: 'Недостаточно прав' });
            }

            await aiService.deleteInstruction(id as string);
            res.json({ success: true });
        } catch (error: any) {
            console.error('Error deleting instruction:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getInstructionCategories(req: Request, res: Response) {
        try {
            const result = await aiService.getInstructionCategories();
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching categories:', error);
            res.status(400).json({ error: error.message });
        }
    },

    // PROMPT ANALYTICS
    async getPromptAnalytics(req: Request, res: Response) {
        try {
            const dailyStats = await aiService.getPromptAnalytics(req.query.days as any);
            const latest = dailyStats?.[0] || {};
            const targetEditRate = 0.05;
            const currentEditRate = (latest as any).edit_rate || 0;

            res.json({
                current: { ...latest },
                target: {
                    edit_rate: targetEditRate,
                    met: currentEditRate <= targetEditRate,
                    gap: Math.max(0, currentEditRate - targetEditRate)
                },
                daily_stats: dailyStats
            });
        } catch (error: any) {
            console.error('Error fetching prompt analytics:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getPromptImprovements(req: Request, res: Response) {
        try {
            const data = await aiService.getPromptImprovements(req.query as any);
            res.json({ improvements: data });
        } catch (error: any) {
            console.error('Error fetching improvements:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async updatePromptImprovement(req: Request, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const data = await aiService.updatePromptImprovement(req.params.id as string, req.body.status, manager.id);
            res.json(data);
        } catch (error: any) {
            console.error('Error updating improvement:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async runDailyAnalysis(req: Request, res: Response) {
        try {
            const data = await aiService.runDailyAnalysis(req.body.date);
            res.json(data);
        } catch (error: any) {
            console.error('Error running daily analysis:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async getEditExamples(req: Request, res: Response) {
        try {
            const data = await aiService.getEditExamples(req.query as any);
            res.json({ examples: data });
        } catch (error: any) {
            console.error('Error fetching edit examples:', error);
            res.status(400).json({ error: error.message });
        }
    },

    async trackResponse(req: Request, res: Response) {
        try {
            const { lead_id, content, author_type, timestamp } = req.body;
            const data = await aiService.trackResponse({ lead_id, content, author_type, timestamp });
            res.json(data);
        } catch (error: any) {
            console.error('Error tracking response:', error);
            res.json({ tracked: false, error: error.message });
        }
    }
};

export default aiController;
