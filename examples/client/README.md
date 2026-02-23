# Genkit Client — Azure Functions Example

A standalone Node.js client that demonstrates how to call Genkit flows deployed as Azure Functions using the official `genkit/beta/client` library.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- The [Azure Functions example](../azure-functions/README.md) running locally or deployed to Azure

## Setup

```bash
npm install
```

## Usage

Start the Azure Functions example locally first:

```bash
cd ../azure-functions
npm start
```

Then, in a separate terminal, run the client:

```bash
# Call the joke flow (default)
npm run dev

# Call a specific flow
npm run dev -- joke
npm run dev -- story
npm run dev -- protected
npm run dev -- stream

# Call all flows
npm run dev -- all
```

## Targeting a Deployed Azure Function App

Set the `AZURE_FUNCTIONS_BASE_URL` environment variable to point at your deployed function app:

```bash
AZURE_FUNCTIONS_BASE_URL=https://<app-name>.azurewebsites.net/api npm run dev -- all
```

### Protected Flow

The `protected` example calls a flow that requires an API key header. Pass `API_KEY` to match the value configured on the server:

```bash
API_KEY=my-secret-key npm run dev -- protected
```

### Streaming

The `stream` example uses `streamFlow` from `genkit/beta/client`. It connects to `/api/jokeStreamingFlow` with `Accept: text/event-stream` and prints chunks as they arrive.

```bash
npm run dev -- stream
```

## Available Examples

| Command | Flow | Description |
|---------|------|-------------|
| `joke` | `jokeFlow` | Simple joke generator |
| `story` | `storyGeneratorFlow` | Creative story with topic, style, length |
| `protected` | `protectedSummaryFlow` | Summarisation with API key auth |
| `stream` | `jokeStreamingFlow` | Streaming joke via SSE |
| `all` | — | Runs all of the above in sequence |

## How It Works

The client uses two functions from `genkit/beta/client`:

- **`runFlow({ url, input, headers? })`** — sends a POST, waits for the full JSON response
- **`streamFlow({ url, input })`** — sends a POST with `Accept: text/event-stream`, returns an async iterable `stream` and a `output` promise

These are framework-agnostic and work with any Genkit flow endpoint (Firebase, Express, AWS Lambda, Azure Functions, etc.).
