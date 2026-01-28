

**`genkitx-azure-openai`** is a community plugin for using Azure OpenAI APIs with
[Genkit](https://github.com/firebase/genkit).
## Installation

Install the plugin in your project with your favorite package manager:

- `npm install genkitx-azure-openai`
- `yarn add genkitx-azure-openai`
- `pnpm add genkitx-azure-openai`

### Initialize

You'll also need to have an Azure OpenAI instance deployed. You can deploy a version on Azure Portal following [this guide](https://learn.microsoft.com/azure/ai-services/openai/how-to/create-resource?pivots=web-portal).

Once you have your instance running, make sure you have the endpoint and key. You can find them in the Azure Portal, under the "Keys and Endpoint" section of your instance.

You can then define the following environment variables to use the service:

```
AZURE_OPENAI_ENDPOINT=<YOUR_ENDPOINT>
AZURE_OPENAI_API_KEY=<YOUR_KEY>
OPENAI_API_VERSION=<YOUR_API_VERSION>
```

Alternatively, you can pass the values directly to the `azureOpenAI` constructor:

```typescript
import { azureOpenAI, gpt4o } from 'genkitx-azure-openai';
import { genkit } from 'genkit';
const apiVersion = '2024-10-21';

const ai = genkit({
  plugins: [
    azureOpenAI({
      apiKey: '<your_key>',
      endpoint: '<your_endpoint>',
      deployment: '<your_embedding_deployment_name',
      apiVersion,
    }),
    // other plugins
  ],
  model: gpt4o,
});
```

If you're using Azure Managed Identity, you can also pass the credentials directly to the constructor:

```typescript
import { azureOpenAI, gpt4o } from 'genkitx-azure-openai';
import { genkit } from 'genkit';
import {
  DefaultAzureCredential,
  getBearerTokenProvider,
} from '@azure/identity';
const apiVersion = '2024-10-21';

const credential = new DefaultAzureCredential();
const scope = 'https://cognitiveservices.azure.com/.default';
const azureADTokenProvider = getBearerTokenProvider(credential, scope);

const ai = genkit({
  plugins: [
    azureOpenAI({
      azureADTokenProvider,
      endpoint: '<your_endpoint>',
      deployment: '<your_embedding_deployment_name',
      apiVersion,
    }),
    // other plugins
  ],
  model: gpt4o,
});
```

### Basic examples

The simplest way to call the text generation model is by using the helper function `generate`:

```typescript
// Basic usage of an LLM
const response = await ai.generate({
  prompt: 'Tell me a joke.',
});

console.log(await response.text);
```

Using the same interface, you can prompt a multimodal model:

```typescript
const response = await ai.generate({
  model: gpt4o,
  prompt: [
    { text: 'What animal is in the photo?' },
    { media: { url: imageUrl } },
  ],
  config: {
    // control of the level of visual detail when processing image embeddings
    // Low detail level also decreases the token usage
    visualDetailLevel: 'low',
  },
});
console.log(await response.text);
```

For more detailed examples and the explanation of other functionalities, refer to the example in the [official Github repo of the plugin](examples/README.md) or in the [official Genkit documentation](https://genkit.dev/docs/get-started/).

## Contributing

Want to contribute to the project? That's awesome! Head over to our [Contribution Guidelines](CONTRIBUTING.md).

## Need support?

> [!NOTE]  
> This repository depends on Google's Genkit. For issues and questions related to Genkit, please refer to instructions available in [Genkit's repository](https://github.com/firebase/genkit).

Reach out by opening a discussion on [Github Discussions](https://github.com/genkit-ai/azure-foundry-js-plugin/discussions).

## License

This project is licensed under the [Apache 2.0 License](LICENSE).

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202%2E0-lightgrey.svg)](LICENSE)
