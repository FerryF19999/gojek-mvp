/**
 * LLM Provider Abstraction — supports Claude (Anthropic) and OpenAI
 * Used ONLY by the Main Agent orchestrator, not by chat bots
 */

const LLM_PROVIDER = process.env.LLM_PROVIDER || "anthropic";
const LLM_MODEL = process.env.LLM_MODEL || (LLM_PROVIDER === "openai" ? "gpt-4o" : "claude-sonnet-4-20250514");
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || "8000");

let anthropicClient = null;
let openaiClient = null;

function getAnthropicClient() {
  if (!anthropicClient) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    const Anthropic = require("@anthropic-ai/sdk");
    anthropicClient = new Anthropic({ apiKey: key });
  }
  return anthropicClient;
}

function getOpenAIClient() {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    const OpenAI = require("openai");
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

/**
 * Check if LLM is available (API key configured)
 */
function isAvailable() {
  if (LLM_PROVIDER === "openai") return !!process.env.OPENAI_API_KEY;
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Convert tool definitions to provider-specific format
 */
function formatToolsForAnthropic(tools) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

function formatToolsForOpenAI(tools) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Call LLM with system prompt, messages, and tools
 * Returns: { text, toolCalls: [{ name, args }] }
 */
async function chat(systemPrompt, messages, tools = []) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    if (LLM_PROVIDER === "openai") {
      return await chatOpenAI(systemPrompt, messages, tools, controller.signal);
    }
    return await chatAnthropic(systemPrompt, messages, tools, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function chatAnthropic(systemPrompt, messages, tools, signal) {
  const client = getAnthropicClient();
  if (!client) throw new Error("Anthropic API key not configured");

  const formattedTools = tools.length > 0 ? formatToolsForAnthropic(tools) : undefined;

  const response = await client.messages.create({
    model: LLM_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role === "tool" ? "user" : m.role,
      content: m.role === "tool"
        ? [{ type: "tool_result", tool_use_id: m.tool_use_id, content: m.content }]
        : m.content,
    })),
    tools: formattedTools,
  }, { signal });

  let text = "";
  const toolCalls = [];

  for (const block of response.content) {
    if (block.type === "text") text += block.text;
    if (block.type === "tool_use") {
      toolCalls.push({ id: block.id, name: block.name, args: block.input });
    }
  }

  return { text, toolCalls, stopReason: response.stop_reason };
}

async function chatOpenAI(systemPrompt, messages, tools, signal) {
  const client = getOpenAIClient();
  if (!client) throw new Error("OpenAI API key not configured");

  const formattedTools = tools.length > 0 ? formatToolsForOpenAI(tools) : undefined;

  const response = await client.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => {
        if (m.role === "tool") {
          return { role: "tool", tool_call_id: m.tool_use_id, content: m.content };
        }
        return { role: m.role, content: m.content };
      }),
    ],
    tools: formattedTools,
    max_tokens: 1024,
  }, { signal });

  const choice = response.choices[0];
  const text = choice.message.content || "";
  const toolCalls = (choice.message.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments),
  }));

  return { text, toolCalls, stopReason: choice.finish_reason };
}

/**
 * Execute a single agent turn with tool calling loop
 * Keeps calling LLM until no more tool calls or max iterations
 */
async function agentLoop(systemPrompt, initialMessage, tools, toolExecutor, maxIterations = 5) {
  const messages = [{ role: "user", content: initialMessage }];

  for (let i = 0; i < maxIterations; i++) {
    const result = await chat(systemPrompt, messages, tools);

    if (result.toolCalls.length === 0) {
      return { text: result.text, messages };
    }

    // Add assistant response
    messages.push({ role: "assistant", content: result.text || "" });

    // Execute tool calls
    for (const tc of result.toolCalls) {
      let toolResult;
      try {
        toolResult = await toolExecutor(tc.name, tc.args);
      } catch (e) {
        toolResult = JSON.stringify({ error: e.message });
      }

      messages.push({
        role: "tool",
        tool_use_id: tc.id,
        content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
      });
    }
  }

  return { text: "Max iterations reached", messages };
}

module.exports = { chat, agentLoop, isAvailable, LLM_PROVIDER, LLM_MODEL };
