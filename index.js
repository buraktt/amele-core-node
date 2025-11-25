import * as fs from 'node:fs';
import * as net from 'node:net';
const { encode, decode, Decoder } = await (typeof Deno !== 'undefined' ? import('npm:@msgpack/msgpack') : import('@msgpack/msgpack'));

let client = null;
let pendingCalls = new Map();
let decoder = null;
let storedContext = null;

export async function callFunction(functionName, inputs) {
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

export async function context() {
    return storedContext;
}

export async function accept() {
    let envelope = {};
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

            client.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                
                try {
                    // Try to decode all complete messages from the buffer
                    while (buffer.length > 0) {
                        const msg = decode(buffer);
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
                envelope = decode(inputData);
            }
        }
    }

    // Extract context and inputs from envelope
    storedContext = envelope.context || {};
    const inputs = envelope.inputs || {};

    return inputs;
}

export async function respond(context) {
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
