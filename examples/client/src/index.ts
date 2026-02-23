/**
 * Copyright 2026 Xavier Portilla Edo
 * Copyright 2026 Google LLC
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

/**
 * Genkit Client Example — Azure Functions
 *
 * Demonstrates how to use the Genkit client library to call flows deployed
 * as Azure Functions using onCallGenkit.
 *
 * Usage:
 *   1. Deploy the azure-functions example first (see ../azure-functions/README.md)
 *      or start it locally with `npm start` in ../azure-functions
 *   2. Set AZURE_FUNCTIONS_BASE_URL to your Function App URL (defaults to localhost)
 *   3. Run: npm run dev [joke|story|protected|stream|all]
 *
 * @see https://genkit.dev/docs/client/
 */

import { runFlow, streamFlow } from 'genkit/beta/client';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Base URL for the Azure Functions app.
 * Locally: http://localhost:7071/api
 * Deployed: https://<app-name>.azurewebsites.net/api
 */
const BASE_URL =
  process.env.AZURE_FUNCTIONS_BASE_URL || 'http://localhost:7071/api';

// ============================================================================
// Examples
// ============================================================================

/**
 * Call the jokeFlow — a simple non-streaming flow.
 */
async function callJokeFlow() {
  console.log('\n--- Joke Flow ---');
  console.log(`Calling ${BASE_URL}/jokeFlow ...`);

  const result = await runFlow({
    url: `${BASE_URL}/jokeFlow`,
    input: { subject: 'programming' },
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * Call the storyGeneratorFlow — generates a creative story.
 */
async function callStoryGeneratorFlow() {
  console.log('\n--- Story Generator Flow ---');
  console.log(`Calling ${BASE_URL}/storyGeneratorFlow ...`);

  const result = await runFlow({
    url: `${BASE_URL}/storyGeneratorFlow`,
    input: {
      topic: 'a robot learning to feel emotions',
      style: 'sci-fi',
      length: 'short',
    },
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * Call the protectedSummaryFlow — requires an API key header.
 */
async function callProtectedFlow() {
  console.log('\n--- Protected Summary Flow (with API Key) ---');
  console.log(`Calling ${BASE_URL}/protectedSummaryFlow ...`);

  const apiKey = process.env.API_KEY || 'demo-api-key';

  const result = await runFlow({
    url: `${BASE_URL}/protectedSummaryFlow`,
    input: {
      text: 'Artificial intelligence has transformed the way we interact with technology. '
        + 'From voice assistants that manage our daily schedules to recommendation systems '
        + 'that curate our entertainment, AI is embedded in nearly every aspect of modern life. '
        + 'Machine learning models have grown exponentially in capability, enabling breakthroughs '
        + 'in healthcare, education, and creative industries. However, these advances also raise '
        + 'important questions about privacy, bias, and the future of work.',
      maxLength: 50,
    },
    headers: {
      'X-API-Key': apiKey,
    },
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  return result;
}

/**
 * Call the jokeStreamingFlow — demonstrates streaming via SSE.
 * Uses `streamFlow` from genkit/beta/client.
 */
async function callJokeFlowStreaming() {
  console.log('\n--- Joke Flow (Streaming) ---');
  console.log(`Calling ${BASE_URL}/jokeStreamingFlow with streaming ...`);

  const result = streamFlow({
    url: `${BASE_URL}/jokeStreamingFlow`,
    input: { subject: 'TypeScript' },
  });

  for await (const chunk of result.stream) {
    process.stdout.write(typeof chunk === 'string' ? chunk : JSON.stringify(chunk));
  }

  console.log(); // newline after streamed chunks

  const finalOutput = await result.output;
  console.log('Final result:', JSON.stringify(finalOutput, null, 2));
  return finalOutput;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('=== Genkit Client — Azure Functions Example ===');
  console.log(`Target: ${BASE_URL}`);
  console.log(
    'Make sure the Azure Functions example is running (npm start in ../azure-functions)\n'
  );

  const args = process.argv.slice(2);
  const example = args[0] || 'joke';

  try {
    switch (example) {
      case 'joke':
        await callJokeFlow();
        break;
      case 'story':
        await callStoryGeneratorFlow();
        break;
      case 'protected':
        await callProtectedFlow();
        break;
      case 'stream':
        await callJokeFlowStreaming();
        break;
      case 'all':
        await callJokeFlow();
        await callStoryGeneratorFlow();
        await callProtectedFlow();
        await callJokeFlowStreaming();
        break;
      default:
        console.log(`Unknown example: ${example}`);
        console.log('Available: joke, story, protected, stream, all');
        process.exit(1);
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.error('\nError calling flow:', err.message || error);
    if (err.cause) {
      console.error('Cause:', err.cause);
    }
    process.exit(1);
  }
}

main();
