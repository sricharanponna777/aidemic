export const MAX_AI_ERROR_TEXT = 2400;

export const txt = (value: string, length: number) =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, length);

export const safe = (value: string) =>
  value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<[^>]*>/g, '');

export const cleanText = (value: string, length: number) => txt(safe(value), length);

export const dedupe = (items: string[]) => {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
};

export const sanitizeFigureUrl = (raw: string) => {
  const candidate = txt(raw, 900);
  if (!candidate) return '';

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
};

export const extractFigureUrls = (text: string) => {
  const urls: string[] = [];
  const markdownMatches = text.matchAll(/!\[[^\]]*]\((https?:\/\/[^\s)]+)\)/gi);

  for (const match of markdownMatches) {
    const url = sanitizeFigureUrl(match[1] || '');
    if (url) urls.push(url);
  }

  const htmlMatches = text.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi);
  for (const match of htmlMatches) {
    const url = sanitizeFigureUrl(match[1] || '');
    if (url) urls.push(url);
  }

  const bareMatches = text.matchAll(/\bhttps?:\/\/[^\s<>"')]+/gi);
  for (const match of bareMatches) {
    const candidate = match[0] || '';
    if (!/\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.test(candidate)) continue;
    const url = sanitizeFigureUrl(candidate);
    if (url) urls.push(url);
  }

  return dedupe(urls).slice(0, 8);
};
