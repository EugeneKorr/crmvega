import express from 'express';
import auth from '../middleware/auth';
import aiController from '../controllers/aiController';

const router = express.Router();

// Settings
router.get('/settings', auth, (req, res) => aiController.getSettings(req, res));
router.patch('/settings/:key', auth, (req, res) => aiController.updateSetting(req, res));
router.post('/settings/batch', auth, (req, res) => aiController.updateSettingsBatch(req, res));

// Operators
router.get('/operators', auth, (req, res) => aiController.getOperators(req, res));
router.post('/operators', auth, (req, res) => aiController.createOperator(req, res));
router.get('/operators/:id', auth, (req, res) => aiController.getOperator(req, res));
router.patch('/operators/:id', auth, (req, res) => aiController.updateOperator(req, res));
router.delete('/operators/:id', auth, (req, res) => aiController.deleteOperator(req, res));

// Knowledge Base
router.get('/knowledge', auth, (req, res) => aiController.getKnowledgeArticles(req, res));
router.post('/knowledge', auth, (req, res) => aiController.createKnowledgeArticle(req, res));
router.get('/knowledge-categories', auth, (req, res) => aiController.getKnowledgeCategories(req, res));
router.get('/knowledge/:id', auth, (req, res) => aiController.getKnowledgeArticle(req, res));
router.patch('/knowledge/:id', auth, (req, res) => aiController.updateKnowledgeArticle(req, res));
router.delete('/knowledge/:id', auth, (req, res) => aiController.deleteKnowledgeArticle(req, res));

// Scripts
router.get('/scripts', auth, (req, res) => aiController.getScripts(req, res));
router.post('/scripts', auth, (req, res) => aiController.createScript(req, res));
router.get('/scripts/:id', auth, (req, res) => aiController.getScript(req, res));
router.patch('/scripts/:id', auth, (req, res) => aiController.updateScript(req, res));
router.delete('/scripts/:id', auth, (req, res) => aiController.deleteScript(req, res));

// Website Content
router.get('/website-content', auth, (req, res) => aiController.getWebsiteContent(req, res));
router.post('/website-content', auth, (req, res) => aiController.createWebsiteContent(req, res));
router.get('/website-sections', auth, (req, res) => aiController.getWebsiteSections(req, res));
router.get('/website-content/:id', auth, (req, res) => aiController.getWebsiteContentItem(req, res));
router.patch('/website-content/:id', auth, (req, res) => aiController.updateWebsiteContent(req, res));
router.delete('/website-content/:id', auth, (req, res) => aiController.deleteWebsiteContent(req, res));

// Analytics
router.get('/analytics', auth, (req, res) => aiController.getAnalytics(req, res));
router.get('/suggestions', auth, (req, res) => aiController.getSuggestions(req, res));
router.get('/successful-responses', auth, (req, res) => aiController.getSuccessfulResponses(req, res));

// Testing
router.post('/test-suggestion', auth, (req, res) => aiController.testSuggestion(req, res));
router.get('/models', auth, (req, res) => aiController.getModels(req, res));

// Instructions
router.get('/instructions', auth, (req, res) => aiController.getInstructions(req, res));
router.post('/instructions', auth, (req, res) => aiController.createInstruction(req, res));
router.get('/instructions/for-prompt', auth, (req, res) => aiController.getInstructionsForPrompt(req, res));
router.get('/instructions-categories', auth, (req, res) => aiController.getInstructionCategories(req, res));
router.get('/instructions/:id', auth, (req, res) => aiController.getInstruction(req, res));
router.patch('/instructions/:id', auth, (req, res) => aiController.updateInstruction(req, res));
router.delete('/instructions/:id', auth, (req, res) => aiController.deleteInstruction(req, res));

// Prompt Analytics
router.get('/prompt-analytics', auth, (req, res) => aiController.getPromptAnalytics(req, res));
router.get('/prompt-improvements', auth, (req, res) => aiController.getPromptImprovements(req, res));
router.patch('/prompt-improvements/:id', auth, (req, res) => aiController.updatePromptImprovement(req, res));
router.post('/run-daily-analysis', auth, (req, res) => aiController.runDailyAnalysis(req, res));
router.get('/edit-examples', auth, (req, res) => aiController.getEditExamples(req, res));
router.post('/track-response', auth, (req, res) => aiController.trackResponse(req, res));

export default router;
