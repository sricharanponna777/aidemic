import { txt } from '@/lib/ai/text';

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export type AIConfig = ReturnType<typeof getAIConfig>;

const normalizeBaseUrl = (value?: string) => {
  const raw = txt(value || '', 400);
  return raw ? raw.replace(/\/+$/, '') : OPENAI_DEFAULT_BASE_URL;
};

export const getAIConfig = () => {
  const baseUrl = normalizeBaseUrl(process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || OPENAI_DEFAULT_BASE_URL);
  const apiKey = txt(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '', 300);
  const model = txt(process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini', 120);
  const isOpenAIHosted = /api\.openai\.com/i.test(baseUrl);
  const isOpenRouter = /openrouter\.ai/i.test(baseUrl);
  const openRouterSiteUrl = txt(process.env.OPENROUTER_SITE_URL || '', 200);
  const openRouterAppName = txt(process.env.OPENROUTER_APP_NAME || '', 100);

  return { baseUrl, apiKey, model, isOpenAIHosted, isOpenRouter, openRouterSiteUrl, openRouterAppName };
};

export const buildAIHeaders = (config: AIConfig) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  if (config.isOpenRouter) {
    if (config.openRouterSiteUrl) headers['HTTP-Referer'] = config.openRouterSiteUrl;
    if (config.openRouterAppName) headers['X-Title'] = config.openRouterAppName;
  }

  return headers;
};

export const getMissingHostedKeyError = (config: AIConfig) =>
  config.isOpenAIHosted && !config.apiKey ? 'OPENAI_API_KEY (or AI_API_KEY) is required for OpenAI hosted API.' : '';
