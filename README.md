# AIDemic

An AI-powered study platform built with Next.js. Generate flashcard decks from a topic, review with spaced repetition, create exam-style MCQs, and chat with an AI study assistant.

## Features

- AI flashcard generation with tags
- Spaced repetition review using an SM-2 style scheduler
- Rich flashcard content with formatted text, code blocks, Markdown, images, and KaTeX math
- AI-generated exam questions
- Study chat for notes and slideshow context
- Study analytics for time, accuracy, streaks, and goals
- Slideshow mode for generated study content
- Dark and light themes

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 App Router |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Auth and DB | Supabase PostgreSQL with RLS |
| AI | OpenAI-compatible API such as OpenAI, OpenRouter, vLLM, TGI, or LocalAI |
| Rich text | Tiptap 3, Lexical |
| Math rendering | KaTeX |
| Icons | Lucide React |

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a project at https://supabase.com.
2. Open the Supabase SQL editor.
3. Run [queries.sql](./queries.sql) once to create the tables, indexes, and RLS policies.
4. Copy your project URL and anon key.

### 3. Configure Environment Variables

Copy the committed example file:

```bash
cp .env.local.example .env.local
```

Minimum required values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
AI_API_KEY=your-api-key
```

### 4. Run The App

```bash
npm run dev
```

Open http://localhost:3000.

## AI Provider Config

The API routes under `/api/ai/*` use an OpenAI-compatible API.

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `AI_BASE_URL` | No | AI API base URL. Defaults to `https://api.openai.com/v1` |
| `AI_MODEL` | No | Model name. Defaults to `gpt-4.1-mini` |
| `AI_API_KEY` | Yes* | API key. Required for OpenAI-hosted endpoints |
| `OPENROUTER_SITE_URL` | No | Optional OpenRouter attribution URL |
| `OPENROUTER_APP_NAME` | No | Optional OpenRouter app name |

Legacy `OPENAI_BASE_URL`, `OPENAI_MODEL`, and `OPENAI_API_KEY` names are supported as fallbacks.

### OpenAI

```bash
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4.1-mini
AI_API_KEY=your-openai-key
```

### OpenRouter

```bash
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4o-mini
AI_API_KEY=your-openrouter-key
OPENROUTER_SITE_URL=https://your-site.example
OPENROUTER_APP_NAME=AIDemic
```

### Local OpenAI-Compatible Server

```bash
AI_BASE_URL=http://localhost:8000/v1
AI_MODEL=your-model-name
AI_API_KEY=
```

## Database

The schema lives in [queries.sql](./queries.sql). It matches the names used in the application code.

Key tables:

- `user_profiles`
- `flashcard_decks`
- `flashcards`
- `flashcard_tags`
- `flashcard_tag_mapping`
- `study_sessions`
- `study_session_results`
- `user_statistics`
- `study_goals`
- `generated_videos`

## Auth And Route Protection

Protected routes are handled by [src/proxy.ts](./src/proxy.ts). The proxy creates a Supabase SSR client from request cookies and calls `supabase.auth.getUser()`; it does not depend on a hard-coded `sb-access-token` cookie name.

## Project Structure

```text
src/
  app/
    api/
      ai/
        generate-flashcards/
        generate-questions/
        generate-video/
        study-chat/
    dashboard/
      ai-questions/
      flashcards/
      notes/
      settings/
      slideshow/
      study-sessions/
    login/
  components/
  hooks/
  lib/
    ai/
      config.ts
      json.ts
      math.ts
      text.ts
      validation.ts
    spacedRepetition.ts
    supabase-client.ts
    supabase-server.ts
  proxy.ts
  types.ts
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```
