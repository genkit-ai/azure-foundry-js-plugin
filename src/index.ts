/**
 * Copyright 2026 Xavier Portilla Edo
 * Copyright 2026 Google LLC
 * Copyright 2026 Bloom Inc.
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

import type { Genkit } from "genkit";
import { genkitPlugin } from "genkit/plugin";
import { AzureOpenAI } from "openai";

import { dallE3, dallE3Model } from "./dalle.js";
import { whisper1, whisper1Model } from "./whisper.js";

import {
  openaiEmbedder,
  SUPPORTED_EMBEDDING_MODELS,
  textEmbedding3Large,
  textEmbedding3Small,
  textEmbeddingAda002,
} from "./embedder.js";
import {
  gpt35Turbo,
  gpt4,
  gpt41,
  gpt41Mini,
  gpt41Nano,
  o1Preview,
  o1Mini,
  o1,
  gpt4o,
  gpt4oMini,
  o3,
  o3Mini,
  o3Pro,
  o4Mini,
  codexMini,
  gpt45,
  gpt5,
  gpt5Mini,
  gpt5Nano,
  gpt5Chat,
  gpt5Codex,
  gpt5Pro,
  gpt51,
  gpt51Chat,
  gpt51Codex,
  gpt51CodexMini,
  gpt51CodexMax,
  gpt52,
  gpt52Chat,
  gpt52Codex,
  gptOss120b,
  gptOss20b,
  gptModel,
  SUPPORTED_GPT_MODELS,
} from "./gpt.js";
import { SUPPORTED_TTS_MODELS, ttsModel, tts1, tts1Hd } from "./tts.js";
import { AzureClientOptions } from "openai/azure";
export {
  onCallGenkit,
  requireApiKey,
  requireBearerToken,
  requireHeader,
  allowAll,
  allOf,
  anyOf,
} from "./azure_functions.js";
export type {
  CorsOptions,
  AzureFunctionsOptions,
  AzureFunctionsActionContext,
  AzureFunctionsFlowResponse,
  AzureFunctionsHandler,
  CallableAzureFunction,
  FlowResponse,
  FlowErrorResponse,
  FlowRunOptions,
  ApiKeyContext,
  BearerTokenContext,
} from "./azure_functions.js";
export {
  dallE3,
  tts1,
  tts1Hd,
  whisper1,
  gpt35Turbo,
  gpt4,
  gpt41,
  gpt41Mini,
  gpt41Nano,
  o1,
  o1Mini,
  o1Preview,
  gpt4o,
  gpt4oMini,
  o3,
  o3Mini,
  o3Pro,
  o4Mini,
  codexMini,
  gpt45,
  gpt5,
  gpt5Mini,
  gpt5Nano,
  gpt5Chat,
  gpt5Codex,
  gpt5Pro,
  gpt51,
  gpt51Chat,
  gpt51Codex,
  gpt51CodexMini,
  gpt51CodexMax,
  gpt52,
  gpt52Chat,
  gpt52Codex,
  gptOss120b,
  gptOss20b,
  textEmbedding3Large,
  textEmbedding3Small,
  textEmbeddingAda002,
};

export type PluginOptions = AzureClientOptions;

export const azureOpenAI = (options?: PluginOptions) =>
  genkitPlugin("azure-openai", async (ai: Genkit) => {
    const client = new AzureOpenAI(options);
    for (const name of Object.keys(SUPPORTED_GPT_MODELS)) {
      gptModel(ai, name, client);
    }
    dallE3Model(ai, client);
    whisper1Model(ai, client);
    for (const name of Object.keys(SUPPORTED_TTS_MODELS)) {
      ttsModel(ai, name, client);
    }
    for (const name of Object.keys(SUPPORTED_EMBEDDING_MODELS)) {
      openaiEmbedder(ai, name, client);
    }
  });

export default azureOpenAI;
