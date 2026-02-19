/**
 * Copyright 2026 Xavier Portilla Edo
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { genkit, z } from 'genkit';
import {
  azureOpenAI,
  gpt4o,
  onCallGenkit,
  requireApiKey,
} from 'genkitx-azure-openai';

// Initialize Genkit with Azure OpenAI plugin
const ai = genkit({
  plugins: [
    azureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT_ID,
      apiVersion: process.env.OPENAI_API_VERSION,
    }),
  ],
  model: gpt4o,
});

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Input schema for the story generator
 */
const StoryInputSchema = z.object({
  topic: z.string().describe('The main topic or theme for the story'),
  style: z.string().optional().describe('Writing style (e.g., adventure, mystery, sci-fi)'),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
});

/**
 * Output schema for generated stories
 */
const StoryOutputSchema = z.object({
  title: z.string(),
  genre: z.string(),
  story: z.string(),
  wordCount: z.number(),
  themes: z.array(z.string()),
});

// ============================================================================
// Flow Definitions
// ============================================================================

/**
 * Story Generator Flow
 * Generates creative stories based on topic, style, and length
 */
const storyGeneratorFlow = ai.defineFlow(
  {
    name: 'storyGeneratorFlow',
    inputSchema: StoryInputSchema,
    outputSchema: StoryOutputSchema,
  },
  async (input) => {
    const lengthMap = {
      short: '200-300',
      medium: '500-700',
      long: '1000-1500',
    };

    const wordCount = lengthMap[input.length];

    const llmResponse = await ai.generate({
      prompt: `Create a creative ${input.style || 'fictional'} story with the following requirements:
Topic: ${input.topic}
Length: ${wordCount} words

Please provide a captivating story with a clear beginning, middle, and end.
Include rich descriptions and engaging characters.

Respond with ONLY a JSON object in this exact format (no schema, no markdown):
{"title": "story title", "genre": "genre", "story": "full story text", "wordCount": 250, "themes": ["theme1", "theme2"]}`,
    });

    return JSON.parse(llmResponse.text);
  }
);

/**
 * Joke Generator Flow
 * A simple flow that generates jokes about a given subject
 */
const jokeFlow = ai.defineFlow(
  {
    name: 'jokeFlow',
    inputSchema: z.object({
      subject: z.string().describe('The subject to tell a joke about'),
    }),
    outputSchema: z.object({
      joke: z.string(),
      type: z.string().optional(),
    }),
  },
  async (input) => {
    const llmResponse = await ai.generate({
      prompt: `Tell me a funny joke about ${input.subject}. Make it clever and appropriate for all ages.

Respond with ONLY a JSON object in this exact format (no schema, no markdown):
{"joke": "your joke here", "type": "pun"}`,
    });

    return JSON.parse(llmResponse.text);
  }
);

/**
 * Streaming Joke Generator Flow
 * Same as jokeFlow but streams text chunks as they arrive from the LLM.
 * Uses streamSchema + sendChunk so that `flow.stream()` emits intermediate data.
 */
const jokeStreamingFlow = ai.defineFlow(
  {
    name: 'jokeStreamingFlow',
    inputSchema: z.object({
      subject: z.string().describe('The subject to tell a joke about'),
    }),
    outputSchema: z.object({
      joke: z.string(),
      type: z.string().optional(),
    }),
    streamSchema: z.string(),
  },
  async (input, sendChunk) => {
    const { stream, response } = await ai.generateStream({
      prompt: `Tell me a funny joke about ${input.subject}. Make it clever and appropriate for all ages.`,
    });

    // Forward LLM text chunks to the flow stream
    for await (const chunk of stream) {
      sendChunk(chunk.text);
    }

    const result = await response;
    return { joke: result.text };
  }
);

/**
 * Protected Summary Flow
 * Demonstrates a flow with API key protection
 */
const protectedSummaryFlow = ai.defineFlow(
  {
    name: 'protectedSummaryFlow',
    inputSchema: z.object({
      text: z.string().describe('The text to summarize'),
      maxLength: z.number().optional().describe('Maximum summary length in words'),
    }),
    outputSchema: z.object({
      summary: z.string(),
      keyPoints: z.array(z.string()),
      originalLength: z.number(),
      summaryLength: z.number(),
    }),
  },
  async (input) => {
    const maxLen = input.maxLength || 100;

    const llmResponse = await ai.generate({
      prompt: `Summarize the following text in ${maxLen} words or less.
Also extract 3-5 key points.

Text: ${input.text}

Respond with ONLY a JSON object in this exact format (no schema, no markdown):
{"summary": "your summary here", "keyPoints": ["point 1", "point 2", "point 3"]}`,
    });

    const parsed = JSON.parse(llmResponse.text);

    return {
      summary: parsed.summary,
      keyPoints: parsed.keyPoints,
      originalLength: input.text.split(/\s+/).length,
      summaryLength: parsed.summary.split(/\s+/).length,
    };
  }
);

// ============================================================================
// Azure Functions HTTP Triggers using onCallGenkit
// ============================================================================

/**
 * Story Generator Handler
 *
 * Basic usage of onCallGenkit - wraps the flow with CORS and error handling
 *
 * @example
 * POST /api/storyGeneratorFlow
 * {
 *   "data": {
 *     "topic": "a robot learning to feel emotions",
 *     "style": "sci-fi",
 *     "length": "medium"
 *   }
 * }
 */
export const storyGeneratorHandler = onCallGenkit(
  {
    cors: {
      origin: '*',
      methods: ['POST', 'OPTIONS'],
    },
    debug: process.env.NODE_ENV !== 'production',
  },
  storyGeneratorFlow
);

/**
 * Joke Generator Handler
 *
 * Simple flow without additional options
 *
 * @example
 * POST /api/jokeFlow
 */
export const jokeHandler = onCallGenkit(jokeFlow);

/**
 * Joke Streaming Handler
 *
 * Uses streaming for real incremental SSE delivery.
 * Compatible with `streamFlow` from `genkit/beta/client`.
 *
 * @example
 * POST /api/jokeStreamingFlow
 * Accept: text/event-stream
 * {
 *   "data": {
 *     "subject": "programming"
 *   }
 * }
 */
export const jokeStreamHandler = onCallGenkit(
  {
    streaming: true,
    cors: {
      origin: '*',
      methods: ['POST', 'OPTIONS'],
    },
    debug: process.env.NODE_ENV !== 'production',
  },
  jokeStreamingFlow
);

/**
 * Protected Handler with API Key
 *
 * Demonstrates using ContextProvider for authentication
 * Requires X-API-Key header with correct value
 *
 * @example
 * POST /api/protectedSummaryFlow
 * Headers: { "X-API-Key": "your-secret-api-key" }
 * {
 *   "data": {
 *     "text": "Long text to summarize...",
 *     "maxLength": 50
 *   }
 * }
 */
export const protectedHandler = onCallGenkit(
  {
    contextProvider: requireApiKey('X-API-Key', process.env.API_KEY || 'demo-api-key'),
    cors: {
      origin: ['https://myapp.com', 'http://localhost:3000'],
      credentials: true,
    },
    onError: async (error: Error) => {
      // Custom error handling
      console.error('Protected flow error:', error);
      return {
        statusCode: error.message.includes('Unauthorized') ? 401 : 500,
        message: error.message,
      };
    },
  },
  protectedSummaryFlow
);

// ============================================================================
// Export flows for Genkit Dev UI
// ============================================================================

export { storyGeneratorFlow, jokeFlow, jokeStreamingFlow, protectedSummaryFlow };
