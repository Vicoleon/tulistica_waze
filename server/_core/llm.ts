import { ENV } from "./env";
import { decryptCredential } from "./vault";
import {
  findAppIntegrationCredential,
  getAppSetting,
} from "../db";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

export type LlmProvider = "openai" | "gemini" | "deepseek";

export const LLM_PROVIDER_LIST: LlmProvider[] = ["openai", "gemini", "deepseek"];

/**
 * Default model per provider. Used when admin hasn't selected one yet.
 * Pricing notes (May 2026): openai gpt-4o-mini and gemini-2.5-flash are the
 * cheapest "smart enough" defaults; deepseek-chat is the cheapest overall.
 */
const PROVIDER_DEFAULTS: Record<LlmProvider, { url: string; model: string }> = {
  openai: { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  gemini: {
    // Google's OpenAI-compatible endpoint — same payload shape, different auth.
    // Default to gemini-3.1-flash-lite: cheapest GA model (May 2026).
    // Admin can override via the LLM config UI.
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    model: "gemini-3.1-flash-lite",
  },
  deepseek: { url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" },
};

interface LlmEndpoint {
  url: string;
  apiKey: string;
  model: string;
  provider: LlmProvider | "forge" | "env";
}

interface CachedConfig {
  endpoint: LlmEndpoint | null;
  expiresAt: number;
}

let cachedConfig: CachedConfig | null = null;
const CACHE_TTL_MS = 30_000;

function invalidateLlmConfigCache(): void {
  cachedConfig = null;
}

// Exported so the admin router can bust the cache when keys change.
export { invalidateLlmConfigCache };

/**
 * Resolve the active LLM endpoint. Order of preference:
 *   1. Admin-selected provider via app_settings (`llm.activeProvider`) with a
 *      matching API key in the encrypted vault
 *   2. Any provider with a vault key (openai → gemini → deepseek)
 *   3. Legacy: OPENAI_API_KEY env var
 *   4. Legacy: Manus Forge proxy
 * Returns null when nothing is configured.
 */
async function loadLlmEndpoint(): Promise<LlmEndpoint | null> {
  // 1 + 2: vault-backed providers, controlled by admin.
  const activeProvider = (await getAppSetting("llm.activeProvider")) as LlmProvider | null;
  const candidates: LlmProvider[] = activeProvider
    ? [activeProvider, ...LLM_PROVIDER_LIST.filter((p) => p !== activeProvider)]
    : [...LLM_PROVIDER_LIST];

  for (const provider of candidates) {
    const cred = await findAppIntegrationCredential(`llm_${provider}`);
    if (!cred) continue;
    let apiKey: string;
    try {
      const decoded = decryptCredential<{ apiKey: string }>(cred.ciphertext);
      apiKey = decoded.apiKey;
    } catch (err) {
      console.warn(`[llm] failed to decrypt key for ${provider}:`, err);
      continue;
    }
    if (!apiKey) continue;
    const defaults = PROVIDER_DEFAULTS[provider];
    const modelOverride = await getAppSetting(`llm.model.${provider}`);
    return {
      url: defaults.url,
      apiKey,
      model: modelOverride ?? defaults.model,
      provider,
    };
  }

  // 3: legacy env vars (per-provider). DeepSeek and Gemini fall through to
  // OpenAI when none is set; whichever is present wins in this order.
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      url: PROVIDER_DEFAULTS.deepseek.url,
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL ?? PROVIDER_DEFAULTS.deepseek.model,
      provider: "env",
    };
  }
  if (process.env.GEMINI_API_KEY) {
    return {
      url: PROVIDER_DEFAULTS.gemini.url,
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL ?? PROVIDER_DEFAULTS.gemini.model,
      provider: "env",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      url: PROVIDER_DEFAULTS.openai.url,
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? PROVIDER_DEFAULTS.openai.model,
      provider: "env",
    };
  }

  // 4: legacy Forge proxy
  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    const base = ENV.forgeApiUrl.replace(/\/$/, "");
    return {
      url: `${base}/v1/chat/completions`,
      apiKey: ENV.forgeApiKey,
      model: process.env.OPENAI_MODEL ?? "gemini-2.5-flash",
      provider: "forge",
    };
  }

  return null;
}

