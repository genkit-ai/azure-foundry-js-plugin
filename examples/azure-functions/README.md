# Azure Functions + Genkit Example

This example demonstrates how to deploy Genkit flows as Azure Functions HTTP triggers, including support for **streaming responses** via Server-Sent Events (SSE).

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [Azure Functions Core Tools](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local) v4
- An Azure OpenAI resource with a deployed model

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables:**

   Copy and edit the local settings:

   ```bash
   cp local.settings.json.example local.settings.json
   ```

   Update `local.settings.json` with your Azure OpenAI credentials:

   ```json
   {
     "Values": {
       "AZURE_OPENAI_API_KEY": "<your-key>",
       "AZURE_OPENAI_ENDPOINT": "https://<your-resource>.openai.azure.com",
       "AZURE_OPENAI_DEPLOYMENT_ID": "<your-deployment>",
       "OPENAI_API_VERSION": "2024-12-01-preview",
       "API_KEY": "your-secret-api-key"
     }
   }
   ```

3. **Build and run locally:**

   ```bash
   npm start
   ```

   The functions will be available at `http://localhost:7071/api/`.

## Endpoints

### Joke Generator (Simple)

```bash
curl -X POST http://localhost:7071/api/jokeFlow \
  -H "Content-Type: application/json" \
  -d '{"data": {"subject": "programming"}}'
```

### Story Generator

```bash
curl -X POST http://localhost:7071/api/storyGeneratorFlow \
  -H "Content-Type: application/json" \
  -d '{"data": {"topic": "a robot learning to feel emotions", "style": "sci-fi", "length": "short"}}'
```

### Joke Streaming (SSE)

```bash
curl -X POST http://localhost:7071/api/jokeStreamingFlow \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"data": {"subject": "TypeScript"}}'
```

The streaming endpoint returns Server-Sent Events with incremental chunks:

```
data: {"message":"Why"}

data: {"message":" do"}

data: {"message":" TypeScript"}

...

data: {"result":{"joke":"...","type":"pun"}}
```

It is compatible with the `streamFlow` client from `genkit/beta/client`.

### Protected Summary (API Key Required)

```bash
curl -X POST http://localhost:7071/api/protectedSummaryFlow \
  -H "Content-Type: application/json" \
  -H "X-API-Key: demo-api-key" \
  -d '{"data": {"text": "Long text to summarize...", "maxLength": 50}}'
```

## Using with the Genkit Client

You can call these endpoints using the official Genkit client library:

```typescript
import { runFlow, streamFlow } from 'genkit/beta/client';

// Non-streaming call
const result = await runFlow({
  url: 'http://localhost:7071/api/jokeFlow',
  input: { subject: 'programming' },
});

// Streaming call
const stream = streamFlow({
  url: 'http://localhost:7071/api/jokeStreamingFlow',
  input: { subject: 'TypeScript' },
});

for await (const chunk of stream.stream) {
  console.log('Chunk:', chunk);
}

const finalResult = await stream.output;
```

## Deploying to Azure

1. **Create a resource group:**

   ```bash
   az group create --name <rg> --location <region>
   ```

2. **Create a storage account** (required by Azure Functions):

   ```bash
   az storage account create \
     --name <storage-account> \
     --resource-group <rg> \
     --location <region> \
     --sku Standard_LRS
   ```

3. **Create an Azure Function App** (Node.js 20+, v4 programming model):

   ```bash
   az functionapp create \
     --resource-group <rg> \
     --consumption-plan-location <region> \
     --runtime node \
     --runtime-version 20 \
     --functions-version 4 \
     --name <app-name> \
     --storage-account <storage-account>
   ```

4. **Set application settings:**

   ```bash
   az functionapp config appsettings set \
     --name <app-name> \
     --resource-group <rg> \
     --settings \
       AZURE_OPENAI_API_KEY="<your-key>" \
       AZURE_OPENAI_ENDPOINT="<your-endpoint>" \
       AZURE_OPENAI_DEPLOYMENT_ID="<your-deployment>" \
       OPENAI_API_VERSION="2024-12-01-preview" \
       API_KEY="<your-secret-api-key>"
   ```

5. **Deploy:**

   ```bash
   npm run deploy --name=<app-name>
   ```

### Removing the Azure Function App

To delete the deployed function app:

```bash
npm run remove --name=<app-name> --rg=<rg>
```

Or to also delete the entire resource group and all its resources:

```bash
az group delete --name <rg> --yes --no-wait
```

> **Note on Streaming:** Azure Functions supports HTTP streaming responses in the v4 programming model. For production streaming, ensure your Function App plan supports long-running requests (Consumption plan has a 5-minute timeout; Premium or Dedicated plans are recommended for streaming workloads).

## Architecture

```
onCallGenkit(options, flow)
  │
  ├─ Auto-registers Azure Functions HTTP trigger via app.http()
  │   using the flow name (e.g., "jokeFlow" → POST /api/jokeFlow)
  │
  ├─ Returns CallableAzureFunction with:
  │   ├─ handler    → Azure Functions HttpHandler
  │   ├─ flow       → The underlying Genkit flow
  │   ├─ run()      → Direct flow execution (for testing)
  │   ├─ stream()   → Direct flow streaming (for testing)
  │   └─ flowName   → Flow identifier
  │
  ├─ CORS handling (preflight + response headers)
  ├─ Genkit callable protocol (data wrapping)
  ├─ ContextProvider for auth (same as express/next.js integrations)
  └─ Streaming via ReadableStream + SSE format
```
