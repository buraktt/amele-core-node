import * as fs from 'node:fs';
import * as net from 'node:net';
import { encode, decode, Decoder } from 'npm:@msgpack/msgpack';

let client: net.Socket | null = null;
let pendingCalls = new Map<string, { resolve: (value: any) => void, reject: (reason?: any) => void }>();
let decoder: Decoder | null = null;
let storedContext: any = null;

export async function callFunction(functionName: string, inputs: any): Promise<any> {
    if (process.env.COMMUNICATION_PROTOCOL === 'tcp') {
        return new Promise((resolve, reject) => {
            if (!client) {
                reject(new Error("Socket not initialized"));
                return;
            }
            const id = Math.random().toString(36).substring(7);
            pendingCalls.set(id, { resolve, reject });
            client.write(Buffer.from(encode({
                type: 'call',
                function: functionName,
                inputs: inputs,
                id: id
            })));
        });
    }
    throw new Error("callFunction is not supported in shmem mode");
}

export async function context(): Promise<any> {
    return storedContext;
}

export async function accept(): Promise<any> {
    let envelope: any = {};
    if (process.env.COMMUNICATION_PROTOCOL === 'tcp') {
        envelope = await new Promise((resolve, reject) => {
            const port = parseInt(process.env.AMELE_TCP_PORT || '0');
            client = new net.Socket();
            decoder = new Decoder();
            client.connect(port, '127.0.0.1', () => {
                // Connected, wait for inputs
            });

            let inputsReceived = false;
            let buffer = Buffer.alloc(0);

            client.on('data', (chunk: Buffer) => {
                buffer = Buffer.concat([buffer, chunk]);
                
                try {
                    // Try to decode all complete messages from the buffer
                    while (buffer.length > 0) {
                        const msg = decode(buffer) as any;
                        // If we successfully decoded, we need to figure out how many bytes were consumed
                        // Re-encode to get the byte length (msgpack is self-describing)
                        const consumed = encode(msg).length;
                        buffer = buffer.subarray(consumed);
                        
                        if (!inputsReceived) {
                            inputsReceived = true;
                            resolve(msg);
                        } else if (msg.type === 'call_result') {
                            const p = pendingCalls.get(msg.id);
                            if (p) {
                                pendingCalls.delete(msg.id);
                                if (msg.error) p.reject(new Error(msg.error));
                                else p.resolve(msg.result);
                            }
                        }
                    }
                } catch (e) {
                    // Not enough data yet, wait for more
                }
            });

            client.on('error', reject);
        });
    } else {
        // For shmem mode, read from inbox file
        const inboxFile = process.env.AMELE_INBOX_FILE;
        if (inboxFile) {
            const inputData = fs.readFileSync(inboxFile);
            if (inputData.length > 0) {
                envelope = decode(inputData) as any;
            }
        }
    }

    // Extract context and inputs from envelope
    storedContext = envelope.context || {};
    const inputs = envelope.inputs || {};

    return inputs;
}

export async function respond(context: any): Promise<void> {
    if (process.env.COMMUNICATION_PROTOCOL === 'tcp') {
        return new Promise((resolve, reject) => {
            if (!client) {
                reject(new Error("Socket not initialized"));
                return;
            }
            client.write(Buffer.from(encode({
                type: 'respond',
                context: context
            })), () => {
                client?.end();
                client?.destroy();
                resolve();
            });
        });
    }

    const shmemFile = process.env.AMELE_OUTBOX_FILE;
    if (!shmemFile) {
        throw new Error("AMELE_OUTBOX_FILE environment variable not set");
    }
    fs.writeFileSync(shmemFile, Buffer.from(encode(context)));
}