async function resolveLlmEndpoint(): Promise<LlmEndpoint> {
  const now = Date.now();
  if (cachedConfig && cachedConfig.expiresAt > now && cachedConfig.endpoint) {
    return cachedConfig.endpoint;
  }
  const endpoint = await loadLlmEndpoint();
  cachedConfig = { endpoint, expiresAt: now + CACHE_TTL_MS };
  if (!endpoint) {
    throw new Error(
      "LLM no configurado. Pegá una API key en /profile (sección admin) o seteá DEEPSEEK_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY en .env."
    );
  }
  return endpoint;
}

export async function isLlmAvailable(): Promise<boolean> {
  try {
    const endpoint = await loadLlmEndpoint();
    return endpoint !== null;
  } catch {
    return false;
  }
}

/**
 * Synchronous variant used by feature-flag endpoints that need a quick answer.
 * Falls back to env vars only — true vault check requires the async version.
 */
export function isLlmAvailableSync(): boolean {
  if (process.env.DEEPSEEK_API_KEY) return true;
  if (process.env.GEMINI_API_KEY) return true;
  if (process.env.OPENAI_API_KEY) return true;
  if (ENV.forgeApiUrl && ENV.forgeApiKey) return true;
  // If neither env is set we don't know without hitting the DB. Tell the
  // client to call the async features.status which awaits the real check.
  return false;
}

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

/**
 * Per-model capability descriptor. Not every OpenAI-compatible endpoint
 * supports the full Chat Completions feature set, so we downgrade payloads to
 * match what the active model accepts.
 */
interface ModelCapabilities {
  /** "schema" = full json_schema; "object" = json_object only; "none" = no response_format support. */
  responseFormat: "schema" | "object" | "none";
  /** Whether the model accepts `tools` / `tool_choice` parameters. */
  tools: boolean;
  /** DeepSeek reasoner rejects temperature/top_p. Set false to omit. */
  samplingParams: boolean;
}

const DEFAULT_CAPS: ModelCapabilities = {
  responseFormat: "schema",
  tools: true,
  samplingParams: true,
};

function getModelCapabilities(
  provider: LlmProvider | "forge" | "env",
  model: string
): ModelCapabilities {
  const m = model.toLowerCase();

  if (provider === "deepseek") {
    // deepseek-reasoner (R1) is the most restricted — no response_format, no
    // tools, no temperature/top_p. deepseek-chat (V3) accepts json_object.
    if (m.includes("reasoner") || m.includes("r1")) {
      return { responseFormat: "none", tools: false, samplingParams: false };
    }
    return { responseFormat: "object", tools: true, samplingParams: true };
  }

  if (provider === "gemini") {
    // The OpenAI-compatible endpoint accepts json_object reliably; json_schema
    // works on newer models but the schema shape requirements differ. Use the
    // safer json_object and rely on the system-prompt JSON instruction.
    return { responseFormat: "object", tools: true, samplingParams: true };
  }

  if (provider === "openai" || provider === "env") {
    // gpt-3.5-turbo doesn't support json_schema; gpt-4o / gpt-4.1 / o-series do.
    if (m.startsWith("gpt-3.5")) {
      return { responseFormat: "object", tools: true, samplingParams: true };
    }
    return DEFAULT_CAPS;
  }

  // Forge / unknown — assume full support and let the upstream complain.
  return DEFAULT_CAPS;
}

/**
 * Inject a strong "respond with JSON only" instruction into the message list
 * when the model can't enforce JSON output natively. Schema is appended as
 * context so the model knows the expected shape.
 */
