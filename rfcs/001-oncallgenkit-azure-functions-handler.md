# RFC 001: onCallGenkit - Azure Functions Handler for Genkit Flows

| Status | Accepted |
|--------|----------|
| **RFC #** | 001 |
| **Author** | Xavier Portilla Edo |
| **Created** | 2026-02-17 |
| **Updated** | 2026-02-17 |

## Summary

This RFC proposes the addition of an `onCallGenkit` function to the `genkitx-azure-openai` plugin that simplifies deploying Genkit flows as Azure Functions HTTP triggers. This feature mirrors the functionality provided by Firebase Functions' `onCallGenkit` helper and the AWS Lambda `onCallGenkit` handler in `genkitx-aws-bedrock`, bringing the same developer experience to the Azure ecosystem.

## Motivation

### Problem Statement

Currently, deploying a Genkit flow as an Azure Function requires significant boilerplate code:

1. Importing and configuring `app.http()` from `@azure/functions`
2. Parsing request bodies from `HttpRequest`
3. Managing CORS headers for cross-origin requests
4. Implementing authentication and authorization logic
5. Formatting responses consistently
6. Handling errors gracefully
7. Wiring up streaming via `ReadableStream` for SSE responses

This leads to repetitive code across projects and inconsistent implementations.

### Goals

1. **Simplify Deployment**: Reduce the code required to deploy a Genkit flow as an Azure Function to a single function call
2. **Auto-Registration**: Automatically register the HTTP trigger with `app.http()` using the flow's name — no manual wiring
3. **Consistency with Firebase & AWS**: Provide a familiar API for developers coming from Firebase Functions or the AWS Lambda integration
4. **Built-in Best Practices**: Include CORS handling, error management, streaming, and authentication out of the box
5. **Type Safety**: Maintain full TypeScript support with proper type inference
6. **Flexibility**: Allow customization of behavior through options while providing sensible defaults

### Non-Goals

1. This RFC does not aim to provide a complete deployment framework (like Azure Developer CLI or Bicep templates)
2. This RFC does not aim to handle Azure-specific features like Durable Functions, Queue triggers, or Blob triggers
3. This RFC does not aim to replace the need for infrastructure-as-code tools

## Design

### API Overview

The `onCallGenkit` function accepts a Genkit flow (and optionally configuration options), auto-registers it as an Azure Functions HTTP trigger using `app.http()`, and returns a `CallableAzureFunction` object.

The function name for the HTTP trigger is derived from the flow's name (`flow.__action.name`), eliminating redundancy:

```typescript
// Simple usage — registers as POST /api/myFlow
export const myFlowFn = onCallGenkit(myFlow);

// With options — still uses flow name for registration
export const myFlowFn = onCallGenkit(
  {
    cors: { origin: 'https://myapp.com' },
    contextProvider: requireApiKey('X-API-Key', 'secret'),
  },
  myFlow
);

// With streaming
export const myStreamFn = onCallGenkit(
  { streaming: true },
  myStreamingFlow
);
```

### Type Definitions

#### Using Genkit's Flow Type

The implementation imports and uses Genkit's real `Flow` type directly, ensuring full compatibility:

```typescript
import type { Flow, z } from "genkit";

type FlowInput<F extends Flow> =
  F extends Flow<infer I, z.ZodTypeAny, z.ZodTypeAny> ? z.infer<I> : never;

type FlowOutput<F extends Flow> =
  F extends Flow<z.ZodTypeAny, infer O, z.ZodTypeAny> ? z.infer<O> : never;

type FlowStream<F extends Flow> =
  F extends Flow<z.ZodTypeAny, z.ZodTypeAny, infer S> ? z.infer<S> : never;
```

#### AzureFunctionsOptions Interface

The options interface uses Genkit's `ContextProvider` type, aligning with Express, Next.js, AWS Lambda, and other Genkit integrations:

