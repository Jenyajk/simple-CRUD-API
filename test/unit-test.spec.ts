import * as http from 'http';
import handleRequest from "../src";

describe('GET /api/users', () => {
    let server: http.Server;

    beforeAll(() => {
        server = http.createServer(handleRequest);
        server.listen(3000);
    });

    afterAll(() => {
        server.close();
    });

    it('should return an empty array', (done) => {
        http.get('http://localhost:3000/api/users', (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toBe('application/json');

            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                const users = JSON.parse(data);
                expect(users).toEqual([]);
                done();
            });
        });
    });
});


