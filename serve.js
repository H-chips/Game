/* 零依赖本地静态服务器：手机连同一个 WiFi，打开下面打印的地址即可玩。
 * 用法：  node serve.js          默认 8080 端口
 *        node serve.js 9000     指定端口
 * 也可以直接双击「启动服务器.bat」。
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg'
};

function lanIPs() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      // 只要局域网 IPv4，跳过虚拟网卡回环
      if (n.family === 'IPv4' && !n.internal) out.push(n.address);
    }
  }
  return out;
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch (e) {
    res.writeHead(400).end('Bad Request');
    return;
  }
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  // 扫码页用来列出本机所有局域网地址
  if (urlPath === '/qr-ips.json') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(lanIPs()));
    return;
  }

  // 防目录穿越
  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIPs();
  const line = '─'.repeat(52);
  console.log('\n' + line);
  console.log('  合成神龙 · 已启动，手机用这个链接玩：\n');
  if (ips.length === 0) {
    console.log('  没检测到局域网 IP，请确认已连上 WiFi');
    console.log('  本机： http://localhost:' + PORT);
  } else {
    ips.forEach(ip => console.log('  http://' + ip + ':' + PORT));
  }
  console.log('\n  扫码页（电脑上打开）： http://localhost:' + PORT + '/qr.html');
  console.log('  手机需与电脑连同一个 WiFi；停服按 Ctrl+C');
  console.log(line + '\n');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用，换个端口： node serve.js 8081');
  } else {
    console.error(e.message);
  }
  process.exit(1);
});