```typescript
import type { ContextProvider, RequestData, ActionContext } from 'genkit/context';

interface AzureFunctionsOptions<C extends ActionContext = ActionContext, T = unknown> {
  authLevel?: 'anonymous' | 'function' | 'admin';
  httpMethods?: string[];
  route?: string;
  cors?: CorsOptions | boolean;
  contextProvider?: ContextProvider<C, T>;
  streaming?: boolean;
  onError?: (error: Error) => { statusCode: number; message: string } | Promise<{ statusCode: number; message: string }>;
  debug?: boolean;
}
```

Key differences from the AWS Lambda version:
- **No `name` option** — the flow name is used directly for `app.http()` registration
- **`authLevel`** — Azure Functions-specific authorization level (`anonymous`, `function`, `admin`)
- **`httpMethods`** — controls which HTTP methods are registered (default: `['POST', 'OPTIONS']`)
- **`route`** — optional custom route override

#### ContextProvider Pattern

The `contextProvider` option follows the same pattern used in all other Genkit HTTP adapters:

```typescript
interface RequestData<T = any> {
  method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'OPTIONS' | 'QUERY';
  headers: Record<string, string>;
  input: T;
}

type ContextProvider<C extends ActionContext, T> =
  (request: RequestData<T>) => C | Promise<C>;
```

#### CorsOptions Interface

```typescript
interface CorsOptions {
  origin?: string | string[];
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}
```

#### Response Types (Callable Protocol)

Responses follow the Genkit callable protocol:

```typescript
interface FlowResponse<T> {
  result: T;
}

interface FlowErrorResponse {
  error: {
    status: string;
    message: string;
    details?: unknown;
  };
}
```

### Core Functionality

#### 1. Auto-Registration with `app.http()`

Unlike the AWS Lambda version where handlers are exported directly, Azure Functions v4 uses a programmatic registration model. `onCallGenkit` calls `app.http()` internally:

```typescript
import { app } from "@azure/functions";

// Inside onCallGenkit:
app.http(flowName, {
  methods,
  authLevel,
  ...(opts.route ? { route: opts.route } : {}),
  handler,
});
```

This mirrors how `defineFlow` works in other Genkit integrations — the developer defines the flow once and the framework handles registration.

#### 2. Request Parsing

The handler automatically parses the Azure Functions `HttpRequest`:

```typescript
async function parseRequestBody<T>(request: HttpRequest): Promise<T> {
  const bodyText = await request.text();
  const parsed = JSON.parse(bodyText);
  // Support callable protocol: { data: <input> }
  if (parsed && typeof parsed === "object" && "data" in parsed) {
    return parsed.data as T;
  }
  return parsed as T;
}
```

This supports both the Genkit callable protocol format (`{ "data": { ... } }`) and direct input.

#### 3. CORS Handling

CORS headers are automatically added based on configuration:

- Default: Allow all origins (`*`)
- Support for single origin, multiple origins, or wildcard
- Automatic handling of preflight OPTIONS requests
- Configurable methods, headers, credentials, and max-age

#### 4. Streaming via ReadableStream + SSE

When `streaming: true` is set, the handler checks the `Accept` header:

- **`Accept: text/event-stream`** → Returns a `ReadableStream` body with SSE events:
  ```
  data: {"message": <chunk>}\n\n
  ...
  data: {"result": <finalOutput>}\n\n
  ```
- **Otherwise** → Falls back to a buffered JSON response

This is compatible with `streamFlow` from `genkit/beta/client`.

The key difference from the AWS Lambda implementation:
- **Lambda**: Uses `awslambda.streamifyResponse()` + `awslambda.HttpResponseStream`
- **Azure Functions**: Uses native `ReadableStream` in the `HttpResponseInit.body` field

```typescript
const readableStream = new ReadableStream({
  async start(controller) {
    const { stream, output } = flow.stream(input, { context: actionContext });

    for await (const chunk of stream) {
      const sseData = `data: ${JSON.stringify({ message: chunk })}\n\n`;
      controller.enqueue(encoder.encode(sseData));
    }

    const result = await output;
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ result })}\n\n`));
    controller.close();
  },
});

