import net from 'node:net';
const cache=new Map();
export const trustedQqMediaHost=host=>host==='multimedia.nt.qq.com.cn'||host==='qpic.cn'||host.endsWith('.qpic.cn')||host==='qlogo.cn'||host.endsWith('.qlogo.cn');
export const proxyFakeIp=ip=>/^198\.(?:18|19)\./.test(ip)||/^2001:2:/i.test(ip);
// Only used for QQ CDN names whose OS DNS result is the proxy benchmark range.
// Fixed HTTPS resolvers do not follow redirects, and the caller still validates
// every returned address and pins the selected public IP for the actual request.
export async function resolveQqPublicDns(host){
 if(!trustedQqMediaHost(host))throw Error('非QQ图片域名，禁止替代解析');
 const old=cache.get(host);if(old?.until>Date.now())return old.addresses;
 for(const base of ['https://cloudflare-dns.com/dns-query','https://dns.google/resolve']){
  try{const url=new URL(base);url.searchParams.set('name',host);url.searchParams.set('type','A');
   const response=await fetch(url,{headers:{accept:'application/dns-json'},redirect:'error',signal:AbortSignal.timeout(5000)});
   if(!response.ok)continue;const chunks=[];let length=0;
   for await(const chunk of response.body){length+=chunk.length;if(length>65536)throw Error('DNS响应超限');chunks.push(chunk);}
   const data=JSON.parse(Buffer.concat(chunks).toString()),addresses=(data.Answer||[]).filter(a=>a.type===1).map(a=>String(a.data));
   if(data.Status!==0||!addresses.length||addresses.some(ip=>net.isIP(ip)!==4))continue;
   // safe-fetch validates every address, including cache hits, before use.
   if(cache.size>=32)cache.clear();cache.set(host,{until:Date.now()+30000,addresses});return addresses;
  }catch{}
 }
 throw Error('QQ图片公网DNS解析失败');
}
