import { Platform } from 'react-native';
import type { LlamaContext } from 'llama.rn';
import { loadSettings } from './settingsStore';
import { loadHistory, HistoryItem } from './historyStore';
import { loadMemories } from './memoryStore';
import { generateEmbedding, cosineSimilarity } from './EmbeddingEngine';

let initLlama: any;
function getInitLlama() {
  if (!initLlama && Platform.OS !== 'web') {
    initLlama = require('llama.rn').initLlama;
  }
  return initLlama;
}

let llamaContext: LlamaContext | null = null;
let currentModelPath = '';

export async function loadChatLLM(modelPath: string): Promise<void> {
  if (llamaContext && currentModelPath === modelPath) return;
  if (llamaContext) await unloadChatLLM();
  
  try {
    const init = getInitLlama();
    llamaContext = await init({
      n_ctx: 4096, // Increased context window for reading full transcripts
      model: modelPath,
    });
    currentModelPath = modelPath;
  } catch (error) {
    console.error("Failed to load Chat LLM:", error);
    throw error;
  }
}

export async function unloadChatLLM(): Promise<void> {
  if (llamaContext) {
    try {
      await llamaContext.release();
    } catch (e) {
      console.warn("Error releasing chat context", e);
    }
    llamaContext = null;
    currentModelPath = '';
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

async function searchTranscripts(query: string): Promise<HistoryItem[]> {
  const history = await loadHistory();
  if (!history || history.length === 0) return [];
  
  // Sort history newest first
  const sortedHistory = [...history].sort((a, b) => new Date(b.timestampISO).getTime() - new Date(a.timestampISO).getTime());

  // Try Semantic Search first
  const queryEmbedding = await generateEmbedding(query);
  if (queryEmbedding) {
    const scored = history.map(item => {
      let score = 0;
      if (item.embedding) {
        score = cosineSimilarity(queryEmbedding, item.embedding);
      }
      return { item, score };
    });
    
    // Sort by semantic similarity
    scored.sort((a, b) => b.score - a.score);
    // Keep results that have at least some positive similarity
    const semanticResults = scored.filter(s => s.score > 0.1).slice(0, 3).map(s => s.item);
    
    if (semanticResults.length > 0) {
      return semanticResults;
    }
  }

  // Fallback to BM25 keyword search if embeddings fail or return nothing
  const lowerQuery = query.toLowerCase();
  const stopWords = ['and', 'the', 'check', 'what', 'see', 'this', 'that', 'with', 'from', 'about'];
  const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));
  
  if (queryWords.length === 0) return sortedHistory.slice(0, 3);

  const scored = history.map(item => {
    let score = 0;
    const text = [
      item.sourceFileName,
      item.rawTranscript,
      item.formattedTranscript,
      item.summary
    ].filter(Boolean).join(' ').toLowerCase();
    
    for (const word of queryWords) {
      if (item.sourceFileName?.toLowerCase().includes(word)) score += 5;
      
      let index = text.indexOf(word);
      while (index !== -1) {
        score += 1;
        index = text.indexOf(word, index + 1);
      }
    }
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const results = scored.filter(s => s.score > 0).slice(0, 3).map(s => s.item);
  
  // ALWAYS ensure the absolute newest transcript is in the context, even if search misses it.
  const absoluteNewest = sortedHistory[0];
  if (absoluteNewest && !results.find(r => r.id === absoluteNewest.id)) {
    // Inject at the beginning
    results.unshift(absoluteNewest);
    if (results.length > 3) results.pop(); // keep it to 3 max
  }

  if (results.length === 0 && absoluteNewest) {
    return [absoluteNewest];
  }
  
  return results;
}

// Build the optimized XML prompt
function buildRAGPrompt(modelFile: string, messages: ChatMessage[], contextText: string, memoryText: string, historyCount: number): string {
  const lower = modelFile.toLowerCase();
  
  let systemContent = `You are Muffin Chat, a highly intelligent assistant.
Your job is to answer questions using the provided <context> and <global_state>.
The <global_state> contains real-time information about the app and the user's latest transcripts.
The <context> contains up to 3 relevant transcripts. Each transcript has a <name>, and three variants:
- <variant_raw>: The exact, unedited literal words spoken.
- <variant_formatted>: The cleaned up, readable version.
- <variant_summary>: A short summary.
Understand the difference between these variants.

CRITICAL RULES:
1. Be concise and direct.
2. You MUST use the exact <name> when referring to a transcript so the UI can create a link. For example, instead of saying "In the latest transcript, you said...", you must say "In the transcript called Meeting Notes, you said..."
3. If you don't know something, say you don't know. Do not hallucinate.
4. If the user asks you to perform an action (like deleting a transcript or navigating tabs), you MUST output a brief conversational confirmation followed by an XML block.
5. If the user asks you to do something you cannot do (e.g. send an email), politely explain what you CAN do (delete transcripts and navigate the app).
6. For deleting transcripts, you MUST use the exact ID from the <history_index>.

<tools>
To execute an action, output a JSON object wrapped in <tool_call> tags. 
You SHOULD output a brief, friendly conversational confirmation before the block.
Example 1 (Delete):
Ok! I've deleted the transcript for you.
<tool_call>{"action": "DELETE_TRANSCRIPT", "transcript_id": "the-transcript-id-here"}</tool_call>

Example 2 (Navigate):
<tool_call>{"action": "NAVIGATE_TO", "tab": "settings"}</tool_call>
(Valid tabs: index, record, history, chat, settings)
</tools>

<global_state>
Current Date and Time: ${new Date().toLocaleString()}
Total Transcripts Saved: ${historyCount}

<history_index>
Below is a chronological list of EVERY transcript you have, from newest to oldest:
${memoryText ? memoryText.split('\n__HISTORY_INDEX__\n')[1] : ''}
</history_index>
</global_state>

<context>
${contextText}
</context>`;

  // Extract real memory text back
  const realMemory = memoryText ? memoryText.split('\n__HISTORY_INDEX__\n')[0] : '';
  if (realMemory) {
    systemContent += `\n<memory>\nBe aware of the user's specific jargon:\n${realMemory}\n</memory>`;
  }

  // Build full prompt string based on model type
  let fullPrompt = '';
  
  if (lower.includes('llama-3')) {
    fullPrompt += `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${systemContent}<|eot_id|>`;
    for (const m of messages) {
      fullPrompt += `<|start_header_id|>${m.role}<|end_header_id|>\n\n${m.content}<|eot_id|>`;
    }
    fullPrompt += `<|start_header_id|>assistant<|end_header_id|>\n\n`;
  } else if (lower.includes('phi-3')) {
    fullPrompt += `<|system|>\n${systemContent}<|end|>\n`;
    for (const m of messages) {
      fullPrompt += `<|${m.role}|>\n${m.content}<|end|>\n`;
    }
    fullPrompt += `<|assistant|>\n`;
  } else {
    // ChatML Default (Qwen)
    fullPrompt += `<|im_start|>system\n${systemContent}<|im_end|>\n`;
    for (const m of messages) {
      fullPrompt += `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`;
    }
    fullPrompt += `<|im_start|>assistant\n`;
  }
  
  return fullPrompt;
}

export async function chatStream(
  messages: ChatMessage[], 
  modelPath: string, 
  modelFile: string,
  onToken: (token: string) => void
): Promise<string> {
  await loadChatLLM(modelPath);
  if (!llamaContext) throw new Error("Chat LLM not loaded");
  
  const settings = await loadSettings();
  const history = await loadHistory();
  
  // 1. Determine query intent and search
  const lastUserMsg = messages[messages.length - 1].content;
  const searchResults = await searchTranscripts(lastUserMsg);
  
  let contextText = "No relevant transcripts found.";
  if (searchResults.length > 0) {
    contextText = searchResults.map(item => {
      const sum = item.summary || 'None';
      const form = item.formattedTranscript || 'None';
      const raw = item.rawTranscript || 'None';
      
      const truncate = (text: string, limit: number) => text.length > limit ? text.substring(0, limit) + "... (truncated)" : text;
      
      return `<transcript>
  <name>${item.sourceFileName.replace(/\.[^/.]+$/, "")}</name>
  <id>${item.id}</id>
  <created_at>${new Date(item.timestampISO).toLocaleString()}</created_at>
  <variant_summary>${truncate(sum, 1000)}</variant_summary>
  <variant_formatted>${truncate(form, 2000)}</variant_formatted>
  <variant_raw>${truncate(raw, 2000)}</variant_raw>
</transcript>`;
    }).join('\n');
  }

  // 2. Load memories and build history index
  let memoryText = "";
  if (settings.enableContextLearning) {
    const memories = await loadMemories();
    if (memories.length > 0) {
      memoryText = memories.map(m => "- " + m.text).join('\n');
    }
  }
  
  // Hack to pass history index through the memoryText argument without changing signature
  const sortedHistory = [...history].sort((a, b) => new Date(b.timestampISO).getTime() - new Date(a.timestampISO).getTime());
  const historyIndex = sortedHistory.map(h => `- ID: ${h.id} | Name: ${h.sourceFileName.replace(/\.[^/.]+$/, "")} | Date: ${new Date(h.timestampISO).toLocaleString()}`).join('\n');
  memoryText += '\n__HISTORY_INDEX__\n' + historyIndex;

  // 3. Build optimized prompt
  const prompt = buildRAGPrompt(modelFile, messages, contextText, memoryText, history.length);
  
  // 4. Stream response
  let fullResponse = "";
  
  const stopTokens = [
    "<|im_end|>", "<|end|>", "<|eot_id|>", "<|endoftext|>", "```"
  ];
  
  try {
    await llamaContext.completion(
      {
        prompt,
        n_predict: 512,
        temperature: 0.7, // slightly creative for chat
      },
      (data) => {
        const text = data.token;
        if (stopTokens.some(token => text.includes(token))) {
          // It's a stop token, we ignore it from the output
          return;
        }
        fullResponse += text;
        onToken(text);
      }
    );
  } catch (error) {
    // Re-throw so the caller (chat.tsx) can distinguish a real failure from a
    // short/empty response and show the "encountered an error" bubble.
    console.error("Chat streaming error:", error);
    throw error;
  }

  return fullResponse.trim();
}