return {
  status: 200,
  headers: { "Content-Type": "text/event-stream", ... },
  body: readableStream,
};
```

#### 5. ContextProvider Helpers

The plugin provides the same composable context provider helpers as the AWS Lambda version:

| Helper | Description |
|--------|-------------|
| `allowAll()` | Returns empty context (public endpoints) |
| `requireHeader(name, value?)` | Requires a header, throws `UserFacingError` if missing |
| `requireApiKey(header, keyOrValidator)` | Requires API key, returns `ApiKeyContext` |
| `requireBearerToken(validator)` | Requires Bearer token, validator returns context |
| `allOf(...providers)` | Combines providers, merges returned contexts |
| `anyOf(...providers)` | Tries providers in order, returns first success |

#### 6. Azure Functions Context Injection

Azure Functions request and invocation context information is automatically injected:

```typescript
const azureFunctionsContext: AzureFunctionsActionContext = {
  azureFunctions: {
    request: {
      url: request.url,
      headers: normalizeHeaders(request),
      query: getQueryParams(request),
      params: request.params,
    },
    context: {
      functionName: azureContext.functionName,
      invocationId: azureContext.invocationId,
    },
  },
};
```

#### 7. Error Handling

Errors are handled using Genkit's `getCallableJSON` and `getHttpStatus` utilities from `genkit/context`:

- `UserFacingError` instances are converted to proper HTTP status codes
- Error responses follow the callable protocol format
- Custom error handler support via `onError` option
- All errors produce consistent, client-friendly error objects

#### 8. Testing Support

The returned object includes properties for direct testing:

```typescript
interface CallableAzureFunction<F extends Flow> {
  handler: HttpHandler;         // The Azure Functions handler
  flow: F;                      // The underlying flow
  run: (input, options?) => Promise<output>;   // Direct execution
  stream: (input, options?) => { stream, output };  // Streaming execution
  flowName: string;             // Flow name
}
```

## Implementation

### File Structure

```
src/
├── azure_functions.ts  # Main implementation
├── index.ts            # Re-exports
└── ...

docs/
└── rfcs/
    └── 001-oncallgenkit-azure-functions-handler.md

examples/
└── azure-functions/
    ├── src/
    │   └── index.ts    # Example handlers
    ├── host.json       # Azure Functions host config
    ├── local.settings.json
    ├── package.json
    └── README.md
```

### Dependencies

- `@azure/functions` (optional peer dependency) — Azure Functions SDK v4

No additional runtime dependencies are added. The `@azure/functions` import is used at the module level, so it's only required when `onCallGenkit` is actually used.

### Exports

The following are exported from the main package:

```typescript
// Functions
export { onCallGenkit, allowAll, requireHeader, requireBearerToken, requireApiKey, allOf, anyOf };

// Types
export type {
  AzureFunctionsOptions,
  CorsOptions,
  FlowResponse,
  FlowErrorResponse,
  AzureFunctionsFlowResponse,
  AzureFunctionsHandler,
  CallableAzureFunction,
  AzureFunctionsActionContext,
  FlowRunOptions,
  ContextProvider,
  RequestData,
  ActionContext,
  ApiKeyContext,
  BearerTokenContext,
};
```

## Usage Examples

### Basic Azure Function

```typescript
import { genkit, z } from 'genkit';
import { azureOpenAI, gpt4o, onCallGenkit } from 'genkitx-azure-openai';

const ai = genkit({
  plugins: [azureOpenAI()],
  model: gpt4o,
});

const jokeFlow = ai.defineFlow(
  {
    name: 'jokeFlow',
    inputSchema: z.object({ subject: z.string() }),
    outputSchema: z.object({ joke: z.string() }),
  },
  async (input) => {
    const { text } = await ai.generate({
      prompt: `Tell me a joke about ${input.subject}`,
    });
    return { joke: text };
  }
);

// Automatically registered as POST /api/jokeFlow
export const jokeHandler = onCallGenkit(jokeFlow);
```

### Streaming Flow

```typescript
const jokeStreamingFlow = ai.defineFlow(
  {
    name: 'jokeStreamingFlow',
    inputSchema: z.object({ subject: z.string() }),
    outputSchema: z.object({ joke: z.string() }),
    streamSchema: z.string(),
  },
  async (input, sendChunk) => {
    const { stream, response } = await ai.generateStream({
      prompt: `Tell me a joke about ${input.subject}`,
    });

    for await (const chunk of stream) {
      sendChunk(chunk.text);
    }

    const result = await response;
    return { joke: result.text };
  }
);

