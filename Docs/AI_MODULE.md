# AI module

Status: **database foundation built and verified (Phase 1).** The backend AI service, provider adapters
and UI are Phase 2. Only a **mock** provider is configured; no paid AI service is assumed or connected.

## What the database provides

| Capability | Where |
|---|---|
| Provider and model configuration (no secrets) | `ai_provider_settings` |
| Versioned system prompts with guard rails | `ai_prompt_templates` |
| Knowledge sources with owners, visibility and official status | `ai_knowledge_sources` |
| Versioned documents with a processing pipeline | `ai_knowledge_documents`, `ai_processing_logs` |
| Chunks with full-text (`tsvector`, `simple` config) and trigram indexes | `ai_document_chunks` |
| Embeddings (pgvector 0.8.2, dimension-agnostic) | `ai_embeddings` |
| Permission-filtered hybrid retrieval (vector + full-text) | `public.search_knowledge(...)` |
| Private conversations, messages with citations, feedback | `ai_conversations`, `ai_messages`, `ai_feedback` |
| Usage, latency, errors (no message content) | `ai_usage_logs` |
| Request classification suggestion (suggestion only) | `service_requests.ai_suggested_*`, `public.record_request_ai_suggestion` |

## Rules enforced by the database

1. **No secrets in the database.** `ai_provider_settings.secret_ref` accepts only an environment-variable
   style name (`^[A-Z][A-Z0-9_]{2,63}$`), so a value such as `sk-...` is rejected. Real providers must
   reference a secret; the mock provider must not. The backend reads the key from its environment
   (or Supabase Vault) by that name.
2. **Retrieval respects permissions.** `search_knowledge` returns only current, `ready` documents from
   sources the caller may access (`private.can_access_knowledge_source`): `public`, `authenticated`
   (active signed-in user), or `permission` (caller holds the named permission in any scope). Managers of a
   source can always see it. RLS applies the same rule to direct table reads.
3. **Public assistant mode.** With `p_public_only = true` (used by the backend for signed-out visitors),
   only `public` sources are searched regardless of who calls.
4. **Official vs general.** `is_official` can only be set by a campus knowledge manager who did not create
   the source (`ai_approve_official_source`); results return `is_official` so answers can say whether a source
   is an official university document.
5. **Versioning.** Registering a replacement document marks the old version non-current; only current
   versions are retrieved. History is kept.
6. **Conversation privacy (decision D5).** Conversations and messages are visible to their owner only.
   Administrators see `ai_usage_logs` and `ai_feedback` (no content). Students cannot write assistant
   messages; the backend writes them with the service role after calling the provider.
7. **No decisions by AI.** No AI table or function writes to clearance, receipt, violation, penalty or
   payment state. The AI module will act with the signed-in user's own JWT and read-only tools (Phase 2).
   Request classification writes only a suggestion; status is untouched (tested).
8. **Public sessions expire.** A public conversation must have `expires_at`; the scheduled job
   `expire_public_ai_sessions` deletes expired ones (disabled until enabled by an administrator).

## Retrieval

```sql
select * from public.search_knowledge(
  p_query_text        => 'How do I reserve a queue slot?',
  p_query_embedding   => '<vector from the embedding model>'::extensions.vector,  -- optional
  p_provider_setting_id => '<embedding setting id>',                            -- required with a vector
  p_match_count       => 8,
  p_min_similarity    => 0.2,
  p_public_only       => false);
```

Full-text matching uses any of the question's words (OR) and ranks by `ts_rank`; vector similarity is cosine
(`1 - (a <=> b)`). Results are ordered by similarity + text rank, official sources first on ties.
Without an embedding provider, full-text retrieval still works.

**Embedding dimensions (decision D3).** The `embedding` column has no fixed dimension; each row records its
model and dimensions (CHECK enforces they match). When a real embedding model is approved, add an HNSW index
for it in a migration:

```sql
create index ai_embeddings_<model>_hnsw on public.ai_embeddings
  using hnsw ((embedding::extensions.vector(<dims>)) extensions.vector_cosine_ops)
  where provider_setting_id = '<setting id>';
```

## Document pipeline (backend worker, Phase 2)

`ai_register_document` (manager) → upload to private bucket `ai-knowledge` (PDF, DOCX, TXT, Markdown, HTML;
20 MB) → worker: extraction → chunking → embedding → indexing, recording each stage with
`ai_record_processing_stage` (service role). A failed stage must include an error message.

## Seeded defaults

Four mock providers (chat, embedding 384-dim, classification, summarization) and four prompt templates:
`campus_assistant`, `public_assistant`, `request_classifier`, `report_summarizer`. The prompts tell the model
to answer only from cited sources, to say when a source is not official, never to invent policies, fees,
deadlines, coordinates or directions, never to claim it can approve or verify anything, and to ignore
instructions embedded in sources or user text. Prompts are a second line of defence; the database
permission filter and the read-only tool design are the first.

## Not done yet (Phase 2+)

Provider adapters (mock first), the backend chat/RAG service, rate limiting using
`max_requests_per_user_per_day`, document text extraction, embedding generation, AI-assisted search,
summarization, analytics and queue insights, and the UI. Prompt-injection testing against a real model.

## Tests

`Database/tests/070_ai.sql` — 36 checks, passed locally and on the live project (rolled back).
