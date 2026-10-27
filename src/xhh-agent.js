import { spawn } from 'node:child_process';
import path from 'node:path';
export function callXhh(root, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.XHH_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [path.join(root, 'src/xhh-agent.py')], { windowsHide: true, env: {...process.env, PYTHONUTF8:'1', PYTHONIOENCODING:'utf-8:strict'}, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; let done = false;
    const finish = (err, data) => { if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve(data); };
    const timer = setTimeout(() => { child.kill(); finish(Error('小黑盒处理超时；评论可能已发送，不要重试')); }, 65000);
    child.stdout.on('data', data => { out += data; if(out.length>150000){child.kill();finish(Error('响应过大'));} });
    child.stderr.on('data', () => {});
    child.on('error', () => finish(Error('小黑盒运行环境无法启动')));
    child.on('close', () => { try{finish(null,JSON.parse(out.trim()));}catch{finish(Error('小黑盒响应不可解析，禁止重发评论'));} });
    child.stdin.end(JSON.stringify(args)+'\n');
  });
}
