// 独立的 canvas 测试页服务器(canvas-real-test 的页面部分,长驻版)
// 用法:node .build-tools/canvas-page-server.cjs  (Ctrl-C 退出)
const http = require('node:http')
const HTML = `<!doctype html><html><body style="margin:0">
<canvas id="board" width="300" height="150" style="position:absolute;left:20px;top:20px;width:300px;height:150px;border:1px solid #ccc"></canvas>
<canvas width="200" height="100" style="position:absolute;left:20px;top:200px;width:200px;height:100px;border:1px solid #ddd"></canvas>
<button id="hit" style="position:absolute;left:400px;top:20px;width:60px;height:30px">hit</button>
<div id="clicked-marker" style="display:none"></div>
<script>
(function(){var c=document.getElementById('board').getContext('2d');c.fillStyle='#d00';c.fillRect(10,10,100,100);
var l=document.querySelectorAll('canvas')[1].getContext('2d');l.fillStyle='#00d';l.beginPath();l.arc(60,50,40,0,7);l.fill();
document.getElementById('hit').addEventListener('click',function(){var m=document.getElementById('clicked-marker');m.style.display='block';m.textContent='CLICKED @ '+Date.now()})})();
</script></body></html>`
http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(HTML) })
  .listen(18777, '127.0.0.1', () => console.log('canvas test page on http://127.0.0.1:18777/canvas-test'))
