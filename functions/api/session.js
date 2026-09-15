import {json,progress,fail} from "../_shared.js";
async function selectSession(db,subject){
  const all=await db.prepare("SELECT * FROM sessions WHERE subject_id=? ORDER BY created_at DESC,session_id DESC").bind(subject).all();
  let latest=null;
  for(const session of all.results||[]){
    const state=await progress(db,session);
    if(!latest)latest=state;
    if(!state.complete)return state; // Also recover sessions incorrectly marked completed by old code.
  }
  return latest; // Completed subjects must not accidentally create a fresh session.
}
export async function onRequestGet({request,env}){
  try{
    const subject=(new URL(request.url).searchParams.get("subject_id")||"").trim();
    if(!subject)return json({error:"请输入被试编号"},400);
    const state=await selectSession(env.DB,subject);
    return json(state?{found:true,...state}:{found:false});
  }catch(e){return fail(e)}
}
export async function onRequestPost({request,env}){
  try{
    const b=await request.json(),subject=String(b.subject_id||"").trim();
    if(!subject||subject.length>100)return json({error:"被试编号须为1–100个字符"},400);
    if(!["男","女"].includes(b.gender)||!Number.isInteger(b.age)||b.age<1||b.age>120)
      return json({error:"请选择性别，并填写1–120之间的整数年龄（周岁）"},400);
    let state=await selectSession(env.DB,subject);
    const now=new Date().toISOString();
    if(!state){
      const order=b.order;
      if(!Array.isArray(order)||!order.length||order.length>5000||new Set(order).size!==order.length||
        order.some(x=>typeof x!=="string"||!x||/[\\/]/.test(x)||! /\.(jpg|jpeg|png|webp|bmp)$/i.test(x)))
        return json({error:"材料列表格式不正确"},400);
      // Single atomic INSERT: concurrent starts with the same ID reuse one session.
      await env.DB.prepare(`INSERT INTO sessions(session_id,subject_id,order_json,completed,created_at,updated_at)
        SELECT ?,?,?,0,?,? WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE subject_id=?)`)
        .bind(crypto.randomUUID(),subject,JSON.stringify(order),now,now,subject).run();
      state=await selectSession(env.DB,subject);
    }
    await env.DB.prepare(`INSERT INTO session_demographics(session_id,gender,age,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(session_id) DO UPDATE SET gender=excluded.gender,age=excluded.age,updated_at=excluded.updated_at`)
      .bind(state.session_id,b.gender,b.age,now).run();
    return json({found:true,...state});
  }catch(e){return fail(e)}
}
