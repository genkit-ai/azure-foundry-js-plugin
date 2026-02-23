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

import { app } from "@azure/functions";
import type {
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
  HttpHandler,
} from "@azure/functions";
import { type Flow, type z, type ActionContext, UserFacingError } from "genkit";
import {
  getCallableJSON,
  getHttpStatus,
  type ContextProvider,
  type RequestData,
} from "genkit/context";

// Re-export genkit context types for convenience
export type { ContextProvider, RequestData, ActionContext };

/**
 * Type helpers to extract input/output types from Flow
 */
type FlowInput<F extends Flow> =
  F extends Flow<infer I, z.ZodTypeAny, z.ZodTypeAny> ? z.infer<I> : never;

type FlowOutput<F extends Flow> =
  F extends Flow<z.ZodTypeAny, infer O, z.ZodTypeAny> ? z.infer<O> : never;

type FlowStream<F extends Flow> =
  F extends Flow<z.ZodTypeAny, z.ZodTypeAny, infer S> ? z.infer<S> : never;

/**
 * CORS configuration options
 */
export interface CorsOptions {
  /**
   * Allowed origins for CORS requests.
   * Can be a string, array of strings, or '*' for all origins.
   * @default '*'
   */
  origin?: string | string[];

  /**
   * Allowed HTTP methods.
   * @default ['POST', 'OPTIONS']
   */
  methods?: string[];

  /**
   * Allowed headers in requests.
   * @default ['Content-Type', 'Authorization']
   */
  allowedHeaders?: string[];

  /**
   * Headers exposed to the client.
   */
  exposedHeaders?: string[];

  /**
   * Whether to allow credentials.
   * @default false
   */
  credentials?: boolean;

  /**
   * Max age for preflight cache (in seconds).
   * @default 86400 (24 hours)
   */
  maxAge?: number;
}

/**
 * Extended action context that includes Azure Functions-specific information
 */
export interface AzureFunctionsActionContext extends ActionContext {
  /** Azure Functions-specific context data */
  azureFunctions?: {
    request: {
      url: string;
      headers: Record<string, string>;
      query: Record<string, string>;
      params: Record<string, string>;
    };
    context: {
      functionName: string;
      invocationId: string;
    };
  };
}

/**
 * Options for configuring the Azure Functions handler
 */
export interface AzureFunctionsOptions<
  C extends ActionContext = ActionContext,
  T = unknown,
> {
  /**
   * The authorization level for the Azure Functions HTTP trigger.
   * @default 'anonymous'
   */
  authLevel?: "anonymous" | "function" | "admin";

  /**
   * HTTP methods to register for the Azure Functions HTTP trigger.
   * @default ['POST', 'OPTIONS']
   */
  httpMethods?: string[];

  /**
   * Optional custom route for the Azure Functions HTTP trigger.
   * If not provided, the function name is used as the route.
   */
  route?: string;

  /**
   * CORS configuration. Set to false to disable CORS headers.
   * @default { origin: '*', methods: ['POST', 'OPTIONS'] }
   */
  cors?: CorsOptions | boolean;

  /**
   * Context provider that parses request data and returns context for the flow.
   * This follows the same pattern as express, next.js, and other Genkit integrations.
   *
   * The context provider receives a RequestData object containing:
   * - method: HTTP method ('GET', 'POST', etc.)
   * - headers: Lowercase headers from the request
   * - input: Parsed request body
   *
   * Return an ActionContext object that will be available via getContext() in the flow.
   * Throw UserFacingError for authentication/authorization failures.
   *
   * @example
   * ```typescript
   * import { UserFacingError } from 'genkit';
   *
   * const authProvider: ContextProvider = async (req) => {
   *   const token = req.headers['authorization'];
   *   if (!token) {
   *     throw new UserFacingError('UNAUTHENTICATED', 'Missing auth token');
   *   }
   *   const user = await verifyToken(token);
   *   return { auth: { user } };
   * };
   *
   * export const handler = onCallGenkit(
   *   { contextProvider: authProvider },
   *   myFlow
   * );
   * ```
   */
  contextProvider?: ContextProvider<C, T>;

  /**
   * Custom error handler for transforming errors before response.
   */
  onError?: (error: Error) =>
    | { statusCode: number; message: string }
    | Promise<{
        statusCode: number;
        message: string;
      }>;

  /**
   * Whether to log incoming requests (for debugging).
   * @default false
   */
  debug?: boolean;

  /**
   * Whether to return a streaming handler.
   * When true, the handler returns a streaming response using
   * `ReadableStream` for incremental SSE delivery.
   *
   * The streaming handler is compatible with `streamFlow` from `genkit/beta/client`.
   * For clients sending `Accept: text/event-stream`, it writes SSE chunks
   * incrementally. Otherwise it falls back to a buffered JSON response.
   *
   * @default false
   *
   * @example
   * ```typescript
   * export const handler = onCallGenkit(
   *   { streaming: true },
   *   myStreamingFlow
   * );
   * ```
   */
  streaming?: boolean;
}

