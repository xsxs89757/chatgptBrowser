#!/usr/bin/env node
import fastify from 'fastify';
import { ChatGPTAPIBrowser } from 'chatgpt';
import fs from 'fs';
import { pathToFileURL } from 'url'

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

const accounts = [];
const conversationsMap = {};
const base =  `chatgpt{id}@chatgptbatch.uu.me`;
const accountsMapArr = settings.index.split('-');

for(let i = accountsMapArr[0];i<= accountsMapArr[1];i++) {
    settings.accounts.push({
        email: base.replace('{id}', i),
        password: 'qazwsx123!@#'
    })
}

for (let i = 0; i < settings.accounts.length; i++) {
    const account = settings.accounts[i];
    const api = new ChatGPTAPIBrowser({
        ...account,
        nopechaKey: account.nopechaKey || settings.nopechaKey || undefined,
        captchaToken: account.twoCaptchaKey || settings.twoCaptchaKey || undefined,
        // For backwards compatibility
        proxyServer: account.proxyServer || account.proxy || undefined,
    });

    await api.initSession().then(() => {
        console.log(`Session initialized for account ${i}.`);
        accounts.push(api);
    });

    // call `api.refreshSession()` every hour to refresh the session
    setInterval(() => {
        api.refreshSession().then(() => {
            console.log(`Session refreshed for account ${i}.`);
        });
    }, 30 * 60 * 1000);

    // call `api.resetSession()` every 24 hours to reset the session
    setInterval(() => {
        api.resetSession().then(() => {
            console.log(`Session reset for account ${i}.`);
        });
    }, 24 * 60 * 60 * 1000);
}

let currentAccountIndex = 0;

const server = fastify();

server.post('/chatgpt', async (request, reply) => {
    if (accounts.length === 0) {
        reply.send({ code: 1, msg: 'No sessions available.' });
        return;
    }

    const conversationId = request.body.conversation_id ? request.body.conversation_id.toString() : undefined;

    // Conversation IDs are tied to accounts, so we need to make sure that the same account is used for the same conversation.
    if (conversationId && conversationsMap[conversationId]) {
        // If the conversation ID is already in the map, use the account that was used for that conversation.
        currentAccountIndex = conversationsMap[conversationId];
    } else {
        // If the conversation ID is not in the map, use the next account.
        currentAccountIndex = (currentAccountIndex + 1) % accounts.length;
    }

    let result;
    let error;
    try {
        const parentMessageId = request.body.parent_message_id ? request.body.parent_message_id.toString() : undefined;
        result = await accounts[currentAccountIndex].sendMessage(request.body.message, {
            conversationId,
            parentMessageId,
        });
        // ChatGPT ends its response with a newline character, so we need to remove it.
        result.response = result.response.trim();
        if (conversationId) {
            // Save the account index for this conversation.
            conversationsMap[conversationId] = currentAccountIndex;
        }
    } catch (e) {
        error = e;
    }

    if (result !== undefined) {
        reply.send({
            content : result.response,
            conversation_id: result.conversationId,
            parent_message_id : result.messageId,
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