// Registered as POST /api/jokeStreamingFlow with SSE streaming
export const jokeStreamHandler = onCallGenkit(
  { streaming: true },
  jokeStreamingFlow
);
```

### Protected Endpoint with ContextProvider

```typescript
import { UserFacingError } from 'genkit';
import { onCallGenkit, requireBearerToken } from 'genkitx-azure-openai';

export const protectedHandler = onCallGenkit(
  {
    contextProvider: requireBearerToken(async (token) => {
      const user = await verifyJWT(token);
      if (!user) {
        throw new UserFacingError('PERMISSION_DENIED', 'Invalid token');
      }
      return { auth: { user } };
    }),
    cors: {
      origin: ['https://app.example.com'],
      credentials: true,
    },
  },
  protectedFlow
);
```

### Accessing Context in Flow

```typescript
import type { AzureFunctionsActionContext } from 'genkitx-azure-openai';

interface MyContext extends AzureFunctionsActionContext {
  auth: { user: { id: string; name: string } };
}

const contextAwareFlow = ai.defineFlow(
  {
    name: 'contextAwareFlow',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (input, { context }) => {
    const user = (context as MyContext).auth?.user;
    const invocationId = (context as MyContext).azureFunctions?.context?.invocationId;
    console.log(`User: ${user?.name}, Invocation: ${invocationId}`);
    // ... flow logic
  }
);
```

## Deployment

### With Azure Functions Core Tools

```bash
# Build
npm run build

# Run locally
func start

# Deploy to Azure
func azure functionapp publish <app-name>
```

### With Azure CLI

```bash
# Create resource group
az group create --name <rg> --location <region>

# Create storage account
az storage account create --name <storage> --resource-group <rg> --location <region>

# Create function app
az functionapp create \
  --resource-group <rg> \
  --consumption-plan-location <region> \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --name <app-name> \
  --storage-account <storage>

# Configure settings
az functionapp config appsettings set \
  --name <app-name> \
  --resource-group <rg> \
  --settings \
    AZURE_OPENAI_API_KEY=<key> \
    AZURE_OPENAI_ENDPOINT=<endpoint> \
    AZURE_OPENAI_DEPLOYMENT_ID=<deployment>

# Deploy
func azure functionapp publish <app-name>
```

## Comparison with AWS Lambda Implementation

| Aspect | AWS Lambda (`genkitx-aws-bedrock`) | Azure Functions (`genkitx-azure-openai`) |
|--------|-----------------------------------|------------------------------------------|
| Request type | `APIGatewayProxyEvent` | `HttpRequest` |
| Response type | `APIGatewayProxyResult` | `HttpResponseInit` |
| Context type | `LambdaContext` | `InvocationContext` |
| Registration | Export handler directly | Auto-register via `app.http()` |
| Name source | `flow.__action.name` | `flow.__action.name` |
| Streaming mechanism | `awslambda.streamifyResponse()` | Native `ReadableStream` body |
| Peer dependency | `aws-lambda` (types) | `@azure/functions` |
| Streaming prerequisite | Lambda Function URL + RESPONSE_STREAM | Azure Functions v4 + Premium/Dedicated plan |

## References

- [Firebase Functions onCallGenkit](https://github.com/firebase/firebase-functions/blob/master/src/v2/providers/https.ts)
- [AWS Lambda onCallGenkit RFC](https://github.com/genkit-ai/aws-bedrock-js-plugin/blob/main/rfcs/rfcs/001-oncallgenkit-lambda-handler.md)
- [Azure Functions v4 Programming Model](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=javascript%2Cwindows%2Cazure-cli&pivots=nodejs-model-v4)
- [Azure Functions HTTP Streaming](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=javascript%2Cwindows%2Cazure-cli&pivots=nodejs-model-v4#http-streams)
- [Genkit Deployment Guide](https://genkit.dev/docs/deployment/)
