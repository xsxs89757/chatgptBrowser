#!/usr/bin/env node
import fastify from 'fastify';
import { ChatGPTUnofficialProxyAPI } from 'chatgpt';
import fs from 'fs';
import { pathToFileURL } from 'url'
import request from "superagent";

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

const base =  `chatgpt{id}@chatgptbatch.uu.me`;
const accountsMapArr = settings.index.split('-');

for(let i = parseInt(accountsMapArr[0]);i<= parseInt(accountsMapArr[1]);i++) {
    settings.accounts.push({
        email: base.replace('{id}', i),
        password: 'qazwsx123!@#'
    })
}

let _accessToken = null,_replyAccessToken = 0

const getAccessToken = async() => {
    const index = Math.floor((Math.random()* settings.accounts.length))
    const result = await request.post('http://43.153.18.225:5000')
                    .send({u: settings.accounts[index].email,p: settings.accounts[index].password})
    if(result.body.code === 0){
        _accessToken = result.body.access_token
    }else{
        _accessToken = null
    }
}

const replyAccessToken = async() => {
    if(_replyAccessToken <= 3 ){
        _replyAccessToken++
        await getAccessToken()
    }
}

await getAccessToken()
setInterval( async()=>{
    await getAccessToken()
}, 4 * 60 * 60 * 1000)


const server = fastify();

server.post('/chatgpt', async (request, reply) => {
    const subject = request.body.subject
    if(!subject){
        return reply.send({ code: 1, msg: 'subject error' })
    }
    if(_accessToken === null){
        return res.json({ code: 1, msg: 'accessToken error' })
    }
    const conversationId = request.body.conversation_id ? request.body.conversation_id.toString() : undefined;

    const proxyUrl = [
        'https://chat.duti.tech/api/conversation',
        'https://gpt.pawan.krd/backend-api/conversation'
    ]
    const index = Math.floor((Math.random()*proxyUrl.length))

    let result;
    let error;
    try{
        const parentMessageId = request.body.parent_message_id ? request.body.parent_message_id.toString() : undefined;
        const api = new ChatGPTUnofficialProxyAPI({
            accessToken: _accessToken,
            apiReverseProxyUrl: proxyUrl[index]
        })
        result = await api.sendMessage(subject, {
            conversationId,
            parentMessageId,
            timeoutMs: 3 * 60 * 1000, 
        });

    } catch (e) {
        error = e;
    }

    if (result !== undefined) {
        reply.send({
            content : result.text,
            conversation_id: result.conversationId,
            parent_message_id : result.parentMessageId,
            server: index
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