import test from "node:test";
import assert from "node:assert/strict";
import {onRequest} from "../functions/_middleware.js";
const call=(url,flag,method="GET")=>onRequest({env:{MAINTENANCE:flag},request:new Request("https://example.test"+url,{method}),next:()=>new Response("forwarded")});
test("Maintenance blocks pages and writes, preserves export authentication route, and can be disabled",async()=>{
 let r=await call("/","1");assert.equal(r.status,503);assert.match(await r.text(),/评定暂时暂停/);assert.equal(r.headers.get("Cache-Control"),"no-store");
 for(const route of ["/api/session","/api/response","/api/complete"]){r=await call(route,"1","POST");assert.equal(r.status,503);assert.equal((await r.json()).maintenance,true)}
 assert.equal(await (await call("/api/export?key=x","1")).text(),"forwarded");
 for(const flag of [undefined,"0"]){assert.equal(await (await call("/",flag)).text(),"forwarded")}
});
