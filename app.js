#!/usr/bin/env node
import fastify from 'fastify';
import { ChatGPTAPI } from 'chatgpt';
import fs from 'fs';
import { pathToFileURL } from 'url'
import ExpiryMap from 'expiry-map'

const arg = process.argv.find((arg) => arg.startsWith('--settings'));
let path;
if (arg) {
    path = arg.split('=')[1];
} else {
    path = './settings.js';
}

let settings;
if (fs.existsSync(path)) {
    // get the full path
    const fullPath = fs.realpathSync(path);
    settings = (await import(pathToFileURL(fullPath).toString())).default;
} else {
    if (arg) {
        console.error(`Error: the file specified by the --settings parameter does not exist.`);
    } else {
        console.error(`Error: the settings.js file does not exist.`);
    }
    process.exit(1);
}

const map = new ExpiryMap(3 * 60 * 1000)
const api = new ChatGPTAPI({
    apiKey: settings.openai_api_key,
    messageStore: map
});

const server = fastify();

server.post('/chatgpt', async (request, reply) => {
    const subject = request.body.subject
    if(!subject){
        return reply.send({ code: 1, msg: 'subject error' })
    }

    let result;
    let error;
    try{
        const parentMessageId = request.body.parent_message_id ? request.body.parent_message_id.toString() : undefined;
        
        result = await api.sendMessage(subject, {
            parentMessageId,
            timeoutMs: 3 * 60 * 1000, 
        });
    } catch (e) {
        error = e;
    }
    if (result !== undefined) {
        reply.send({
            content : result.text,
            parent_message_id : result.id
        });
    } else {
        console.error(error);
        reply.send({ code: 1, msg: 'There was an error communicating with ChatGPT.' });
    }
});

server.listen({ port: settings.port || 3000, host: '0.0.0.0' }, (error) => {
    console.log(`服务器运行在http://0.0.0.0:${settings.port}`)
    if (error) {
        console.error(error);
        process.exit(1);
    }
});