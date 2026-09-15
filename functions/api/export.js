import {fail} from "../_shared.js";
export async function onRequestGet({request,env}){
  const key=new URL(request.url).searchParams.get("key")||"";
  if(!env.ADMIN_KEY||key!==env.ADMIN_KEY)return new Response("Unauthorized",{status:401});
  try{
    const data=await env.DB.prepare(`SELECT r.subject_id,r.session_id,r.trial_order,r.image,r.fear_rating_0_100,
      r.rt_ms,r.timestamp,r.total_trials,d.gender,d.age FROM responses r
      LEFT JOIN session_demographics d ON d.session_id=r.session_id
      ORDER BY r.subject_id,r.session_id,r.trial_order`).all();
    const headers=["subject_id","session_id","trial_order","image","fear_rating_0_100","rt_ms","timestamp","total_trials","gender","age"];
    const esc=v=>{const s=String(v??"");return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
    return new Response("\uFEFF"+[headers.join(","),...(data.results||[]).map(r=>headers.map(h=>esc(r[h])).join(","))].join("\r\n"),
      {headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=fear_ratings.csv","Cache-Control":"no-store"}});
  }catch(e){return fail(e)}
}
