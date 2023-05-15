import * as http from 'http';
import * as dotenv from 'dotenv';
import {v4 as uuid4, validate} from "uuid";
import { IUser, IWorker } from "./interfaces";
import * as os from "os";
dotenv.config();




export default function processRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const { method } = req;

    if (method === 'GET' && req.url === '/api/users') {
        getUsers(req, res);
    } else if (method === 'GET' && req.url?.startsWith('/api/users/')) {
        const id = req.url.split('/')[3];
        if (!id || !validate(id)) {
            sendRepl(res, 400, { error: `Invalid user id ${id}` });
            return;
        }
        getUser(id, res);
    } else if (method === 'PUT' && req.url?.startsWith('/api/users/')) {
        const id = req.url.split('/')[3];
        if (!id || !validate(id)) {
            sendRepl(res, 400, { error: 'Invalid user id' });
            return;
        }
        editUser(id, req, res);
        return;
    } else if (method === 'DELETE' && req.url?.startsWith('/api/users/')) {
        const id = req.url.split('/')[3];
        if (!id || !validate(id)) {
            sendRepl(res, 400, { error: 'Invalid user id' });
            return;
        }
        deleteUser(id, res);
        return;
    } else if (method === 'POST' && req.url === '/api/users') {
        addUser(req, res);
        return;
    } else {
        const { port } = selectWorker();
        const url = `http://localhost:${port}${req.url}`;
        proxyRequest(url, req, res);
        return;
    }

    sendRepl(res, 404, { error: 'Endpoint not found' });
}
let currentWorkerPort: number = parseInt(process.env.PORT, 10);

const core = os.cpus().length;

const workers: { [port: string]: { port: number; host: string } } = {};
for (let i = 0; i < core; i++) {
    const port = parseInt(process.env.PORT, 10) + i;
    workers[port.toString()] = { host: 'localhost', port: port };
}

function selectWorker(): IWorker {
    const worker = workers[currentWorkerPort];
    currentWorkerPort = currentWorkerPort === 4004 ? 4000 : currentWorkerPort + 1;
    return worker;
}
export  function sendRepl(
    res: http.ServerResponse,
    code: number,
    data: any = null,
    contentType = 'application/json'
): void {
    if (res.headersSent) {
        return;
    }
    res.statusCode = code;
    res.setHeader('Content-Type', contentType);
    if (data) {
        res.write(JSON.stringify(data));
    }
    res.end();
}

function proxyRequest(url: string, req: http.IncomingMessage, res: http.ServerResponse) {
    const { port } = selectWorker();
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
            sendRepl(res, workerRes.statusCode || 500, data, workerRes.headers['content-type']);
        });
    });

    workerReq.on('error', (error) => {
        sendRepl(res, 500, { error: 'Internal server error' });
    });

    req.pipe(workerReq);
}
const users: IUser[] = [];

function jsonParse(body: string) {
    try {
        return JSON.parse(body);
    } catch (err) {
        return null;
    }
}

 function getUsers(req: http.IncomingMessage, res: http.ServerResponse) {
     sendRepl(res, 200, users);
}

 function getUser(id: string, res: http.ServerResponse) {
    if (!id || !validate(id)) {
        return sendRepl(res, 400, { error: `Invalid user id ${id}` });
    }

    const user = users.find((username) => username.id === id);
    if (!user) {
        return sendRepl(res, 404, { error: 'User not found' });
    }
     sendRepl(res, 200, user);
}
function addUser(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';
    req.on('data', (chunk) => {
        body += chunk.toString();
    });

    req.on('end', () => {
        const data = jsonParse(body);
        if (!data || !data.username || !data.age) {
            return sendRepl(res, 400, { error: 'Missing required fields' });
        }

        const newUser = {
            id: uuid4(),
            username: data.username,
            age: data.age,
            hobbies: data.hobbies || [],
        };
        users.push(newUser);

        sendRepl(res, 201, newUser);
    });
}

 function editUser(id: string, req: http.IncomingMessage, res: http.ServerResponse) {
    if (!id || !validate(id)) {
        return sendRepl(res, 400, { error: 'Invalid user id' });
    }
    const user = users.find((username) => username.id === id);
    if (!user) {
        return sendRepl(res, 404, { error: 'User not found' });
    }

    let body = '';
    req.on('data', (chunk) => {
        body += chunk.toString();
    });

    req.on('end', () => {
        const data = jsonParse(body);
        if (!data || (!data.username && !data.age && !data.hobbies)) {
            return sendRepl(res, 400, { error: 'Missing required fields' });
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

        sendRepl(res, 200, user);
    });
}

 function deleteUser(id: string, res: http.ServerResponse) {
    if (!id || !validate(id)) {
        return sendRepl(res, 400, { error: 'Invalid user id' });
    }

    const index = users.findIndex((username) => username.id === id);
    if (index === -1) {
        return sendRepl(res, 404, { error: 'User not found' });
    }

    const deletedUser = users.splice(index, 1)[0];
     sendRepl(res, 200, deletedUser);
}

Object.values(workers).forEach((worker: IWorker) => {
    const server = http.createServer(processRequest);

    server.listen(worker.port, () => {
        console.log(`Server running on port ${worker.port}`);
    });
});