/**
 * Response wrapper for successful flow execution (callable protocol).
 * Follows the same format as express and other Genkit integrations.
 */
export interface FlowResponse<T> {
  result: T;
}

/**
 * Response wrapper for failed flow execution (callable protocol).
 * Shape matches genkit's getCallableJSON output.
 */
export interface FlowErrorResponse {
  error: {
    status: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Union type for flow responses
 */
export type AzureFunctionsFlowResponse<T> = FlowResponse<T> | FlowErrorResponse;

/**
 * Azure Functions handler type
 */
export type AzureFunctionsHandler = HttpHandler;

/**
 * Run options for flow execution
 */
export interface FlowRunOptions {
  context?: Record<string, unknown>;
}

/**
 * Callable function type that includes the raw handler and metadata
 */
export interface CallableAzureFunction<F extends Flow> {
  /**
   * The Azure Functions HTTP handler
   */
  handler: HttpHandler;

  /**
   * The underlying Genkit flow
   */
  flow: F;

  /**
   * Execute the flow directly (for testing)
   */
  run: (
    input: FlowInput<F>,
    options?: FlowRunOptions,
  ) => Promise<FlowOutput<F>>;

  /**
   * Stream the flow directly (for testing)
   */
  stream: (
    input: FlowInput<F>,
    options?: FlowRunOptions,
  ) => {
    stream: AsyncIterable<FlowStream<F>>;
    output: Promise<FlowOutput<F>>;
  };

  /**
   * Flow name
   */
  flowName: string;
}

/**
 * Builds CORS headers based on options
 */
function buildCorsHeaders(
  corsOptions: CorsOptions | boolean | undefined,
  requestOrigin?: string,
): Record<string, string> {
  if (corsOptions === false) {
    return {};
  }

  const opts: CorsOptions =
    corsOptions === true || corsOptions === undefined ? {} : corsOptions;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Handle origin
  const origin = opts.origin ?? "*";
  if (Array.isArray(origin)) {
    // Check if request origin is in allowed list
    if (requestOrigin && origin.includes(requestOrigin)) {
      headers["Access-Control-Allow-Origin"] = requestOrigin;
    }
    // If request origin is not in the allowlist, don't set the header
  } else {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  // Handle methods
  const methods = opts.methods ?? ["POST", "OPTIONS"];
  headers["Access-Control-Allow-Methods"] = methods.join(", ");

  // Handle allowed headers
  const allowedHeaders = opts.allowedHeaders ?? [
    "Content-Type",
    "Authorization",
  ];
  headers["Access-Control-Allow-Headers"] = allowedHeaders.join(", ");

  // Handle exposed headers
  if (opts.exposedHeaders && opts.exposedHeaders.length > 0) {
    headers["Access-Control-Expose-Headers"] = opts.exposedHeaders.join(", ");
  }

  // Handle credentials
  if (opts.credentials) {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  // Handle max age
  const maxAge = opts.maxAge ?? 86400;
  headers["Access-Control-Max-Age"] = String(maxAge);

  return headers;
}

/**
 * Parses the request body from an Azure Functions HttpRequest.
 * Supports the Genkit callable protocol format where input is wrapped in { data: ... }
 * as well as direct input format for convenience.
 */
async function parseRequestBody<T>(request: HttpRequest): Promise<T> {
  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return {} as T;
  }

  if (!bodyText) {
    return {} as T;
  }

  try {
    const parsed = JSON.parse(bodyText);
    // Support callable protocol: { data: <input> }
    if (parsed && typeof parsed === "object" && "data" in parsed) {
      return parsed.data as T;
    }
    return parsed as T;
  } catch {
    throw new UserFacingError(
      "INVALID_ARGUMENT",
      "Invalid JSON in request body",
    );
  }
}

/**
 * Gets the request origin from headers
 */
function getRequestOrigin(request: HttpRequest): string | undefined {
  return request.headers.get("origin") || undefined;
}

/**
 * Converts Azure Functions request headers to lowercase record (as required by RequestData)
 */
function normalizeHeaders(request: HttpRequest): Record<string, string> {
  const result: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

/**
 * Gets query parameters as a plain record
 */
function getQueryParams(request: HttpRequest): Record<string, string> {
  const result: Record<string, string> = {};
  const url = new URL(request.url);
  url.searchParams.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * Converts Azure Functions request to Genkit RequestData format
 */
function toRequestData<T>(request: HttpRequest, input: T): RequestData<T> {
  return {
    method: request.method as RequestData["method"],
    headers: normalizeHeaders(request),
    input,
  };
}

/**
 * Creates an Azure Functions handler for a Genkit flow.
 *
 * This function wraps a Genkit flow to create an Azure Functions HTTP handler that:
 * - Handles CORS automatically
 * - Supports ContextProvider for authentication/authorization
 * - Provides proper error handling
 * - Returns standardized response format
 * - Supports streaming responses via ReadableStream
 *
 * @example Basic usage (auto-registers Azure Functions HTTP trigger)
 * ```typescript
 * import { genkit, z } from 'genkit';
 * import { onCallGenkit, azureOpenAI, gpt4o } from 'genkitx-azure-openai';
 *
 * const ai = genkit({
 *   plugins: [azureOpenAI()],
 *   model: gpt4o,
 * });
 *
 * const myFlow = ai.defineFlow(
 *   { name: 'myFlow', inputSchema: z.string(), outputSchema: z.string() },
 *   async (input) => {
 *     const { text } = await ai.generate({ prompt: input });
 *     return text;
 *   }
 * );
 *
 * // Automatically registered as POST /api/myFlow (uses flow name)
 * export const myFlowFn = onCallGenkit(myFlow);
 * ```
 *
 * @example With ContextProvider for authentication
 * ```typescript
 * import { UserFacingError } from 'genkit';
 * import type { ContextProvider } from 'genkit/context';
 *
 * interface AuthContext {
 *   auth: { user: { id: string; name: string } };
 * }
 *
 * const authProvider: ContextProvider<AuthContext> = async (req) => {
 *   const token = req.headers['authorization'];
 *   if (!token) {
 *     throw new UserFacingError('UNAUTHENTICATED', 'Missing auth token');
 *   }
 *   const user = await verifyToken(token);
 *   return { auth: { user } };
 * };
 *
 * // Registered as POST /api/myFlow (uses flow name)
 * export const mySecureFlowFn = onCallGenkit(
 *   { contextProvider: authProvider },
 *   myFlow
 * );
 * ```
 *
 * @param flow - The Genkit flow to wrap
 * @returns A CallableAzureFunction with `handler`, `flow`, `run`, `stream`, and `flowName`
 */
export function onCallGenkit<F extends Flow>(flow: F): CallableAzureFunction<F>;

/**
 * Creates an Azure Functions handler for a Genkit flow with options.
 *
 * @param opts - Configuration options for the Azure Functions handler
 * @param flow - The Genkit flow to wrap
 * @returns A CallableAzureFunction with `handler`, `flow`, `run`, `stream`, and `flowName`
 */
export function onCallGenkit<C extends ActionContext, F extends Flow>(
  opts: AzureFunctionsOptions<C, FlowInput<F>> & { streaming: true },
  flow: F,
): CallableAzureFunction<F>;

export function onCallGenkit<C extends ActionContext, F extends Flow>(
  opts: AzureFunctionsOptions<C, FlowInput<F>>,
  flow: F,
): CallableAzureFunction<F>;

/**
 * Implementation of onCallGenkit
 */
export function onCallGenkit<C extends ActionContext, F extends Flow>(
  optsOrFlow: F | AzureFunctionsOptions<C, FlowInput<F>>,
  flowArg?: F,
): CallableAzureFunction<F> {
  let opts: AzureFunctionsOptions<C, FlowInput<F>>;
  let flow: F;

  if (arguments.length === 1) {
    opts = {};
    flow = optsOrFlow as F;
  } else {
    opts = optsOrFlow as AzureFunctionsOptions<C, FlowInput<F>>;
    flow = flowArg as F;
  }

  const flowName = flow.__action?.name || "unknown";

  /**
   * Build Azure Functions-specific context from the request
   */
  function buildAzureFunctionsContext(
    request: HttpRequest,
    azureContext: InvocationContext,
  ): AzureFunctionsActionContext {
    return {
      azureFunctions: {
        request: {
          url: request.url,
          headers: normalizeHeaders(request),
          query: getQueryParams(request),
          params: request.params as Record<string, string>,
        },
        context: {
          functionName: azureContext.functionName,
          invocationId: azureContext.invocationId,
        },
      },
    };
  }

  /**
   * Resolve action context, merging Azure Functions context with context provider
   */
  async function resolveActionContext(
    request: HttpRequest,
    azureContext: InvocationContext,
    input: FlowInput<F>,
  ): Promise<ActionContext> {
    const azureFunctionsContext = buildAzureFunctionsContext(
      request,
      azureContext,
    );

    if (opts.contextProvider) {
      const requestData = toRequestData(request, input);
      const providerContext = await opts.contextProvider(requestData);
      return { ...azureFunctionsContext, ...providerContext };
    }

    return azureFunctionsContext;
  }

  /**
   * Build error response
   */
  async function buildErrorResponse(
    error: unknown,
    corsHeaders: Record<string, string>,
  ): Promise<HttpResponseInit> {
    if (opts.onError) {
      const customError = await opts.onError(
        error instanceof Error ? error : new Error(String(error)),
      );
      return {
        status: customError.statusCode,
        headers: corsHeaders,
        jsonBody: {
          error: {
            status: "INTERNAL",
            message: customError.message,
          },
        } satisfies FlowErrorResponse,
      };
    }

    return {
      status: getHttpStatus(error),
      headers: corsHeaders,
      jsonBody: getCallableJSON(error),
    };
  }

  /**
   * Non-streaming handler
   */
  async function standardHandler(
    request: HttpRequest,
    azureContext: InvocationContext,
  ): Promise<HttpResponseInit> {
    const requestOrigin = getRequestOrigin(request);
    const corsHeaders = buildCorsHeaders(opts.cors, requestOrigin);

    // Handle OPTIONS preflight request
    if (request.method === "OPTIONS") {
      return {
        status: 204,
        headers: corsHeaders,
      };
    }

    // Debug logging
    if (opts.debug) {
      azureContext.log(
        `[${flowName}] Request: ${request.method} ${request.url}`,
      );
      azureContext.log(
        `[${flowName}] Headers:`,
        JSON.stringify(normalizeHeaders(request), null, 2),
      );
    }

    try {
      // Parse request body
      const input = await parseRequestBody<FlowInput<F>>(request);

      // Resolve context
      const actionContext = await resolveActionContext(
        request,
        azureContext,
        input,
      );

      if (opts.debug) {
        azureContext.log(`[${flowName}] Running flow with input:`, input);
      }

      // Execute the flow with context
      const runResult = await flow.run(input, { context: actionContext });
      const result = runResult.result as FlowOutput<F>;

      if (opts.debug) {
        azureContext.log(`[${flowName}] Flow completed successfully`);
      }

      // Return success response (callable protocol)
      return {
        status: 200,
        headers: corsHeaders,
        jsonBody: {
          result,
        } satisfies FlowResponse<FlowOutput<F>>,
      };
    } catch (error) {
      azureContext.error(`[${flowName}] Error:`, error);
      return buildErrorResponse(error, corsHeaders);
    }
  }

  /**
   * Streaming handler using ReadableStream
   */
  async function streamingHandler(
    request: HttpRequest,
    azureContext: InvocationContext,
  ): Promise<HttpResponseInit> {
    const requestOrigin = getRequestOrigin(request);
    const corsHeaders = buildCorsHeaders(opts.cors, requestOrigin);

    // Handle OPTIONS preflight
    if (request.method === "OPTIONS") {
      return {
        status: 204,
        headers: corsHeaders,
      };
    }

    if (opts.debug) {
      azureContext.log(
        `[${flowName}] Stream request: ${request.method} ${request.url}`,
      );
    }

    try {
      const input = await parseRequestBody<FlowInput<F>>(request);

      // Resolve context
      const actionContext = await resolveActionContext(
        request,
        azureContext,
        input,
      );

      // Check if client wants SSE streaming
      const acceptHeader = request.headers.get("accept") || "";
      const clientWantsStreaming = acceptHeader.includes("text/event-stream");

      if (clientWantsStreaming) {
        // Real streaming: return SSE events via ReadableStream
        const encoder = new TextEncoder();

        const readableStream = new ReadableStream({
          async start(controller) {
            try {
              const { stream, output } = flow.stream(input, {
                context: actionContext,
              });

              for await (const chunk of stream) {
                const sseData = `data: ${JSON.stringify({ message: chunk })}\n\n`;
                controller.enqueue(encoder.encode(sseData));
              }

              const result = (await output) as FlowOutput<F>;
              const sseFinal = `data: ${JSON.stringify({ result })}\n\n`;
              controller.enqueue(encoder.encode(sseFinal));

              controller.close();

              if (opts.debug) {
                azureContext.log(
                  `[${flowName}] Streaming flow completed successfully`,
                );
              }
            } catch (error) {
              azureContext.error(`[${flowName}] Stream error:`, error);
              const errorData = `data: ${JSON.stringify(getCallableJSON(error))}\n\n`;
              controller.enqueue(encoder.encode(errorData));
              controller.close();
            }
          },
        });

        return {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
          body: readableStream,
        };
      } else {
        // Non-streaming: buffered JSON response
        const runResult = await flow.run(input, {
          context: actionContext,
        });
        const result = runResult.result as FlowOutput<F>;

        return {
          status: 200,
          headers: corsHeaders,
          jsonBody: { result },
        };
      }
    } catch (error) {
      azureContext.error(`[${flowName}] Stream error:`, error);
      return buildErrorResponse(error, corsHeaders);
    }
  }

  // Choose the handler based on streaming option
  const handler: HttpHandler = opts.streaming
    ? streamingHandler
    : standardHandler;

  // Build the callable function object
  const callableFunction: CallableAzureFunction<F> = {
    handler,
    flow,
    flowName,
    run: async (
      input: FlowInput<F>,
      options?: FlowRunOptions,
    ): Promise<FlowOutput<F>> => {
      const runResult = await flow.run(input, {
        context: options?.context,
      });
      return runResult.result as FlowOutput<F>;
    },
    stream: (
      input: FlowInput<F>,
      options?: FlowRunOptions,
    ): {
      stream: AsyncIterable<FlowStream<F>>;
      output: Promise<FlowOutput<F>>;
    } => {
      return flow.stream(input, {
        context: options?.context,
      }) as unknown as {
        stream: AsyncIterable<FlowStream<F>>;
        output: Promise<FlowOutput<F>>;
      };
    },
  };

  // Auto-register the Azure Functions HTTP trigger using the flow name
  const methods = (opts.httpMethods ?? ["POST", "OPTIONS"]) as (
    | "GET"
    | "POST"
    | "PUT"
    | "DELETE"
    | "PATCH"
    | "HEAD"
    | "OPTIONS"
  )[];
  const authLevel = opts.authLevel ?? "anonymous";

  app.http(flowName, {
    methods,
    authLevel,
    ...(opts.route ? { route: opts.route } : {}),
    handler,
  });

  return callableFunction;
}

// ============================================================================
// Context Provider Helpers
// ============================================================================

/**
 * Context with API key authentication
 */
export interface ApiKeyContext extends ActionContext {
  auth: {
    apiKey: string;
  };
}

/**
 * Context with bearer token authentication
 */
export interface BearerTokenContext extends ActionContext {
  auth: {
    token: string;
  };
}

/**
 * Creates a context provider that requires an API key in a specific header.
 *
 * @example
 * ```typescript
 * // Require API key to match a specific value
 * const callable = onCallGenkit(
 *   { contextProvider: requireApiKey('X-API-Key', process.env.API_KEY!) },
 *   myFlow
 * );
 *
 * // Or with a custom validation function
 * const callable = onCallGenkit(
 *   {
 *     contextProvider: requireApiKey('X-API-Key', async (key) => {
 *       const valid = await validateApiKey(key);
 *       if (!valid) {
 *         throw new UserFacingError('PERMISSION_DENIED', 'Invalid API key');
 *       }
 *     })
 *   },
 *   myFlow
 * );
 * ```
 */
export function requireApiKey(
  headerName: string,
  expectedValueOrValidator: string | ((apiKey: string) => void | Promise<void>),
): ContextProvider<ApiKeyContext> {
  const lowerHeaderName = headerName.toLowerCase();

  return async (request: RequestData): Promise<ApiKeyContext> => {
    const apiKey = request.headers[lowerHeaderName];

    if (!apiKey) {
      throw new UserFacingError(
        "UNAUTHENTICATED",
        `Missing required header: ${headerName}`,
      );
    }

    if (typeof expectedValueOrValidator === "string") {
      if (apiKey !== expectedValueOrValidator) {
        throw new UserFacingError("PERMISSION_DENIED", "Invalid API key");
      }
    } else {
      await expectedValueOrValidator(apiKey);
    }

    return {
      auth: { apiKey },
    };
  };
}

/**
 * Creates a context provider that requires Bearer token authentication.
 *
 * @example
 * ```typescript
 * // With custom token validation
 * const callable = onCallGenkit(
 *   {
 *     contextProvider: requireBearerToken(async (token) => {
 *       const user = await verifyJWT(token);
 *       return { auth: { user } };
 *     })
 *   },
 *   myFlow
 * );
 * ```
 */
export function requireBearerToken<
  C extends ActionContext = BearerTokenContext,
>(validateToken: (token: string) => C | Promise<C>): ContextProvider<C> {
  return async (request: RequestData): Promise<C> => {
    const authHeader = request.headers["authorization"];

    if (!authHeader) {
      throw new UserFacingError(
        "UNAUTHENTICATED",
        "Missing Authorization header",
      );
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      throw new UserFacingError(
        "UNAUTHENTICATED",
        "Invalid Authorization header format. Expected: Bearer <token>",
      );
    }

    const token = match[1];
    return await validateToken(token);
  };
}

/**
 * Creates a context provider that requires a specific header to be present.
 *
 * @example
 * ```typescript
 * // Require header to exist
 * const callable = onCallGenkit(
 *   { contextProvider: requireHeader('X-Request-ID') },
 *   myFlow
 * );
 *
 * // Require header to have specific value
 * const callable = onCallGenkit(
 *   { contextProvider: requireHeader('X-API-Version', '2.0') },
 *   myFlow
 * );
 * ```
 */
export function requireHeader(
  headerName: string,
  expectedValue?: string,
): ContextProvider<ActionContext> {
  const lowerHeaderName = headerName.toLowerCase();

  return async (request: RequestData): Promise<ActionContext> => {
    const value = request.headers[lowerHeaderName];

    if (!value) {
      throw new UserFacingError(
        "UNAUTHENTICATED",
        `Missing required header: ${headerName}`,
      );
    }

    if (expectedValue !== undefined && value !== expectedValue) {
      throw new UserFacingError(
        "PERMISSION_DENIED",
        `Invalid value for header: ${headerName}`,
      );
    }

    return {};
  };
}

/**
 * Creates a context provider that always allows requests (no authentication).
 * Useful for public endpoints.
 *
 * @example
 * ```typescript
 * const callable = onCallGenkit(
 *   { contextProvider: allowAll() },
 *   myPublicFlow
 * );
 * ```
 */
export function allowAll(): ContextProvider<ActionContext> {
  return async (): Promise<ActionContext> => ({});
}

/**
 * Combines multiple context providers. All providers must succeed.
 * The returned context is a merge of all provider contexts.
 *
 * @example
 * ```typescript
 * const callable = onCallGenkit(
 *   {
 *     contextProvider: allOf(
 *       requireHeader('X-Request-ID'),
 *       requireApiKey('X-API-Key', process.env.API_KEY!)
 *     )
 *   },
 *   myFlow
 * );
 * ```
 */
export function allOf<C extends ActionContext = ActionContext>(
  ...providers: ContextProvider<ActionContext>[]
): ContextProvider<C> {
  return async (request: RequestData): Promise<C> => {
    let mergedContext: ActionContext = {};

    for (const provider of providers) {
      const context = await provider(request);
      mergedContext = { ...mergedContext, ...context };
    }

    return mergedContext as C;
  };
}

/**
 * Tries context providers in order, returning the first one that succeeds.
 * If all providers fail, throws the error from the last provider.
 *
 * @example
 * ```typescript
 * // Accept either API key or Bearer token
 * const callable = onCallGenkit(
 *   {
 *     contextProvider: anyOf(
 *       requireApiKey('X-API-Key', process.env.API_KEY!),
 *       requireBearerToken(async (token) => {
 *         const user = await verifyJWT(token);
 *         return { auth: { user } };
 *       })
 *     )
 *   },
 *   myFlow
 * );
 * ```
 */
export function anyOf<C extends ActionContext = ActionContext>(
  ...providers: ContextProvider<ActionContext>[]
): ContextProvider<C> {
  return async (request: RequestData): Promise<C> => {
    let lastError: Error | undefined;

    for (const provider of providers) {
      try {
        const context = await provider(request);
        return context as C;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError || new UserFacingError("UNAUTHENTICATED", "Unauthorized");
  };
}

export default onCallGenkit;
