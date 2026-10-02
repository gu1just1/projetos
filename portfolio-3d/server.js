const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = path.resolve(__dirname);

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
    let reqUrl = req.url.split('?')[0];
    if (reqUrl === '/' || reqUrl === '') reqUrl = '/index.html';

    const cleanPath = path.normalize(reqUrl).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(ROOT, cleanPath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.log(`[404] ${req.method} ${req.url} -> ${filePath}`);
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('404 Not Found');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        console.log(`[200] ${req.method} ${req.url} (${data.length} bytes, ${contentType})`);
        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': data.length,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Static server ready on port ${PORT} serving ${ROOT}`);
});