import {json,readOrder,fail} from "../_shared.js";
export async function onRequestPost({request,env}){
  try{
    const b=await request.json(),rating=b.fear_rating_0_100;
    if(!Number.isInteger(rating)||rating<0||rating>9)return json({error:"评分必须是0–9的整数"},400);
    const session=await env.DB.prepare("SELECT * FROM sessions WHERE session_id=?").bind(String(b.session_id||"")).first();
    if(!session)return json({error:"评定记录不存在，请重新进入"},404);
    const order=readOrder(session),trial=b.trial_order;
    if(b.subject_id!==session.subject_id||!Number.isInteger(trial)||trial<1||trial>order.length||b.image!==order[trial-1])
      return json({error:"图片与评定进度不匹配，请刷新后继续"},400);
    const profile=await env.DB.prepare("SELECT session_id FROM session_demographics WHERE session_id=?").bind(session.session_id).first();
    if(!profile)return json({error:"请刷新页面，先填写性别和年龄"},409);
    if(!Number.isInteger(b.rt_ms)||b.rt_ms<0)return json({error:"作答时间不正确"},400);
    const now=new Date().toISOString();
    // A retry or second browser cannot overwrite an already saved valid rating.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO responses(session_id,subject_id,trial_order,image,fear_rating_0_100,rt_ms,timestamp,total_trials)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(session_id,trial_order) DO NOTHING`)
        .bind(session.session_id,session.subject_id,trial,b.image,rating,b.rt_ms,now,order.length),
      env.DB.prepare("UPDATE sessions SET updated_at=? WHERE session_id=?").bind(now,session.session_id)
    ]);
    const saved=await env.DB.prepare("SELECT image,subject_id,fear_rating_0_100 FROM responses WHERE session_id=? AND trial_order=?")
      .bind(session.session_id,trial).first();
    if(!saved||saved.image!==b.image||saved.subject_id!==session.subject_id||!Number.isInteger(saved.fear_rating_0_100)||saved.fear_rating_0_100<0||saved.fear_rating_0_100>100)
      return json({error:"已有记录与图片不匹配，请联系研究者核查"},409);
    return json({ok:true,trial_order:trial});
  }catch(e){return fail(e)}
}
