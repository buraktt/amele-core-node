# amele-core-typescript

Amele core communication library for JavaScript/TypeScript functions.

## Description

This library enables communication between JavaScript/TypeScript functions using TCP or shared memory protocols. It uses MessagePack for efficient data serialization.

## Installation

```bash
npm install amele-core-typescript
```

## Usage

### Environment Variables

- `COMMUNICATION_PROTOCOL`: Set to `'tcp'` for TCP communication.
- `AMELE_TCP_PORT`: TCP port for communication (default: 0).

### API

#### `callFunction(functionName: string, inputs: any): Promise<any>`

Calls a remote function with the given name and inputs.

#### `context(): Promise<any>`

Retrieves the stored context.

#### `accept(): Promise<any>`

Accepts incoming connections and data.

### Example

```typescript
import { callFunction, accept } from 'amele-core-typescript';

// Call a remote function
const result = await callFunction('myFunction', { param: 'value' });
console.log(result);

// Accept incoming data
const data = await accept();
```

## Development

This project supports both Node.js and Deno environments.

- `index.ts`: Node.js version
- `index.deno.ts`: Deno version

## Dependencies

- `@msgpack/msgpack`: For MessagePack encoding/decoding

## License

MIT
