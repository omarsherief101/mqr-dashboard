/* Tiny static server for the mobile preview. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4599;
const file = path.join(__dirname, 'preview-mobile.html');

http.createServer((req, res) => {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(500); res.end('preview not generated'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buf);
  });
}).listen(PORT, () => console.log('Preview server on http://localhost:' + PORT));
