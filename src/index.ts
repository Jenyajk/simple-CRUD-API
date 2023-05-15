import * as http from 'http';
import * as dotenv from 'dotenv';
import {v4 as uuid4, validate} from "uuid";
import { IUser, IWorker } from "./interfaces";
import * as os from "os";

dotenv.config();

let currentWorkerPort: number = parseInt(process.env.PORT, 10);

const numCPUs = os.cpus().length;

const workers: { [port: string]: { port: number; host: string } } = {};
for (let i = 0; i < numCPUs; i++) {
    const port = parseInt(process.env.PORT, 10) + i;
    workers[port.toString()] = { host: 'localhost', port: port };
}

const users: IUser[] = [];

function jsonParse(body: string) {
    try {
        return JSON.parse(body);
    } catch (err) {
        return null;
    }
}

export default function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const { method } = req;

    if (method === 'GET' && req.url === '/api/users') {
        getUsers(req, res);
    } else if (method === 'GET' && req.url?.startsWith('/api/users/')) {
        const id = req.url.split('/')[3];
        if (!id || !validate(id)) {
            sendResponse(res, 400, { error: `Неверный идентификатор пользователя ${id}` });
            return;
        }
        getUser(id, res);
    } else if (method === 'PUT' && req.url?.startsWith('/api/users/')) {
        const id = req.url.split('/')[3];
        if (!id || !validate(id)) {
            sendResponse(res, 400, { error: 'Неверный идентификатор пользователя' });
            return;
        }
        editUser(id, req, res);
        return;
    } else if (method === 'DELETE' && req.url?.startsWith('/api/users/')) {
        const id = req.url.split('/')[3];
        if (!id || !validate(id)) {
            sendResponse(res, 400, { error: 'Неверный идентификатор пользователя' });
            return;
        }
        deleteUser(id, res);
        return;
    } else if (method === 'POST' && req.url === '/api/users') {
        addUser(req, res);
        return;
    } else {
        const { port } = getNextWorker();
        const url = `http://localhost:${port}${req.url}`;
        proxyRequest(url, req, res);
        return;
    }

    sendResponse(res, 404, { error: 'Endpoint not found' });
}


function getNextWorker(): IWorker {
    const worker = workers[currentWorkerPort];
    currentWorkerPort = currentWorkerPort === 4004 ? 4000 : currentWorkerPort + 1;
    return worker;
}
export  function sendResponse(
    res: http.ServerResponse,
    statusCode: number,
    data: any = null,
    contentType = 'application/json'
): void {
    if (res.headersSent) {
        return;
    }
    res.statusCode = statusCode;
    res.setHeader('Content-Type', contentType);
    if (data) {
        res.write(JSON.stringify(data));
    }
    res.end();
}

function proxyRequest(url: string, req: http.IncomingMessage, res: http.ServerResponse) {
    const { port } = getNextWorker();
    const options: http.RequestOptions = {
        method: req.method,
        headers: req.headers,
        host: 'localhost',
        port: port.toString(),
        path: req.url,
    };

    const workerReq = http.request(url, options, (workerRes) => {
        const chunks: Buffer[] = [];

        workerRes.on('data', (chunk) => {
            chunks.push(chunk);
        });

        workerRes.on('end', () => {
            const data = Buffer.concat(chunks);
            sendResponse(res, workerRes.statusCode || 500, data, workerRes.headers['content-type']);
        });
    });

    workerReq.on('error', (error) => {
        sendResponse(res, 500, { error: 'Internal server error' });
    });

    req.pipe(workerReq);
}

 function getUsers(req: http.IncomingMessage, res: http.ServerResponse) {
    sendResponse(res, 200, users);
}

 function getUser(id: string, res: http.ServerResponse) {
    if (!id || !validate(id)) {
        return sendResponse(res, 400, { error: `Invalid user id ${id}` });
    }

    const user = users.find((username) => username.id === id);
    if (!user) {
        return sendResponse(res, 404, { error: 'User not found' });
    }
    sendResponse(res, 200, user);
}
function addUser(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';
    req.on('data', (chunk) => {
        body += chunk.toString();
    });

    req.on('end', () => {
        const data = jsonParse(body);
        if (!data || !data.username || !data.age) {
            return sendResponse(res, 400, { error: 'Missing required fields' });
        }

        const newUser = {
            id: uuid4(),
            username: data.username,
            age: data.age,
            hobbies: data.hobbies || [],
        };
        users.push(newUser);

        sendResponse(res, 201, newUser);
    });
}

 function editUser(id: string, req: http.IncomingMessage, res: http.ServerResponse) {
    if (!id || !validate(id)) {
        return sendResponse(res, 400, { error: 'Invalid user id' });
    }
    const user = users.find((username) => username.id === id);
    if (!user) {
        return sendResponse(res, 404, { error: 'User not found' });
    }

    let body = '';
    req.on('data', (chunk) => {
        body += chunk.toString();
    });

    req.on('end', () => {
        const data = jsonParse(body);
        if (!data || (!data.username && !data.age && !data.hobbies)) {
            return sendResponse(res, 400, { error: 'Missing required fields' });
        }

        if (data.username) {
            user.username = data.username;
        }
        if (data.age) {
            user.age = data.age;
        }
        if (data.hobbies) {
            user.hobbies = data.hobbies;
        }

        sendResponse(res, 200, user);
    });
}

 function deleteUser(id: string, res: http.ServerResponse) {
    if (!id || !validate(id)) {
        return sendResponse(res, 400, { error: 'Invalid user id' });
    }

    const index = users.findIndex((username) => username.id === id);
    if (index === -1) {
        return sendResponse(res, 404, { error: 'User not found' });
    }

    const deletedUser = users.splice(index, 1)[0];
    sendResponse(res, 200, deletedUser);
}

Object.values(workers).forEach((worker: IWorker) => {
    const server = http.createServer(handleRequest);

    server.listen(worker.port, () => {
        console.log(`Server running on port ${worker.port}`);
    });
});



