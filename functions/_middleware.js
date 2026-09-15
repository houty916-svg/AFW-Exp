// Production environment variable MAINTENANCE=1 pauses participation.
export async function onRequest(context){
  const paused=String(context.env.MAINTENANCE||"").trim()==="1";
  const pathname=new URL(context.request.url).pathname;
  // Export retains its own ADMIN_KEY check.
  if(!paused||pathname==="/api/export")return context.next();
  const message="评定暂时暂停，请等待研究者通知后再继续。已成功保存的评分会保留。";
  const headers={"Cache-Control":"no-store","Retry-After":"3600"};
  if(pathname.startsWith("/api/"))return new Response(JSON.stringify({error:message,maintenance:true}),
    {status:503,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}});
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>评定暂时暂停</title>
    <style>body{margin:0;background:#f5f7fa;color:#1f2937;font-family:system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}
    main{margin:24px;padding:36px;max-width:560px;background:white;border-radius:16px;border:1px solid #e5e7eb}h1{font-size:26px}p{line-height:1.8}</style>
    </head><body><main><h1>评定暂时暂停</h1><p>${message}</p><p>感谢你的理解与配合。</p></main></body></html>`,
    {status:503,headers:{...headers,"Content-Type":"text/html; charset=utf-8"}});
}
