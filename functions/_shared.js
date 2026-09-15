export function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
}
export function readOrder(session){
  const order=JSON.parse(session.order_json);
  if(!Array.isArray(order)||!order.length||new Set(order).size!==order.length)throw new Error("invalid stored order");
  return order;
}
// Match the actual image and subject, not just the number of rows or completed flag.
export async function progress(db,session){
  const order=readOrder(session);
  const result=await db.prepare("SELECT trial_order,image,subject_id,fear_rating_0_100 FROM responses WHERE session_id=?").bind(session.session_id).all();
  const completed=new Set((result.results||[]).filter(r=>
    Number.isInteger(r.trial_order)&&r.trial_order>=1&&r.trial_order<=order.length&&
    r.image===order[r.trial_order-1]&&r.subject_id===session.subject_id&&
    Number.isInteger(r.fear_rating_0_100)&&r.fear_rating_0_100>=0&&r.fear_rating_0_100<=100
  ).map(r=>r.trial_order)); // Retain historical 0-100 ratings without rescaling them.
  const missing=order.map((_,i)=>i+1).filter(i=>!completed.has(i));
  return {session_id:session.session_id,order,completed_trial_orders:[...completed].sort((a,b)=>a-b),missing_trial_orders:missing,complete:missing.length===0};
}
export function fail(error){
  console.error(error);
  return json({error:"服务器暂时无法保存或读取数据，请联系研究者检查数据库绑定与升级。"},500);
}