function injectJsonInstruction(
  messages: Message[],
  schema: JsonSchema | undefined
): Message[] {
  const schemaHint = schema
    ? `\n\nDevolvé únicamente un JSON válido que respete este JSON Schema (sin texto fuera del JSON, sin markdown, sin comentarios):\n${JSON.stringify(schema.schema)}`
    : "\n\nDevolvé únicamente un JSON válido, sin texto fuera del JSON, sin markdown y sin comentarios.";

  // If the first message is a system message, append. Otherwise prepend one.
  if (messages.length > 0 && messages[0].role === "system") {
    const first = messages[0];
    const text = typeof first.content === "string" ? first.content : "";
    return [
      { ...first, content: text + schemaHint },
      ...messages.slice(1),
    ];
  }
  return [
    { role: "system", content: `Sos un asistente útil.${schemaHint}` },
    ...messages,
  ];
}

/**
 * Extract JSON from a model response that might be wrapped in markdown fences
 * or have leading/trailing chatter (common with reasoning models).
 *
 * Exported so route handlers can use it instead of bare JSON.parse — that way
 * recipe / product-recognition flows survive a model swap to DeepSeek reasoner.
 */
/**
 * Returns the index of the closing brace/bracket that matches the opener at
 * `start`. Skips braces inside string literals and respects backslash escapes.
 * Returns -1 if the structure is unbalanced.
 */
function findBalancedJsonEnd(s: string, start: number): number {
  const open = s[start];
  if (open !== "{" && open !== "[") return -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function extractJson<T = unknown>(content: string): T {
  if (!content) throw new Error("Empty LLM response content");
  let trimmed = content.trim();

  // Strip ```json ... ``` or ``` ... ``` fences.
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) {
    trimmed = fence[1].trim();
  }

  // Skip any preamble before the first { or [.
  const firstBrace = trimmed.search(/[{[]/);
  if (firstBrace > 0) {
    trimmed = trimmed.slice(firstBrace);
  } else if (firstBrace < 0) {
    throw new Error(
      `Failed to parse JSON from LLM response: no '{' or '[' found. Content (first 200 chars): ${content.slice(0, 200)}`
    );
  }

  // Find the end of the FIRST balanced JSON value — DeepSeek and other models
  // occasionally emit a second JSON object, commentary, or trailing notes that
  // break a naive lastIndexOf-based trim.
  const end = findBalancedJsonEnd(trimmed, 0);
  if (end > 0) {
    trimmed = trimmed.slice(0, end + 1);
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from LLM response: ${err instanceof Error ? err.message : err}. Content (first 200 chars): ${content.slice(0, 200)}`
    );
  }
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const endpoint = await resolveLlmEndpoint();
  const caps = getModelCapabilities(endpoint.provider, endpoint.model);

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const requestedFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });
  const wantsJson =
    requestedFormat?.type === "json_schema" || requestedFormat?.type === "json_object";

  // Adapt messages: when the model can't enforce JSON natively but the caller
  // wants JSON, inject the instruction into the system prompt as a fallback.
  const needsPromptHint =
    wantsJson &&
    (caps.responseFormat === "none" ||
      (caps.responseFormat === "object" && requestedFormat?.type === "json_schema"));
  const finalMessages = needsPromptHint
    ? injectJsonInstruction(
        messages,
        requestedFormat?.type === "json_schema" ? requestedFormat.json_schema : undefined
      )
    : messages;

  const payload: Record<string, unknown> = {
    model: endpoint.model,
    messages: finalMessages.map(normalizeMessage),
    max_tokens: 4096,
  };

  // Tools — drop entirely if the model doesn't support them rather than
  // failing the request. Most of our callers don't use tools anyway.
  if (caps.tools && tools && tools.length > 0) {
    payload.tools = tools;
    const normalizedToolChoice = normalizeToolChoice(toolChoice || tool_choice, tools);
    if (normalizedToolChoice) {
      payload.tool_choice = normalizedToolChoice;
    }
  }

  // Response format — downgrade if needed.
  if (requestedFormat && caps.responseFormat !== "none") {
    if (caps.responseFormat === "schema") {
      payload.response_format = requestedFormat;
    } else if (caps.responseFormat === "object") {
      // Downgrade json_schema → json_object; pass json_object/text through.
      payload.response_format =
        requestedFormat.type === "json_schema"
          ? { type: "json_object" }
          : requestedFormat;
    }
  }
  // If caps.responseFormat === "none", we silently drop the param — the
  // injected system prompt is doing the work instead.

  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}
