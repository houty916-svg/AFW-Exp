import {json,progress,fail} from "../_shared.js";
export async function onRequestPost({request,env}){
  try{
    const b=await request.json();
    const session=await env.DB.prepare("SELECT * FROM sessions WHERE session_id=?").bind(String(b.session_id||"")).first();
    if(!session)return json({error:"评定记录不存在"},404);
    const state=await progress(env.DB,session);
    if(!state.complete){
      await env.DB.prepare("UPDATE sessions SET completed=0 WHERE session_id=?").bind(session.session_id).run();
      return json({error:"还有图片未完成，请继续补评",...state},409);
    }
    const profile=await env.DB.prepare("SELECT session_id FROM session_demographics WHERE session_id=?").bind(session.session_id).first();
    if(!profile)return json({error:"请刷新页面补填性别和年龄"},409);
    await env.DB.prepare("UPDATE sessions SET completed=1,updated_at=? WHERE session_id=?").bind(new Date().toISOString(),session.session_id).run();
    return json({ok:true,...state});
  }catch(e){return fail(e)}
}
