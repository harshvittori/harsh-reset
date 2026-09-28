/* HV Reset: personal productivity dashboard.
   Reads the app's real data through window.HRApp (index.html). It never invents activity:
   - "Measured" numbers come from timer sessions (start, pause, resume, finish) or from start and finish times.
   - "Calculated" numbers are built from those.
   - Anything the app didn't record shows as "not tracked" instead of zero.
   Its own settings (goals, weights, alerts) live in state.dash; habits live in state.habits / state.habitLog,
   apart from tasks, so they never change task stats. */
(function(){
"use strict";
const A=window.HRApp; if(!A) return;
const $=id=>document.getElementById(id), esc=A.esc;
const pad=n=>String(n).padStart(2,"0");
const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], DAYN=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const kd=k=>{ const [y,m,d]=k.split("-").map(Number); return new Date(y,m-1,d); };
const K=d=>A.keyOf(d), add=(k,n)=>A.addDays(k,n), dayMs=k=>kd(k).getTime();
const span=(a,b)=>{ const o=[]; for(let k=a;k<=b;k=add(k,1)) o.push(k); return o; };
const nowMin=()=>{ const d=new Date(); return d.getHours()*60+d.getMinutes()+d.getSeconds()/60; };
const hm=ts=>{ const d=new Date(ts); return A.fmt(d.getHours()*60+d.getMinutes()); };
const dur=m=>{ if(m==null) return "–"; if(m>0&&m<1) return "<1 min"; m=Math.round(m); return m<60?m+" min":Math.floor(m/60)+"h"+(m%60?" "+m%60+"m":""); };
const pct=(a,b)=>b?Math.round(a/b*100):null;
const P=v=>v==null?"–":v+"%";
const shortD=k=>{ const d=kd(k); return d.getDate()+" "+MON[d.getMonth()]; };
const niceD=k=>A.niceDate(k);
const weekStart=k=>{ const d=kd(k); d.setDate(d.getDate()-((d.getDay()+6)%7)); return K(d); };
const monthStart=k=>{ const d=kd(k); return K(new Date(d.getFullYear(),d.getMonth(),1)); };
const monthEnd=k=>{ const d=kd(k); return K(new Date(d.getFullYear(),d.getMonth()+1,0)); };
const median=a=>{ if(!a.length) return null; const s=a.slice().sort((x,y)=>x-y), m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; };
const norm=t=>String(t||"").trim().toLowerCase().replace(/\s+/g," ");
const plural=(n,w,ws)=>n+" "+(n===1?w:(ws||w+"s"));
const ST=()=>A.state;
function cfg(){ const s=ST(); s.dash=s.dash||{}; const d=s.dash;
  d.weights=Object.assign({completion:2,punctuality:1,consistency:2,focus:1,accuracy:1,goals:1},d.weights||{});
  d.alerts=Object.assign({overdue:true,soon:true,moved:true,estimate:true,workload:true,trend:true,goals:true,untracked:true,running:true},d.alerts||{});
  d.capacity=d.capacity||480; d.deep=d.deep||45; d.goals=d.goals||[]; d.dismissed=d.dismissed||{}; return d; }

/* ---------- task records (one per task per day) ---------- */
const CAT={work:"work",claude:"work",start:"work",close:"work",meal:"meal",rest:"rest"}, CATN={work:"Work",meal:"Meals",rest:"Breaks"};
let cache={}, cacheU=-1, cacheM=-1;
function fresh(){ const u=ST().updatedAt||0, m=Math.floor(Date.now()/60000); if(u!==cacheU||m!==cacheM){ cache={}; cacheU=u; cacheM=m; } }
function recsOf(k){
  if(cache[k]) return cache[k];
  const ds=ST().days[k]||{}, t=A.today, nm=nowMin(), base=dayMs(k);
  let bl=[]; try{ bl=A.dayView(k); }catch(e){}
  const seen=new Set(bl.map(b=>b.id)), extra=[];
  const addX=(id,x)=>{ if(seen.has(id)) return; seen.add(id); extra.push({id,title:x.t||"A task you removed",kind:x.k||"work",core:false,d:x.d||0,s:null,e:null,planS:null,removed:true}); };
  Object.keys(ds.sess||{}).forEach(id=>{ const a=ds.sess[id]; if(a&&a.length) addX(id,a[0]); });
  Object.keys(ds.done||{}).forEach(id=>addX(id,{}));
  return cache[k]=bl.concat(extra).filter(b=>b.kind!=="free").map(b=>mkRec(k,b,ds,t,nm,base));
}
function mkRec(k,b,ds,t,nm,base){
  const sk=(ds.skipped||{})[b.id]||null, st=(ds.started||{})[b.id]||null, sess=(ds.sess||{})[b.id]||[];
  const r={key:k,id:b.id,title:b.title||"Untitled",kind:b.kind,cat:CAT[b.kind]||"work",core:!!b.core,est:+b.d||0,s:b.s,e:b.e,removed:!!b.removed,
    doneAt:(ds.done||{})[b.id]||null,startedAt:st,skipped:sk,mv:(ds.mv||{})[b.id]||null,focus:(ds.focus||{})[b.id]||0,intr:(ds.intr||{})[b.id]||0,sess};
  r.sAt=r.s!=null?base+r.s*60000:null; r.eAt=r.e!=null?base+r.e*60000:null; r.pAt=b.planS!=null?base+b.planS*60000:null;
  if(r.doneAt) r.status=sk==="min"?"short":"done";
  else if(sk==="before") r.status="added";
  else if(sk) r.status="moved";
  else if(k<t) r.status="missed";
  else if(k===t&&r.e!=null&&nm>r.e) r.status="overdue";
  else r.status="pending";
  r.isDone=r.status==="done"||r.status==="short"; r.counted=r.status!=="added";
  r.due=r.isDone||r.status==="missed"||r.status==="overdue"||r.status==="moved";
  const now=Date.now(); let act=0,paused=0,pauses=0; const segs=[];
  sess.forEach(x=>{ const e=x.e||now; act+=A.sessActiveMs(x,now);
    const ps=(x.p||[]).slice().sort((p,q)=>p.a-q.a); let cur=x.s;
    ps.forEach(q=>{ const qb=Math.min(q.b||e,e); paused+=Math.max(0,qb-q.a); pauses++; if(q.a>cur) segs.push({a:cur,b:Math.min(q.a,e)}); cur=Math.max(cur,qb); });
    if(e>cur) segs.push({a:cur,b:e}); });
  if(sess.length){ r.src="timer"; r.active=act/60000; r.paused=paused/60000; r.pauses=pauses; r.segs=segs; r.running=sess.some(x=>!x.e); }
  else if(st&&r.doneAt&&r.doneAt>st&&r.doneAt-st<16*3600000){ r.src="startfinish"; r.active=(r.doneAt-st)/60000; r.paused=null; r.pauses=null; r.segs=[{a:st,b:r.doneAt}]; }
  else { r.src=null; r.active=null; r.segs=[]; }
  r.startAt=sess.length?sess[0].s:st;
  r.startDelay=r.startAt&&r.pAt?(r.startAt-r.pAt)/60000:null;     // against the time you first planned
  r.dlDelta=r.doneAt&&r.eAt?(r.doneAt-r.eAt)/60000:null;           // against the planned end (your deadline)
  return r;
}

/* ---------- filters and periods ---------- */
const D={sec:"overview",preset:"7d",from:null,to:null,f:{cat:"all",pri:"all",status:"all",track:"all"},rep:"week",repKey:null,day:null,heat:"completion",cal:null,hour:"minutes",histQ:"",open:null};
try{ const s=JSON.parse(localStorage.getItem("hr-dash")||"{}"); if(s.sec) D.sec=s.sec; if(s.preset) D.preset=s.preset; if(s.from){ D.from=s.from; D.to=s.to; } if(s.heat) D.heat=s.heat; }catch(e){}
function remember(){ try{ localStorage.setItem("hr-dash",JSON.stringify({sec:D.sec,preset:D.preset,from:D.from,to:D.to,heat:D.heat})); }catch(e){} }
const PRESETS=[["today","Today"],["yesterday","Yesterday"],["week","This week"],["lastweek","Last week"],["month","This month"],["lastmonth","Last month"],["7d","Last 7 days"],["30d","Last 30 days"],["90d","Last 90 days"]];
function presetRange(p){ const t=A.today, mon=weekStart(t);
  switch(p){
    case "today": return [t,t];
    case "yesterday": { const y=add(t,-1); return [y,y]; }
    case "week": return [mon,add(mon,6)];
    case "lastweek": return [add(mon,-7),add(mon,-1)];
    case "month": return [monthStart(t),monthEnd(t)];
    case "lastmonth": { const e=add(monthStart(t),-1); return [monthStart(e),e]; }
    case "30d": return [add(t,-29),t];
    case "90d": return [add(t,-89),t];
    case "custom": if(D.from&&D.to) return [D.from,D.to]; return [add(t,-6),t];
    default: return [add(t,-6),t];
  } }
const periodName=()=>D.preset==="custom"?shortD(presetRange("custom")[0])+" – "+shortD(presetRange("custom")[1]):(PRESETS.find(x=>x[0]===D.preset)||[0,"Last 7 days"])[1];
/* the part of a period that has happened: no future days, nothing before your first plan */
function clamp(a,b){ const f=A.firstDay(), t=A.today; const lo=a<f?f:a, hi=b>t?t:b; return lo<=hi?span(lo,hi):[]; }
/* the period before, like for like: this week so far is compared with the same days last week */
function prevOf(a,b){ const t=A.today, hi=b>t?t:b, n=span(a,hi).length;
  if(D.preset==="month"||D.preset==="lastmonth"){ const s=monthStart(add(a,-1)); const e=add(s,n-1); return [s,e>add(a,-1)?add(a,-1):e]; }
  if(D.preset==="week"||D.preset==="lastweek"){ return [add(a,-7),add(a,-7+n-1)]; }
  return [add(a,-n),add(a,-1)]; }
const prevName=()=>({today:"yesterday",yesterday:"the day before",week:"the same days last week",lastweek:"the week before",month:"the same days last month",lastmonth:"the month before"})[D.preset]||"the period before";
function pass(r){ const f=D.f;
  if(f.cat!=="all"&&r.cat!==f.cat) return false;
  if(f.pri==="must"&&!r.core) return false; if(f.pri==="flex"&&r.core) return false;
  if(f.status==="done"&&!r.isDone) return false; if(f.status==="missed"&&r.status!=="missed"&&r.status!=="overdue") return false;
  if(f.status==="moved"&&r.status!=="moved") return false; if(f.status==="open"&&r.status!=="pending"&&r.status!=="overdue") return false;
  if(f.track==="tracked"&&!r.src) return false; if(f.track==="untracked"&&r.src) return false;
  return true; }
const filtersOn=()=>Object.values(D.f).some(v=>v!=="all");
const recsIn=(keys,all)=>{ const o=[]; keys.forEach(k=>recsOf(k).forEach(r=>{ if(r.counted&&(all||pass(r))) o.push(r); })); return o; };

/* ---------- metrics ---------- */
function agg(recs){
  const o={n:recs.length,done:0,short:0,missed:0,overdue:0,moved:0,pending:0,due:0,worked:0,timer:0,measuredN:0,timedN:0,verified:0,partly:0,ratedMin:0,ratedScore:0,ratedN:0,
    dlEarly:0,dlOn:0,dlLate:0,dlN:0,dlLateSum:0,sEarly:0,sOn:0,sLate:0,sN:0,sLateSum:0,movedBefore:0,movedAfter:0,movedUnknown:0,
    accSum:0,accN:0,within:0,over:0,overBig:0,under:0,estSum:0,actSum:0,pauses:0,intr:0,sessions:0,segs:[],plannedMin:0,doneMin:0};
  recs.forEach(r=>{
    o.plannedMin+=r.est; if(r.isDone){ o.done++; o.doneMin+=r.est; } if(r.status==="short") o.short++;
    if(r.status==="missed") o.missed++; if(r.status==="overdue") o.overdue++; if(r.status==="pending") o.pending++; if(r.due) o.due++;
    if(r.status==="moved"){ o.moved++; if(!r.mv) o.movedUnknown++; else if(r.eAt&&r.mv.at<=r.eAt) o.movedBefore++; else o.movedAfter++; }
    if(r.active!=null){ o.worked+=r.active; o.measuredN++; }
    if(r.src==="timer"){ o.timer+=r.active; o.timedN++; o.pauses+=r.pauses; o.sessions+=r.sess.length; r.segs.forEach(s=>o.segs.push(s));
      if(r.focus){ o.ratedN++; o.ratedMin+=r.active; o.ratedScore+=r.active*(r.focus===3?1:r.focus===2?.5:0); if(r.focus===3) o.verified+=r.active; if(r.focus===2) o.partly+=r.active; } }
    o.intr+=r.intr;
    if(r.isDone&&r.dlDelta!=null){ o.dlN++; if(r.dlDelta< -5) o.dlEarly++; else if(r.dlDelta<=5) o.dlOn++; else { o.dlLate++; o.dlLateSum+=r.dlDelta; } }
    if(r.startDelay!=null){ o.sN++; if(r.startDelay< -5) o.sEarly++; else if(r.startDelay<=5) o.sOn++; else { o.sLate++; o.sLateSum+=r.startDelay; } }
    if(r.isDone&&r.active!=null&&r.est>0&&r.active>=1){ o.accN++; const dev=Math.abs(r.active-r.est)/r.est; o.accSum+=Math.max(0,100-dev*100); o.estSum+=r.est; o.actSum+=r.active;
      if(r.active<=r.est*1.1) o.within++; else o.over++; if(r.active<r.est*.9) o.under++; if(r.active>=r.est*1.5&&r.active-r.est>=10) o.overBig++; }
  });
  o.completion=pct(o.done,o.due); o.deadline=pct(o.dlEarly+o.dlOn,o.dlN); o.punct=pct(o.sEarly+o.sOn,o.sN);
  o.accuracy=o.accN?Math.round(o.accSum/o.accN):null; o.focusQ=o.ratedMin?Math.round(o.ratedScore/o.ratedMin*100):null;
  const segMin=o.segs.map(s=>(s.b-s.a)/60000).filter(m=>m>=1); o.segN=segMin.length; o.segAvg=segMin.length?segMin.reduce((a,b)=>a+b,0)/segMin.length:null; o.segMax=segMin.length?Math.max(...segMin):null;
  o.deepN=segMin.filter(m=>m>=cfg().deep).length; o.deepMin=segMin.filter(m=>m>=cfg().deep).reduce((a,b)=>a+b,0);
  return o;
}
/* one day, all tasks (no filters): the basis for streaks, consistency and goals */
function dayAll(k){ const a=agg(recsOf(k).filter(r=>r.counted)); a.key=k; a.hasPlan=a.n>0; a.pctDay=a.n?pct(a.done,a.n):null; a.good=a.n>0&&a.pctDay>=70; return a; }
function consistency(keys){ const t=A.today; let plan=0,good=0; keys.forEach(k=>{ const d=dayAll(k); if(!d.hasPlan) return; if(k===t&&!d.good) return; plan++; if(d.good) good++; }); return {plan,good,pct:pct(good,plan)}; }
function streaks(){ const f=A.firstDay(), t=A.today; let cur=0,best=0,run=0; const ks=span(f,t);
  ks.forEach(k=>{ const d=dayAll(k); if(!d.hasPlan) return; if(d.good){ run++; best=Math.max(best,run); } else if(k!==t) run=0; }); cur=run; return {cur,best}; }
function metrics(a,b){ const keys=clamp(a,b), recs=recsIn(keys); const m=agg(recs); m.keys=keys; m.recs=recs; m.cons=consistency(keys); return m; }

/* ---------- score ---------- */
const PARTS=[["completion","Task completion","Done out of tasks that were due"],["punctuality","Punctuality","Starts on time and finishing by the planned end"],["consistency","Consistency","Days you finished 70% or more of your plan"],["focus","Focus quality","How focused you said you were on timed work"],["accuracy","Time accuracy","How close your time estimates were"],["goals","Goal progress","How close you are to your own goals"]];
function scoreOf(m,keys,withGoals){
  const parts={completion:m.due>=3?m.completion:null,
    punctuality:(m.sN>=3||m.dlN>=3)?Math.round([m.sN>=3?m.punct:null,m.dlN>=3?m.deadline:null].filter(v=>v!=null).reduce((x,y,i,a)=>x+y/a.length,0)):null,
    consistency:m.cons&&m.cons.plan>=2?m.cons.pct:null, focus:m.ratedN>=2?m.focusQ:null, accuracy:m.accN>=3?m.accuracy:null,
    goals:withGoals?goalScore(keys):null};
  const w=cfg().weights; let sw=0,sv=0; Object.keys(parts).forEach(k=>{ if(parts[k]!=null&&w[k]>0){ sw+=w[k]; sv+=w[k]*parts[k]; } });
  return {overall:sw?Math.round(sv/sw):null,parts,used:Object.keys(parts).filter(k=>parts[k]!=null&&w[k]>0)}; }

/* ---------- goals ---------- */
const GOALS={tasks_day:{n:"Tasks done per day",u:"tasks",d:3},week_pct:{n:"Weekly completion",u:"%",d:80},punct:{n:"Start on time",u:"%",d:70},
  focus_sessions:{n:"Focus sessions per week",u:"sessions",d:10},focus_hours:{n:"Focused hours per week",u:"hours",d:10},streak:{n:"Consistency streak",u:"days",d:7}};
function weekKeys(k){ const s=weekStart(k); return span(s,add(s,6)); }
function goalEval(g){
  const t=A.today, wk=clamp(...[weekStart(t),add(weekStart(t),6)]), elapsed=Math.max(1,span(weekStart(t),t).length);
  const weekVal=(keys)=>{ const m=agg(recsIn(keys,true));
    if(g.type==="week_pct") return m.due?m.completion:null;
    if(g.type==="punct") return m.sN?m.punct:null;
    if(g.type==="focus_sessions") return m.segs.filter(s=>(s.b-s.a)>=10*60000).length;
    if(g.type==="focus_hours") return Math.round(m.timer/6)/10; return null; };
  let cur=null,status="",hist=[],pace=null;
  if(g.type==="tasks_day"){ cur=dayAll(t).done; status=cur>=g.target?"met":"progress";
    hist=span(add(t,-13),t).map(k=>{ const d=dayAll(k); return {label:shortD(k),v:d.hasPlan?d.done:null,met:d.hasPlan?d.done>=g.target:null}; }); }
  else if(g.type==="streak"){ cur=streaks().cur; status=cur>=g.target?"met":"progress"; }
  else { cur=weekVal(wk);
    if(g.type==="focus_sessions"||g.type==="focus_hours"){ pace=g.target*elapsed/7; status=cur>=g.target?"met":cur>=pace*.9?"ontrack":"behind"; }
    else status=cur==null?"nodata":cur>=g.target?"met":(elapsed<3?"progress":"behind");
    hist=[5,4,3,2,1,0].map(i=>{ const s=add(weekStart(t),-7*i), ks=clamp(s,add(s,6)); const v=ks.length?weekVal(ks):null; return {label:shortD(s),v,met:v==null?null:v>=g.target}; }); }
  return {cur,status,hist,pace,pct:cur==null?0:Math.min(100,Math.round(cur/g.target*100))}; }
function goalScore(keys){ const gs=cfg().goals; if(!gs.length||!keys.length) return null; const m=agg(recsIn(keys,true)), days=keys.length;
  const v=gs.map(g=>{ switch(g.type){
    case "tasks_day": { const pd=keys.map(dayAll).filter(d=>d.hasPlan); return pd.length?pct(pd.filter(d=>d.done>=g.target).length,pd.length):null; }
    case "week_pct": return m.due?Math.min(100,Math.round(m.completion/g.target*100)):null;
    case "punct": return m.sN?Math.min(100,Math.round(m.punct/g.target*100)):null;
    case "focus_hours": return Math.min(100,Math.round(m.timer/60/(g.target*days/7)*100));
    case "focus_sessions": return Math.min(100,Math.round(m.segs.filter(s=>(s.b-s.a)>=600000).length/(g.target*days/7)*100));
    case "streak": return Math.min(100,Math.round(streaks().cur/g.target*100)); } return null; }).filter(x=>x!=null);
  return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):null; }

/* ---------- charts (drawn at their real width, with a hover readout and a table) ---------- */
let CH={}, chN=0;
function niceMax(v){ if(!(v>0)) return 1; const p=Math.pow(10,Math.floor(Math.log10(v))), f=v/p; return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p; }
function tableHTML(o){ return '<details class="ch-tab"><summary>Show as table</summary><div class="tscroll"><table><thead><tr><th>'+esc(o.xName||"")+'</th>'+o.series.map(s=>'<th>'+esc(s.name)+'</th>').join("")+'</tr></thead><tbody>'+
  o.labels.map((l,i)=>'<tr><td>'+esc(o.tips?o.tips[i]:l)+'</td>'+o.series.map(s=>'<td>'+(s.vals[i]==null?"–":esc((o.fmt||String)(s.vals[i])))+'</td>').join("")+'</tr>').join("")+'</tbody></table></div></details>'; }
function legendHTML(o){ return o.series.length<2?"":'<div class="ch-leg">'+o.series.map(s=>'<span><i class="'+(o.type==="line"?"ln":"sq")+'" style="--c:'+s.c+'"></i>'+esc(s.name)+'</span>').join("")+'</div>'; }
function chart(o){ const id="ch"+(++chN); CH[id]=o; return '<figure class="ch">'+legendHTML(o)+'<div class="ch-box" data-chbox="'+id+'" style="height:'+(o.h||190)+'px"></div>'+(o.note?'<figcaption>'+o.note+'</figcaption>':'')+(o.noTable?"":tableHTML(o))+'</figure>'; }
function barPath(x,y,w,h,r){ if(h<=0) return ""; r=Math.min(r,w/2,h); return "M"+x+","+(y+h)+"V"+(y+r)+"Q"+x+","+y+" "+(x+r)+","+y+"H"+(x+w-r)+"Q"+(x+w)+","+y+" "+(x+w)+","+(y+r)+"V"+(y+h)+"Z"; }
function drawChart(id,W){ const o=CH[id]; if(!o) return ""; if(o.draw) return o.draw(W,id);
  const H=o.h||190, L=o.yw||42, R=10, T=10, B=24, iw=Math.max(10,W-L-R), ih=H-T-B, n=o.labels.length;
  const vals=o.type==="bar"&&o.stacked?o.labels.map((_,i)=>o.series.reduce((a,s)=>a+(s.vals[i]||0),0)):o.series.flatMap(s=>s.vals.filter(v=>v!=null));
  const raw=Math.max(o.ref?o.ref.v:0,...vals,0);
  const max=o.max||(o.int?Math.max(4,Math.ceil(raw/4)*4):o.mins&&raw>=120?Math.ceil(raw/240)*240:niceMax(raw)), y=v=>T+ih-(v/max)*ih, gw=iw/Math.max(1,n);
  let g=""; for(let i=0;i<=4;i++){ const v=max*i/4, yy=y(v); g+='<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'"/><text class="yt" x="'+(L-6)+'" y="'+(yy+4)+'">'+esc((o.yfmt||o.fmt||String)(Math.round(v*10)/10))+'</text>'; }
  const every=Math.max(1,Math.ceil(n/Math.max(1,Math.floor(iw/(o.xw||44)))));
  let xl=""; o.labels.forEach((l,i)=>{ if(i%every===0) xl+='<text class="xt" x="'+(L+gw*i+gw/2)+'" y="'+(H-6)+'">'+esc(l)+'</text>'; });
  let marks="";
  if(o.type==="line"){
    o.series.forEach(s=>{ let d="",pen=false; s.vals.forEach((v,i)=>{ if(v==null){ pen=false; return; } const px=L+gw*i+gw/2; d+=(pen?"L":"M")+px+","+y(v); pen=true; });
      marks+='<path class="ln" d="'+d+'" style="stroke:'+s.c+'"/>';
      s.vals.forEach((v,i)=>{ if(v==null) return; const prevNull=i===0||s.vals[i-1]==null, nextNull=i===n-1||s.vals[i+1]==null; if(prevNull&&nextNull||i===n-1||n<=14) marks+='<circle class="pt" cx="'+(L+gw*i+gw/2)+'" cy="'+y(v)+'" r="'+(n<=14?3.5:4)+'" style="fill:'+s.c+'"/>'; }); });
  } else {
    const k=o.stacked?1:o.series.length, bw=Math.max(2,Math.min(o.bw||26,(gw*.72-(k-1)*2)/k));
    o.labels.forEach((_,i)=>{ const x0=L+gw*i+gw/2-(bw*k+(k-1)*2)/2; let acc=0;
      o.series.forEach((s,j)=>{ const v=s.vals[i]; if(!v) return;
        if(o.stacked){ const y1=y(acc+v), y0=y(acc), top=j===o.series.length-1||!o.series.slice(j+1).some(z=>z.vals[i]); marks+='<path d="'+(top?barPath(x0,y1,bw,Math.max(0,y0-y1-(acc?2:0)),4):"M"+x0+","+y1+"h"+bw+"V"+(y0-(acc?2:0))+"h"+(-bw)+"Z")+'" style="fill:'+s.c+'"/>'; acc+=v; }
        else marks+='<path d="'+barPath(x0+j*(bw+2),y(v),bw,T+ih-y(v),4)+'" style="fill:'+s.c+'"/>'; }); });
  }
  let ref=""; if(o.ref){ const yy=y(o.ref.v); ref='<line class="refl" x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'"/><text class="reft" x="'+(W-R)+'" y="'+(yy-5)+'">'+esc(o.ref.label)+'</text>'; }
  let hit=""; o.labels.forEach((_,i)=>{ hit+='<rect class="hit" data-ch="'+id+'" data-i="'+i+'" tabindex="0" x="'+(L+gw*i)+'" y="'+T+'" width="'+gw+'" height="'+ih+'"'+(o.click?' style="cursor:pointer"':'')+' aria-label="'+esc((o.tips?o.tips[i]:o.labels[i])+": "+o.series.map(s=>s.name+" "+(s.vals[i]==null?"none":(o.fmt||String)(s.vals[i]))).join(", "))+'"/>'; });
  return '<svg width="'+W+'" height="'+H+'" role="img" aria-label="'+esc(o.title||"Chart")+'">'+g+'<line class="base" x1="'+L+'" x2="'+(W-R)+'" y1="'+(T+ih)+'" y2="'+(T+ih)+'"/>'+marks+ref+xl+'<line class="xh" id="xh-'+id+'" x1="0" x2="0" y1="'+T+'" y2="'+(T+ih)+'" hidden/>'+hit+'</svg>'; }
function drawAll(){ document.querySelectorAll("#dMain [data-chbox]").forEach(el=>{ const w=Math.floor(el.clientWidth); if(!w) return; if(el.dataset.w==w) return; el.dataset.w=w; el.innerHTML=drawChart(el.dataset.chbox,w); }); }
function tipShow(el,ev){ const o=CH[el.dataset.ch]; if(!o) return; const i=+el.dataset.i, tip=$("dTip"); tip.textContent="";
  if(o.items){ const it=o.items[i]; if(!it) return; const h=document.createElement("b"); h.textContent=it.t; tip.appendChild(h); it.l.forEach(x=>{ const r=document.createElement("small"); r.textContent=x; tip.appendChild(r); }); return placeTip(tip,el,ev); }
  const h=document.createElement("b"); h.textContent=o.tips?o.tips[i]:o.labels[i]; tip.appendChild(h);
  o.series.forEach(s=>{ const row=document.createElement("div"); const k=document.createElement("i"); k.style.background=s.c; const v=document.createElement("strong"); v.textContent=s.vals[i]==null?"–":(o.fmt||String)(s.vals[i]); const n=document.createElement("span"); n.textContent=s.name; row.append(k,v,n); tip.appendChild(row); });
  if(o.tipNote&&o.tipNote[i]){ const nn=document.createElement("small"); nn.textContent=o.tipNote[i]; tip.appendChild(nn); }
  if(o.click){ const c=document.createElement("small"); c.textContent="Click to see the tasks"; tip.appendChild(c); }
  placeTip(tip,el,ev);
  if(o.type==="line"){ const xh=$("xh-"+el.dataset.ch); if(xh){ const cx=+el.getAttribute("x")+ +el.getAttribute("width")/2; xh.setAttribute("x1",cx); xh.setAttribute("x2",cx); xh.hidden=false; } } }
function placeTip(tip,el,ev){ tip.hidden=false; const r=el.getBoundingClientRect(), x=ev&&ev.clientX?ev.clientX:r.left+r.width/2, yv=ev&&ev.clientY?ev.clientY:r.top;
  const tw=tip.offsetWidth, th=tip.offsetHeight; tip.style.left=Math.min(innerWidth-tw-8,Math.max(8,x+14))+"px"; tip.style.top=Math.max(8,Math.min(innerHeight-th-8,yv-th-10))+"px"; }
function tipHide(){ const t=$("dTip"); if(t) t.hidden=true; document.querySelectorAll("#dMain .xh").forEach(x=>x.hidden=true); }
const COL={s1:"var(--c1)",s2:"var(--c2)",s3:"var(--c3)",good:"var(--good)",warn:"var(--warnc)",crit:"var(--crit)",gray:"var(--neutral)"};

/* ---------- small UI pieces ---------- */
function tag(kind){ return '<span class="dtag t-'+kind+'">'+({measured:"Measured",calc:"Calculated",self:"You rated",none:"Not tracked yet",plan:"Planned"})[kind]+'</span>'; }
function delta(cur,prev,unit,better,ok){ if(ok==null) ok=CUR?CUR.cmpOK:true;
  if(cur==null||prev==null||!ok) return '<span class="dl none">Not enough earlier data to compare</span>';
  const d=Math.round((cur-prev)*10)/10; if(Math.abs(d)<(unit==="pts"?1:0.5)) return '<span class="dl flat">&#8594; Same as '+esc(prevName())+'</span>';
  const up=d>0, good=better==null?null:(better==="up"?up:!up);
  return '<span class="dl '+(good==null?"flat":good?"up":"down")+'">'+(up?"&#9650; +":"&#9660; &minus;")+esc(unit==="min"?dur(Math.abs(d)):Math.abs(d)+(unit==="pts"?" pts":unit?" "+unit:""))+' vs '+esc(prevName())+'</span>'; }
function kpi(o){ return '<button class="kpi'+(o.drill?"":" nodrill")+'"'+(o.drill?' data-ddrill="'+o.drill+'"':' tabindex="-1"')+'><span class="k-l">'+esc(o.label)+(o.tag?tag(o.tag):"")+'</span><b class="k-v">'+o.value+'</b>'+(o.sub?'<span class="k-s">'+o.sub+'</span>':'')+(o.delta||"")+'</button>'; }
function card(title,body,o){ o=o||{}; return '<section class="dcard'+(o.cls?" "+o.cls:"")+'"'+(o.id?' id="'+o.id+'"':'')+'><header><h3>'+title+'</h3>'+(o.tag?tag(o.tag):"")+(o.right||"")+'</header>'+(o.sub?'<p class="dc-sub">'+o.sub+'</p>':'')+body+'</section>'; }
function empty(msg,btn){ return '<div class="dempty"><p>'+msg+'</p>'+(btn||"")+'</div>'; }
function meter(v,label,cls){ return '<div class="meter '+(cls||"")+'"><div class="m-top"><span>'+label+'</span><b>'+P(v)+'</b></div><div class="m-bar"><i style="width:'+(v||0)+'%"></i></div></div>'; }
function statusName(r){ return ({done:"Done",short:"Done (short version)",moved:r.mv&&r.mv.why==="tomorrow"?"Moved to tomorrow":"Skipped",missed:"Missed",overdue:"Overdue",pending:r.key>A.today?"Upcoming":"Not started",added:"Added after its time"})[r.status]; }
function statusIcon(r){ return ({done:"&#10003;",short:"&#10003;",moved:"&#8631;",missed:"&#10005;",overdue:"!",pending:"&#9675;",added:"–"})[r.status]; }
function recRow(r,extra){ return '<tr><td>'+esc(shortD(r.key))+'</td><td>'+(r.s!=null?A.fmt(r.s):"–")+'</td><td class="tn">'+esc(r.title)+(r.core?' <span class="must">Must do</span>':'')+(r.removed?' <small>(removed from plan)</small>':'')+'</td><td>'+esc(CATN[r.cat])+'</td><td>'+dur(r.est)+'</td><td>'+(r.active!=null?dur(r.active)+(r.src==="startfinish"?"*":""):"–")+'</td><td><span class="st st-'+r.status+'">'+statusIcon(r)+' '+esc(statusName(r))+'</span></td>'+(extra?'<td>'+extra(r)+'</td>':'')+'<td><button class="dlink" data-dgo="'+r.key+'|'+r.id+'">Open</button></td></tr>'; }
function recTable(rs,extraH,extra){ if(!rs.length) return empty("No tasks here."); return '<div class="tscroll"><table class="dt"><thead><tr><th>Date</th><th>Planned</th><th>Task</th><th>Type</th><th>Estimate</th><th>Actual</th><th>Status</th>'+(extraH?'<th>'+extraH+'</th>':'')+'<th></th></tr></thead><tbody>'+rs.map(r=>recRow(r,extra)).join("")+'</tbody></table></div>'+(rs.some(r=>r.src==="startfinish")?'<p class="fine">* From start and finish times. No pause data for these.</p>':''); }

/* ---------- drill-down: every number can open the tasks behind it ---------- */
let CUR=null;
function drillList(name){ const m=CUR.m, t=A.today; const R=m.recs;
  const D1={all:["All tasks",R],done:["Completed tasks",R.filter(r=>r.isDone)],open:["Open tasks",R.filter(r=>r.status==="pending"||r.status==="overdue")],
    missed:["Missed tasks",R.filter(r=>r.status==="missed")],overdue:["Overdue now",recsIn([t]).filter(r=>r.status==="overdue")],moved:["Moved or skipped",R.filter(r=>r.status==="moved")],
    today:["Today's tasks",recsIn([t])],ontime:["Finished by the planned end",R.filter(r=>r.isDone&&r.dlDelta!=null&&r.dlDelta<=5)],late:["Finished after the planned end",R.filter(r=>r.isDone&&r.dlDelta!=null&&r.dlDelta>5)],
    tracked:["Tasks with measured time",R.filter(r=>r.src)],timer:["Tasks timed with the timer",R.filter(r=>r.src==="timer")],verified:["Timed tasks you rated fully focused",R.filter(r=>r.src==="timer"&&r.focus===3)],
    over:["Took longer than planned",R.filter(r=>r.isDone&&r.active!=null&&r.est>0&&r.active>r.est*1.1).sort((a,b)=>(b.active-b.est)-(a.active-a.est))],
    within:["Finished within the estimate",R.filter(r=>r.isDone&&r.active!=null&&r.est>0&&r.active<=r.est*1.1)],
    startlate:["Started late",R.filter(r=>r.startDelay!=null&&r.startDelay>5).sort((a,b)=>b.startDelay-a.startDelay)],
    soon:["Due in the next 3 hours",recsIn([t]).filter(r=>r.status==="pending"&&r.e!=null&&r.e-nowMin()<=180)],
    must:["Must-do tasks not done",R.filter(r=>r.core&&!r.isDone)],untracked:["Finished work with no time recorded",R.filter(r=>r.isDone&&!r.src&&r.cat==="work")]};
  if(D1[name]) return D1[name];
  if(name.startsWith("day:")){ const k=name.slice(4); return [niceD(k),recsIn([k])]; }
  if(name.startsWith("keys:")){ const [a,b,st]=name.slice(5).split(","); const rs=recsIn(clamp(a,b)); return [(a===b?niceD(a):shortD(a)+" – "+shortD(b)),st?rs.filter(r=>st==="done"?r.isDone:st==="open"?(r.status==="pending"||r.status==="overdue"):r.status===st):rs]; }
  if(name.startsWith("title:")){ const tt=name.slice(6); return ["“"+tt+"”",recsIn(clamp(add(t,-89),t)).filter(r=>norm(r.title)===tt)]; }
  if(name.startsWith("cat:")){ const c=name.slice(4); return [CATN[c]+" tasks",R.filter(r=>r.cat===c)]; }
  return ["Tasks",R]; }
function openDrill(name){ const [title,rs]=drillList(name); const el=$("dDrill");
  el.innerHTML='<div class="dr-top"><div><h3>'+esc(title)+'</h3><p>'+plural(rs.length,"task")+(name.startsWith("title:")?", last 90 days":" · "+esc(periodName()))+(filtersOn()?" · filtered":"")+'</p></div><button class="dx" data-dclosedrill aria-label="Close">&times;</button></div>'+recTable(rs.slice().sort((a,b)=>a.key<b.key?1:a.key>b.key?-1:(a.s||0)-(b.s||0)));
  el.classList.add("open"); $("dDrillScrim").classList.add("open"); el.querySelector(".dx").focus(); }
function closeDrill(){ $("dDrill").classList.remove("open"); $("dDrillScrim").classList.remove("open"); }

/* ---------- buckets for trends: days, or weeks for long periods ---------- */
function buckets(keys){ if(keys.length<=62) return keys.map(k=>({label:keys.length<=8?DAYN[kd(k).getDay()]+" "+kd(k).getDate():shortD(k),tip:niceD(k),keys:[k]}));
  const o=[]; keys.forEach(k=>{ const w=weekStart(k); let b=o[o.length-1]; if(!b||b.w!==w){ b={w,label:shortD(w),tip:"Week of "+shortD(w),keys:[]}; o.push(b); } b.keys.push(k); }); return o; }

/* ---------- the three questions ---------- */
function topCat(m){ const by={}; m.recs.forEach(r=>{ if(r.active!=null) by[r.cat]=(by[r.cat]||0)+r.active; }); const e=Object.entries(by).sort((a,b)=>b[1]-a[1])[0]; return e?[CATN[e[0]],pct(e[1],m.worked)]:null; }
function threeQ(m,pm,sc,psc){
  const tc=topCat(m);
  const q1=m.worked?"You spent <b>"+dur(m.worked)+"</b> on "+plural(m.measuredN,"task")+" with measured time"+(tc?", mostly on "+esc(tc[0].toLowerCase())+" ("+tc[1]+"%)":"")+". "+(m.n-m.measuredN>0?plural(m.n-m.measuredN,"task")+" had no time recorded.":""):"No time recorded yet in this period. Press <b>Start</b> on a task and the timer records it.";
  const q2=m.due?"You finished <b>"+m.done+" of "+m.due+"</b> tasks that were due ("+m.completion+"%)"+(m.sN?". "+m.punct+"% started on time.":"."):"No tasks were due in this period yet.";
  let q3; if(sc.overall!=null&&psc.overall!=null){ const d=sc.overall-psc.overall; q3=Math.abs(d)<2?"Steady. Your score is <b>"+sc.overall+"</b>, about the same as "+esc(prevName())+".":"Your score is <b>"+sc.overall+"</b>, "+(d>0?"up":"down")+" "+Math.abs(d)+" points from "+esc(prevName())+"."; }
  else if(m.completion!=null&&pm.completion!=null){ const d=m.completion-pm.completion; q3="Completion is "+(Math.abs(d)<2?"about the same as ":d>0?"up "+d+" points from ":"down "+(-d)+" points from ")+esc(prevName())+"."; }
  else q3="Not enough history yet. Keep using the app for a week and this answers itself.";
  return '<div class="q3">'+[["What am I doing with my time?",q1,"time"],["Am I completing what I plan?",q2,"punct"],["Am I improving?",q3,"score"]].map(([q,a,s],i)=>'<button class="q" data-dsec="'+s+'"><span class="qn">'+(i+1)+'</span><span><b class="qq">'+q+'</b><span class="qa">'+a+'</span></span></button>').join("")+'</div>'; }

/* ---------- overview ---------- */
function secOverview(){
  const [a,b]=presetRange(D.preset), m=CUR.m, pm=CUR.pm, sc=scoreOf(m,m.keys,true), psc=scoreOf(pm,pm.keys,true), st=streaks();
  const td=agg(recsIn([A.today])), soon=drillList("soon")[1].length, openN=m.pending+m.overdue;
  if(!A.hasAnyPlan()) return empty("Make your first plan and this dashboard fills in by itself. Nothing here is made up: it only shows what you plan and do.",'<button class="dbtn pri" data-dact="plan">Make my plan</button>');
  const kp=[
    kpi({label:"Tasks",value:m.n,sub:m.done+" done · "+openN+" open · "+m.missed+" missed",drill:"all"}),
    kpi({label:"Completed",value:m.done,sub:m.short?m.short+" as the short version":"of "+m.due+" that were due",drill:"done",delta:delta(m.done,pm.done,"",null)}),
    kpi({label:"Today",value:P(td.n?pct(td.done,td.n):null),sub:td.done+" of "+td.n+" planned today",drill:"today"}),
    kpi({label:"Completion rate",value:P(m.completion),sub:"Done out of tasks that were due",drill:"done",delta:delta(m.completion,pm.completion,"pts","up"),tag:"calc"}),
    kpi({label:"On time vs late",value:m.dlN?(m.dlEarly+m.dlOn)+'<small> / '+m.dlLate+'</small>':"–",sub:"Finished by the planned end, or after",drill:"late"}),
    kpi({label:"Time worked",value:m.worked?dur(m.worked):"–",sub:plural(m.measuredN,"task")+" with measured time",drill:"tracked",delta:m.worked||pm.worked?delta(m.worked,pm.worked,"min",null):"",tag:"measured"}),
    kpi({label:"Timer focus",value:m.timer?dur(m.timer):"–",sub:m.ratedMin?"Fully focused: "+dur(m.verified):"Rate your focus after a task to verify it",drill:"timer",tag:"measured"}),
    kpi({label:"Average per task",value:m.measuredN?dur(m.worked/m.measuredN):"–",sub:m.accN?"You planned "+dur(m.estSum/m.accN)+" on average":"Measured tasks only",drill:"tracked"}),
    kpi({label:"Streak",value:plural(st.cur,"day"),sub:"Longest: "+plural(st.best,"day"),drill:null}),
    kpi({label:"Punctuality",value:P(m.punct),sub:"Started on time"+(m.dlN?" · deadlines met "+m.deadline+"%":""),drill:"startlate",delta:delta(m.punct,pm.punct,"pts","up")}),
    kpi({label:"Consistency",value:P(m.cons.pct),sub:m.cons.good+" of "+plural(m.cons.plan,"day")+" at 70% or more",drill:null,delta:delta(m.cons.pct,pm.cons.pct,"pts","up")}),
    kpi({label:"Overdue now",value:td.overdue,sub:soon?soon+" more due in the next 3 hours":"Nothing else due soon",drill:td.overdue?"overdue":"soon"})
  ].join("");
  const ins=insights().slice(0,3), al=alerts().slice(0,3);
  const trend=(()=>{ const ks=clamp(add(A.today,-13),A.today); if(ks.length<2) return empty("Your trend appears after two days with a plan.");
    const rows=ks.map(k=>agg(recsIn([k]))); return chart({type:"line",title:"Completion, last 14 days",labels:ks.map(k=>DAYN[kd(k).getDay()].slice(0,2)+" "+kd(k).getDate()),tips:ks.map(niceD),xName:"Day",series:[{name:"Completion",c:COL.s1,vals:rows.map(r=>r.due?r.completion:null)}],max:100,fmt:v=>v+"%",h:170,click:i=>openDrill("day:"+ks[i])}); })();
  return threeQ(m,pm,sc,psc)+
    '<div class="ov-top">'+card("Productivity score",scoreMini(sc,psc),{cls:"sc-card",right:'<button class="dlink" data-dsec="score">How it works</button>'})+
      card("Last 14 days",trend,{right:'<button class="dlink" data-dsec="trends">All trends</button>'})+'</div>'+
    '<div class="kpis">'+kp+'</div>'+
    '<div class="two">'+card("Insights",ins.length?'<ul class="ins">'+ins.map(insHTML).join("")+'</ul>':empty("Insights appear once there's enough data. A few days of planning and timing tasks is enough."),{right:'<button class="dlink" data-dsec="insights">See all</button>'})+
      card("Needs attention",al.length?'<ul class="alerts">'+al.map(alertHTML).join("")+'</ul>':empty("All clear. Nothing needs your attention right now."),{right:'<button class="dlink" data-dsec="alerts">See all</button>'})+'</div>';
}
function scoreMini(sc,psc){ if(sc.overall==null) return empty("Your score needs a little more data: about 3 finished tasks and 2 days with a plan.");
  return '<div class="sc-hero"><div class="sc-num"><b>'+sc.overall+'</b><span>out of 100</span>'+delta(sc.overall,psc.overall,"pts","up")+'</div><div class="sc-parts">'+
    PARTS.map(([k,n])=>'<div class="sp"><span>'+n+'</span>'+(sc.parts[k]==null?'<em>No data yet</em>':'<div class="m-bar"><i style="width:'+sc.parts[k]+'%"></i></div><b>'+sc.parts[k]+'</b>')+'</div>').join("")+'</div></div>'; }

/* ---------- time tracking ---------- */
function secTime(){
  const m=CUR.m, pm=CUR.pm; if(!m.n) return empty("No tasks in this period.");
  const est=m.recs.filter(r=>r.isDone&&r.active!=null&&r.est>0&&r.active>=1).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:(a.s||0)-(b.s||0)).slice(-16);
  const sessAll=[]; m.recs.forEach(r=>r.sess.forEach(x=>sessAll.push({r,x,act:A.sessActiveMs(x,Date.now())/60000})));
  const bks=buckets(m.keys), per=bks.map(bk=>{ let tm=0,sf=0; recsIn(bk.keys).forEach(r=>{ if(r.src==="timer") tm+=r.active; else if(r.src==="startfinish") sf+=r.active; }); return [tm,sf]; });
  const byCat=["work","meal","rest"].map(c=>{ const rs=m.recs.filter(r=>r.cat===c&&r.isDone&&r.active!=null&&r.est>0); return {c,n:rs.length,act:rs.length?rs.reduce((x,r)=>x+r.active,0)/rs.length:null,est:rs.length?rs.reduce((x,r)=>x+r.est,0)/rs.length:null}; }).filter(x=>x.n);
  const totals={}; m.recs.forEach(r=>{ if(r.active==null) return; const k=norm(r.title); const t=totals[k]||(totals[k]={title:r.title,n:0,sess:0,min:0,est:0}); t.n++; t.sess+=r.sess.length; t.min+=r.active; t.est+=r.est; });
  const tot=Object.values(totals).sort((a,b)=>b.min-a.min).slice(0,10);
  const over=m.recs.filter(r=>r.isDone&&r.active!=null&&r.est>0&&r.active-r.est>=5).sort((a,b)=>(b.active-b.est)-(a.active-a.est)).slice(0,8);
  const under=m.recs.filter(r=>r.isDone&&r.active!=null&&r.est>0&&r.est-r.active>=5).sort((a,b)=>(b.est-b.active)-(a.est-a.active)).slice(0,5);
  return '<div class="kpis k6">'+
    kpi({label:"Time worked",value:m.worked?dur(m.worked):"–",sub:"Timer plus start and finish times",tag:"measured",drill:"tracked",delta:delta(m.worked,pm.worked,"min",null)})+
    kpi({label:"Timer sessions",value:sessAll.length,sub:sessAll.length?"Average "+dur(sessAll.reduce((a,s)=>a+s.act,0)/sessAll.length)+" each":"Press Start on a task to begin one",tag:"measured",drill:"timer"})+
    kpi({label:"Active vs paused",value:m.timer?dur(m.timer):"–",sub:m.timer?"Paused: "+dur(m.recs.reduce((a,r)=>a+(r.paused||0),0))+" across "+plural(m.pauses,"pause"):"Pause data comes from the timer",drill:"timer"})+
    kpi({label:"Within estimate",value:m.accN?m.within+'<small> of '+m.accN+'</small>':"–",sub:"Finished in the planned time (10% leeway)",drill:"within"})+
    kpi({label:"Took much longer",value:m.accN?m.overBig:"–",sub:"50% or more over, and at least 10 min",drill:"over"})+
    kpi({label:"Time accuracy score",value:m.accN>=3?m.accuracy:"–",sub:m.accN>=3?"Based on "+plural(m.accN,"task"):"Needs 3 finished tasks with measured time",tag:"calc"})+'</div>'+
    card("Time accuracy score, explained",'<p class="expl">For each finished task with measured time, we compare the time you spent with the time you planned. A task done exactly on estimate scores 100. Every 1% you are off, over <i>or</i> under, takes 1 point away, down to 0. The score is the average across tasks. '+
      'Tasks with no measured time or no estimate are left out, so they never pull your score down.</p>'+(m.accN?'<p class="expl"><b>This period:</b> you planned '+dur(m.estSum)+' and spent '+dur(m.actSum)+' on those '+plural(m.accN,"task")+' ('+(m.actSum>=m.estSum?"+":"&minus;")+dur(Math.abs(m.actSum-m.estSum))+').</p>':''),{tag:"calc"})+
    card("Estimated vs actual time",est.length?chart({type:"bar",title:"Estimated vs actual",labels:est.map(r=>r.title.length>10?r.title.slice(0,9)+"…":r.title),tips:est.map(r=>r.title+" · "+shortD(r.key)),xName:"Task",series:[{name:"Estimated",c:COL.s1,vals:est.map(r=>r.est)},{name:"Actual",c:COL.s2,vals:est.map(r=>Math.round(r.active))}],fmt:dur,mins:true,yfmt:v=>v+"m",tipNote:est.map(r=>{ const d=Math.round(r.active-r.est); return d===0?"Right on estimate":(d>0?d+" min longer than planned":(-d)+" min shorter than planned"); }),xw:70,h:220}):empty("Finish a task with the timer running to compare it with your estimate."),{sub:"Your last "+plural(est.length,"finished task")+" with measured time"})+
    '<div class="two">'+card("Took longer than planned",over.length?'<ul class="diffs">'+over.map(r=>'<li><span><b>'+esc(r.title)+'</b><small>'+shortD(r.key)+' · planned '+dur(r.est)+', took '+dur(r.active)+'</small></span><em class="bad">+'+dur(r.active-r.est)+'</em></li>').join("")+'</ul>':empty("Nothing ran over by 5 minutes or more."))+
      card("Took less time",under.length?'<ul class="diffs">'+under.map(r=>'<li><span><b>'+esc(r.title)+'</b><small>'+shortD(r.key)+' · planned '+dur(r.est)+', took '+dur(r.active)+'</small></span><em class="goodt">&minus;'+dur(r.est-r.active)+'</em></li>').join("")+'</ul>':empty("Nothing finished 5 or more minutes early."))+'</div>'+
    '<div class="two">'+card("Active time per "+(bks.length&&bks[0].keys.length>1?"week":"day"),m.worked?chart({type:"bar",stacked:true,title:"Active time",labels:bks.map(b=>b.label),tips:bks.map(b=>b.tip),xName:"Period",series:[{name:"Timer",c:COL.s1,vals:per.map(p=>Math.round(p[0]))},{name:"Start and finish times",c:COL.s3,vals:per.map(p=>Math.round(p[1]))}],fmt:dur,mins:true,yfmt:v=>v>=60?(v%60?Math.round(v/60*10)/10:v/60)+"h":v+"m",click:i=>openDrill("keys:"+bks[i].keys[0]+","+bks[i].keys[bks[i].keys.length-1])}):empty("No measured time in this period."))+
      card("Average time by type",byCat.length?'<table class="dt small"><thead><tr><th>Type</th><th>Tasks</th><th>Planned</th><th>Actual</th><th>Difference</th></tr></thead><tbody>'+byCat.map(x=>'<tr><td><button class="dlink" data-ddrill="cat:'+x.c+'">'+CATN[x.c]+'</button></td><td>'+x.n+'</td><td>'+dur(x.est)+'</td><td>'+dur(x.act)+'</td><td>'+(x.act>=x.est?"+":"&minus;")+dur(Math.abs(x.act-x.est))+'</td></tr>').join("")+'</tbody></table>':empty("Needs finished tasks with measured time."))+'</div>'+
    card("Time per task",tot.length?'<div class="tscroll"><table class="dt"><thead><tr><th>Task</th><th>Times done</th><th>Timer sessions</th><th>Total time</th><th>Planned total</th></tr></thead><tbody>'+tot.map(t=>'<tr><td class="tn"><button class="dlink" data-ddrill="title:'+esc(norm(t.title))+'">'+esc(t.title)+'</button></td><td>'+t.n+'</td><td>'+t.sess+'</td><td><b>'+dur(t.min)+'</b></td><td>'+dur(t.est)+'</td></tr>').join("")+'</tbody></table></div>':empty("No measured time yet."),{sub:"Total across every session, grouped by task name"});
}

/* ---------- focus ---------- */
function hourMinutes(segs){ const h=new Array(24).fill(0); segs.forEach(s=>{ let a=s.a; while(a<s.b){ const d=new Date(a), nx=new Date(d.getFullYear(),d.getMonth(),d.getDate(),d.getHours()+1).getTime(), e=Math.min(nx,s.b); h[d.getHours()]+=(e-a)/60000; a=e; } }); return h.map(v=>Math.round(v)); }
function secFocus(){
  const m=CUR.m, pm=CUR.pm, c=cfg();
  if(!m.timedN) return card("Focus",empty("Focus data comes from the task timer. Press <b>Start</b> on a task, use <b>Pause</b> when you step away, and tap how focused you were when you finish. Your focus numbers start from there."));
  const notRated=m.timer-m.ratedMin, low=m.ratedMin-m.verified-m.partly;
  const hrs=hourMinutes(m.segs), bks=buckets(m.keys), fb=bks.map(bk=>agg(recsIn(bk.keys)));
  const deepDays=m.cons.plan?m.keys.filter(k=>agg(recsIn([k])).deepN>0).length:0;
  const doneTimed=m.recs.filter(r=>r.isDone&&r.src==="timer").length;
  const bar=(v,n,cls)=>v>0?'<i class="'+cls+'" style="flex:'+v+'" title="'+esc(n+": "+dur(v))+'"></i>':'';
  return '<div class="kpis k6">'+
    kpi({label:"Timer focus time",value:dur(m.timer),sub:"Active time with the timer running",tag:"measured",drill:"timer",delta:delta(m.timer,pm.timer,"min",null)})+
    kpi({label:"Verified focus",value:m.ratedMin?dur(m.verified):"–",sub:m.ratedMin?"Time on tasks you rated fully focused":"Rate your focus after a timed task",tag:"self",drill:"verified"})+
    kpi({label:"Focus sessions",value:m.segN,sub:"Uninterrupted stretches of 1 min or more",tag:"measured"})+
    kpi({label:"Average stretch",value:dur(m.segAvg),sub:"Longest: "+dur(m.segMax)})+
    kpi({label:"Deep work",value:m.deepN,sub:"Stretches of "+c.deep+" min or more · "+dur(m.deepMin)})+
    kpi({label:"Interruptions",value:m.pauses+m.intr,sub:plural(m.pauses,"pause")+" · "+m.intr+" “Got distracted”"})+'</div>'+
    card("Timer time is not the same as focus",'<p class="expl">A running timer only proves the task was open. So we split timer time by what you told us after each task. Only <b>Fully focused</b> counts as verified focus.</p>'+
      '<div class="fbar">'+bar(m.verified,"Fully focused","f3")+bar(m.partly,"Partly focused","f2")+bar(low,"Not really focused","f1")+bar(notRated,"Not rated","f0")+'</div>'+
      '<div class="ch-leg"><span><i class="sq" style="--c:var(--c1)"></i>Fully '+dur(m.verified)+'</span><span><i class="sq" style="--c:var(--c3)"></i>Partly '+dur(m.partly)+'</span><span><i class="sq" style="--c:var(--c2)"></i>Not really '+dur(low)+'</span><span><i class="sq" style="--c:var(--neutral)"></i>Not rated '+dur(notRated)+'</span></div>'+
      '<p class="fine">'+plural(doneTimed,"task")+' finished with the timer. Deep work days: '+deepDays+' of '+plural(m.cons.plan||m.keys.length,"day")+'. HV Reset has no Pomodoro timer; the 5-minute restart in “Got distracted” is counted as an interruption.</p>')+
    '<div class="two">'+card("When you focus",chart({type:"bar",title:"Focus minutes by hour",labels:hrs.map((_,i)=>i%3===0?(i%12||12)+(i<12?"a":"p"):""),tips:hrs.map((_,i)=>A.fmt(i*60)+" – "+A.fmt(i*60+59)),xName:"Hour",series:[{name:"Timer minutes",c:COL.s1,vals:hrs}],fmt:v=>dur(v),mins:true,yfmt:v=>v>=60?(v%60?Math.round(v/60*10)/10:v/60)+"h":v+"m",xw:18,bw:14}),{sub:"Minutes with the timer running, by hour of day"})+
      card("Focus trend",chart({type:"line",title:"Focus trend",labels:bks.map(b=>b.label),tips:bks.map(b=>b.tip),xName:"Period",series:[{name:"Timer time",c:COL.s1,vals:fb.map(x=>Math.round(x.timer))},{name:"Verified focus",c:COL.s2,vals:fb.map(x=>Math.round(x.verified))}],fmt:dur,mins:true,yfmt:v=>v>=60?(v%60?Math.round(v/60*10)/10:v/60)+"h":v+"m"}))+'</div>';
}

/* ---------- punctuality, deadlines, delays ---------- */
function hbars(rows,fmt){ const max=Math.max(1,...rows.map(r=>r.v)); return '<ul class="hb">'+rows.map(r=>'<li'+(r.drill?' data-ddrill="'+r.drill+'" tabindex="0" role="button"':'')+'><span class="hb-l">'+(r.icon?'<em class="hb-i">'+r.icon+'</em>':'')+esc(r.label)+'</span><span class="hb-b"><i style="width:'+Math.round(r.v/max*100)+'%;background:'+(r.c||COL.s1)+'"></i></span><b>'+(fmt?fmt(r.v):r.v)+'</b></li>').join("")+'</ul>'; }
function moveStats(keys){ const byT={}; recsIn(keys).forEach(r=>{ if(r.status!=="moved") return; const k=norm(r.title); const t=byT[k]||(byT[k]={title:r.title,n:0,days:new Set()}); t.n++; t.days.add(r.key); }); return Object.values(byT).sort((a,b)=>b.n-a.n); }
function dayPushes(keys){ let n=0,min=0; keys.forEach(k=>{ const d=ST().days[k]; (d&&d.shifts||[]).forEach(s=>{ if(s.by>0){ n++; min+=s.by; } }); }); return {n,min}; }
function delayPatterns(m){ const out=[];
  const mv=moveStats(m.keys).filter(t=>t.n>=2); if(mv.length) out.push(["Moved more than once",plural(mv.length,"task")+" moved on 2 or more days: "+mv.slice(0,3).map(t=>"“"+esc(t.title)+"” ("+t.n+"×)").join(", ")+".","A task that keeps moving may be too big or unclear. Try splitting it into a 25-minute first step."]);
  if(m.sN>=5&&m.sLate/m.sN>=.4) out.push(["Late starts are common",pct(m.sLate,m.sN)+"% of started tasks began more than 5 minutes after the planned time, on average "+dur(m.sLateSum/m.sLate)+" late.","If mornings run late, plan the first task 15–30 minutes later. It's a planning fix, not a discipline one."]);
  const mustLeft=m.recs.filter(r=>r.core&&(r.status==="missed"||r.status==="overdue")).length; if(mustLeft>=2) out.push(["Must-do tasks left undone",plural(mustLeft,"must-do task")+" were not finished or moved.","Put must-do tasks at the start of your day, when fewer things get in the way."]);
  const notStarted=m.recs.filter(r=>r.status==="missed"&&!r.startAt).length; if(notStarted>=3) out.push(["Missed without starting",plural(notStarted,"task")+" passed their time without being started.","These might be too many for one day, or planned at the wrong time."]);
  return out; }
function secPunct(){
  const m=CUR.m, pm=CUR.pm; if(!m.n) return empty("No tasks in this period.");
  const bks=buckets(m.keys), pb=bks.map(bk=>agg(recsIn(bk.keys))), mv=moveStats(m.keys), push=dayPushes(m.keys), pats=delayPatterns(m);
  return '<div class="kpis k6">'+
    kpi({label:"Deadline adherence",value:P(m.deadline),sub:m.dlN?(m.dlEarly+m.dlOn)+" of "+m.dlN+" finished by the planned end":"No finished tasks yet",drill:"ontime",delta:delta(m.deadline,pm.deadline,"pts","up"),tag:"calc"})+
    kpi({label:"Started on time",value:P(m.punct),sub:m.sN?(m.sEarly+m.sOn)+" of "+m.sN+" started within 5 min":"No started tasks yet",drill:"startlate",delta:delta(m.punct,pm.punct,"pts","up")})+
    kpi({label:"Average late start",value:m.sLate?dur(m.sLateSum/m.sLate):"–",sub:"Only tasks that started late",drill:"startlate"})+
    kpi({label:"Average finish delay",value:m.dlLate?dur(m.dlLateSum/m.dlLate):"–",sub:"Only tasks finished after the planned end",drill:"late"})+
    kpi({label:"Moved or skipped",value:m.moved,sub:m.movedBefore+" before its time · "+m.movedAfter+" after",drill:"moved"})+
    kpi({label:"Overdue or missed",value:m.overdue+m.missed,sub:m.overdue+" overdue today · "+m.missed+" missed",drill:"missed"})+'</div>'+
    '<div class="two">'+card("Finishing against the planned end",m.dlN||m.missed||m.overdue?hbars([
      {label:"Before the end",v:m.dlEarly,c:COL.good,icon:"&#10003;",drill:"ontime"},{label:"Right on time (±5 min)",v:m.dlOn,c:COL.good,icon:"&#10003;",drill:"ontime"},
      {label:"After the end",v:m.dlLate,c:COL.warn,icon:"!",drill:"late"},{label:"Still overdue",v:m.overdue,c:COL.crit,icon:"!",drill:"overdue"},{label:"Missed",v:m.missed,c:COL.crit,icon:"&#10005;",drill:"missed"},
      {label:"Moved on purpose",v:m.moved,c:COL.gray,icon:"&#8631;",drill:"moved"}]):empty("Nothing due yet."),{sub:"The planned end time of each task is its deadline"})+
      card("Starting against the plan",m.sN?hbars([{label:"Early",v:m.sEarly,c:COL.s1},{label:"On time (±5 min)",v:m.sOn,c:COL.good,icon:"&#10003;"},{label:"Late",v:m.sLate,c:COL.warn,icon:"!",drill:"startlate"}]):empty("Start a task with the Start button to record when you begin."),{sub:"Compared with the time you first planned, before any moves"})+'</div>'+
    card("On-time trend",chart({type:"line",title:"On-time trend",labels:bks.map(b=>b.label),tips:bks.map(b=>b.tip),xName:"Period",series:[{name:"Deadline adherence",c:COL.s1,vals:pb.map(x=>x.dlN?x.deadline:null)},{name:"Started on time",c:COL.s2,vals:pb.map(x=>x.sN?x.punct:null)}],max:100,fmt:v=>v+"%"}))+
    '<div class="two">'+card("Rescheduling",(mv.length?'<table class="dt small"><thead><tr><th>Task</th><th>Times moved</th></tr></thead><tbody>'+mv.slice(0,8).map(t=>'<tr><td class="tn"><button class="dlink" data-ddrill="title:'+esc(norm(t.title))+'">'+esc(t.title)+'</button></td><td>'+t.n+(t.n>=2?' <span class="st st-overdue">! repeated</span>':'')+'</td></tr>').join("")+'</tbody></table>':empty("No tasks were moved or skipped."))+
        '<p class="fine">You pushed your whole day later '+plural(push.n,"time")+(push.n?" (total "+dur(push.min)+")":"")+'. '+(m.movedUnknown?m.movedUnknown+" older moves were recorded before timing was tracked, so we can't tell if they were before or after the deadline.":"")+'</p>')+
      card("Delay patterns",pats.length?'<ul class="ins">'+pats.map(p=>'<li><b>'+p[0]+'</b><p>'+p[1]+'</p><p class="sug">&#128161; '+p[2]+'</p></li>').join("")+'</ul>':empty("No repeating delay patterns. Normal ups and downs are not flagged."),{sub:"Patterns only, never a judgement. A missed deadline, a task you moved on purpose, and a free-time block with no deadline are counted separately."})+'</div>';
}

/* ---------- day timeline ---------- */
const CATC={work:COL.s1,meal:COL.s2,rest:COL.s3};
function secTimeline(){
  const [a,b]=presetRange(D.preset); let k=D.day||(b>A.today?A.today:b); if(k>A.today) k=A.today; D.day=k;
  const rs=recsOf(k).filter(r=>r.counted&&pass(r)), base=dayMs(k), isT=k===A.today;
  const nav='<div class="dnav"><button class="dround" data-dday="'+add(k,-1)+'" aria-label="Day before">&lsaquo;</button><b>'+(isT?"Today, ":"")+esc(niceD(k))+'</b><button class="dround" data-dday="'+add(k,1)+'" aria-label="Day after"'+(k>=A.today?" disabled":"")+'>&rsaquo;</button>'+(isT?"":'<button class="dchip" data-dday="'+A.today+'">Today</button>')+'<label class="dsw"><input type="checkbox" data-dzoom'+(D.zoom?" checked":"")+'> Zoom to my day</label></div>';
  if(!rs.length) return nav+card("Timeline",empty("Nothing was planned on this day."));
  const items=[]; let lo=0, hi=1440;
  if(D.zoom){ const ts=[]; rs.forEach(r=>{ if(r.s!=null) ts.push(r.s,r.e); r.segs.forEach(s=>{ ts.push((s.a-base)/60000,(s.b-base)/60000); }); if(r.doneAt) ts.push((r.doneAt-base)/60000); });
    lo=Math.max(0,Math.floor((Math.min(...ts)-30)/60)*60); hi=Math.min(1440,Math.ceil((Math.max(...ts)+30)/60)*60); if(hi-lo<180) hi=Math.min(1440,lo+180); }
  const id="tl"+(++chN);
  CH[id]={items,noTable:true,draw:(W)=>{ const L=78,R=10,iw=W-L-R, x=m=>L+(Math.max(lo,Math.min(hi,m))-lo)/(hi-lo)*iw, H=150; items.length=0;
    let g=""; const step=(hi-lo)>720?180:(hi-lo)>360?60:30; for(let m=lo;m<=hi;m+=step){ g+='<line class="grid" x1="'+x(m)+'" x2="'+x(m)+'" y1="18" y2="'+(H-22)+'"/><text class="xt" x="'+x(m)+'" y="'+(H-6)+'">'+esc(A.fmt(m%1440).replace(":00",""))+'</text>'; }
    let mk='<text class="lane" x="4" y="42">Planned</text><text class="lane" x="4" y="92">Recorded</text>';
    rs.forEach(r=>{ if(r.s==null) return; const x0=x(r.s), w=Math.max(2,x(r.e)-x0-2); const i=items.push({t:r.title,l:["Planned "+A.fmt(r.s)+" – "+A.fmt(r.e)+" ("+dur(r.est)+")",statusName(r)]})-1;
      mk+='<rect class="pb" x="'+x0+'" y="26" width="'+w+'" height="26" rx="5" style="fill:'+CATC[r.cat]+'" data-ch="'+id+'" data-i="'+i+'" tabindex="0"/>'+(w>60?'<text class="bl" x="'+(x0+6)+'" y="43">'+esc(r.title.length>w/7?r.title.slice(0,Math.floor(w/7)-1)+"…":r.title)+'</text>':''); });
    rs.forEach(r=>{ r.segs.forEach(s=>{ const a1=(s.a-base)/60000, b1=(s.b-base)/60000, x0=x(a1), w=Math.max(2,x(b1)-x0);
        const i=items.push({t:r.title,l:[(r.src==="timer"?"Timer: ":"From start and finish: ")+hm(s.a)+" – "+hm(s.b),dur(b1-a1)+" active"]})-1;
        mk+='<rect x="'+x0+'" y="76" width="'+w+'" height="26" rx="5" style="fill:'+CATC[r.cat]+'" class="'+(r.src==="timer"?"rec":"rec est")+'" data-ch="'+id+'" data-i="'+i+'" tabindex="0"/>'; });
      if(r.doneAt&&!r.segs.length){ const dm=(r.doneAt-base)/60000; const i=items.push({t:r.title,l:["Marked done at "+hm(r.doneAt),"No timer, so no time recorded"]})-1; mk+='<g data-ch="'+id+'" data-i="'+i+'" tabindex="0"><circle cx="'+x(dm)+'" cy="89" r="6" class="dmark"/><path d="M'+(x(dm)-3)+',89l2,2.5 4-5" class="dtick"/></g>'; } });
    if(isT){ const n=nowMin(); if(n>=lo&&n<=hi) mk+='<line class="nowl" x1="'+x(n)+'" x2="'+x(n)+'" y1="16" y2="'+(H-22)+'"/><text class="nowt" x="'+x(n)+'" y="12">Now</text>'; }
    return '<svg width="'+W+'" height="'+H+'" role="img" aria-label="Timeline for '+esc(niceD(k))+'">'+g+mk+'</svg>'; }};
  const pl=rs.filter(r=>r.s!=null).sort((x,y)=>x.s-y.s), gaps=[], overl=[];
  for(let i=1;i<pl.length;i++){ const g=pl[i].s-pl[i-1].e; if(g>=10) gaps.push([pl[i-1],pl[i],g]); if(g<0) overl.push([pl[i-1],pl[i],-g]); }
  const recMin=rs.reduce((x,r)=>x+(r.active||0),0), planMin=rs.reduce((x,r)=>x+r.est,0);
  const table='<div class="tscroll"><table class="dt"><thead><tr><th>Task</th><th>Planned</th><th>Actual start</th><th>Finished</th><th>Time spent</th><th>Difference</th></tr></thead><tbody>'+pl.concat(rs.filter(r=>r.s==null)).map(r=>'<tr><td class="tn">'+esc(r.title)+'</td><td>'+(r.s!=null?A.fmt(r.s)+" – "+A.fmt(r.e):"–")+'</td><td>'+(r.startAt?hm(r.startAt):"–")+'</td><td>'+(r.doneAt?hm(r.doneAt):'<span class="st st-'+r.status+'">'+esc(statusName(r))+'</span>')+'</td><td>'+(r.active!=null?dur(r.active):"Not recorded")+'</td><td>'+(r.active!=null&&r.isDone?(r.active>=r.est?"+":"&minus;")+dur(Math.abs(r.active-r.est)):"–")+'</td></tr>').join("")+'</tbody></table></div>';
  const hrs=D.hour==="minutes"?hourMinutes(CUR.m.segs):(()=>{ const h=new Array(24).fill(0); CUR.m.recs.forEach(r=>{ if(r.doneAt) h[new Date(r.doneAt).getHours()]++; }); return h; })();
  return nav+card("24-hour timeline",'<div class="ch-leg"><span><i class="sq" style="--c:var(--c1)"></i>Work</span><span><i class="sq" style="--c:var(--c2)"></i>Meals</span><span><i class="sq" style="--c:var(--c3)"></i>Breaks</span><span><i class="sq hatch"></i>From start and finish only</span></div><div class="ch-box" data-chbox="'+id+'" style="height:150px"></div>'+
      '<p class="fine">Top row is what you planned. Bottom row is what was recorded by the timer. Planned time is never shown as work you did.</p>',{sub:"Planned "+dur(planMin)+" · recorded "+(recMin?dur(recMin):"nothing")})+
    '<div class="two">'+card("Gaps and overlaps",(gaps.length||overl.length)?'<ul class="diffs">'+gaps.map(([p,n,g])=>'<li><span><b>'+dur(g)+' free</b><small>Between “'+esc(p.title)+'” and “'+esc(n.title)+'”, '+A.fmt(p.e)+' – '+A.fmt(n.s)+'</small></span></li>').join("")+overl.map(([p,n,g])=>'<li><span><b>'+dur(g)+' overlap</b><small>“'+esc(p.title)+'” runs into “'+esc(n.title)+'”</small></span><em class="bad">!</em></li>').join("")+'</ul>':empty("No gaps of 10 minutes or more, and no overlaps."))+
      card("Your productive hours",chart({type:"bar",title:"Productive hours",labels:hrs.map((_,i)=>i%3===0?(i%12||12)+(i<12?"a":"p"):""),tips:hrs.map((_,i)=>A.fmt(i*60)+" – "+A.fmt(i*60+59)),xName:"Hour",series:[{name:D.hour==="minutes"?"Timer minutes":"Tasks finished",c:COL.s1,vals:hrs}],fmt:D.hour==="minutes"?dur:String,mins:D.hour==="minutes",int:D.hour!=="minutes",yfmt:D.hour==="minutes"?(v=>v>=60?(v%60?Math.round(v/60*10)/10:v/60)+"h":v+"m"):String,xw:18,bw:14}),{sub:periodName()+", all days",right:'<div class="seg"><button data-dhour="minutes" aria-pressed="'+(D.hour==="minutes")+'">Minutes</button><button data-dhour="done" aria-pressed="'+(D.hour==="done")+'">Tasks finished</button></div>'})+'</div>'+
    card("Planned vs actual",table);
}

/* ---------- trends ---------- */
function secTrends(){
  const m=CUR.m; if(m.keys.length<2) return empty("Trends need at least 2 days. Pick a longer period at the top, like Last 30 days.");
  const bks=buckets(m.keys), rows=bks.map(bk=>agg(recsIn(bk.keys))), L=bks.map(b=>b.label), T=bks.map(b=>b.tip);
  const clk=st=>i=>openDrill("keys:"+bks[i].keys[0]+","+bks[i].keys[bks[i].keys.length-1]+(st?","+st:""));
  const hmin=v=>v>=60?(v%60?Math.round(v/60*10)/10:v/60)+"h":v+"m";
  const wd=[1,2,3,4,5,6,0].map(d=>{ const ks=m.keys.filter(k=>kd(k).getDay()===d), a=agg(recsIn(ks)); return {d,n:ks.length,c:a.due?a.completion:null}; });
  const byP=[["Must do",m.recs.filter(r=>r.core)],["Flexible",m.recs.filter(r=>!r.core)]].concat(["work","meal","rest"].map(c=>[CATN[c],m.recs.filter(r=>r.cat===c)])).map(([n,rs])=>{ const a=agg(rs); return {label:n+" ("+a.due+")",v:a.due?a.completion:0,has:a.due}; }).filter(x=>x.has);
  return '<div class="two">'+card("Completion rate",chart({type:"line",title:"Completion rate",labels:L,tips:T,xName:"Period",series:[{name:"Completion",c:COL.s1,vals:rows.map(r=>r.due?r.completion:null)}],max:100,fmt:v=>v+"%",click:clk()}),{sub:"Done out of tasks that were due. Gaps are days with nothing due."})+
      card("Task outcomes",chart({type:"bar",stacked:true,title:"Task outcomes",labels:L,tips:T,xName:"Period",series:[{name:"Done",c:COL.good,vals:rows.map(r=>r.done)},{name:"Moved",c:COL.warn,vals:rows.map(r=>r.moved)},{name:"Missed or overdue",c:COL.crit,vals:rows.map(r=>r.missed+r.overdue)},{name:"Still open",c:COL.gray,vals:rows.map(r=>r.pending)}],int:true,click:clk()}),{sub:"Click a bar to see its tasks"})+'</div>'+
    '<div class="two">'+card("Workload vs completed",chart({type:"bar",title:"Workload vs completed",labels:L,tips:T,xName:"Period",series:[{name:"Planned",c:COL.s1,vals:rows.map(r=>r.plannedMin)},{name:"Completed",c:COL.s2,vals:rows.map(r=>r.doneMin)}],fmt:dur,mins:true,yfmt:hmin,click:clk()}),{sub:"Planned minutes vs minutes of tasks you finished"})+
      card("Estimated vs actual",chart({type:"bar",title:"Estimated vs actual",labels:L,tips:T,xName:"Period",series:[{name:"Estimated",c:COL.s1,vals:rows.map(r=>r.estSum)},{name:"Actual",c:COL.s2,vals:rows.map(r=>Math.round(r.actSum))}],fmt:dur,mins:true,yfmt:hmin}),{sub:"Only finished tasks with measured time"})+'</div>'+
    '<div class="two">'+card("Focus time",chart({type:"line",title:"Focus time",labels:L,tips:T,xName:"Period",series:[{name:"Timer time",c:COL.s1,vals:rows.map(r=>Math.round(r.timer))},{name:"Verified focus",c:COL.s2,vals:rows.map(r=>Math.round(r.verified))}],fmt:dur,mins:true,yfmt:hmin}))+
      card("Punctuality",chart({type:"line",title:"Punctuality",labels:L,tips:T,xName:"Period",series:[{name:"Deadlines met",c:COL.s1,vals:rows.map(r=>r.dlN?r.deadline:null)},{name:"Started on time",c:COL.s2,vals:rows.map(r=>r.sN?r.punct:null)}],max:100,fmt:v=>v+"%"}))+'</div>'+
    '<div class="two">'+card("By priority and type",byP.length?hbars(byP,v=>v+"%"):empty("Nothing due yet."),{sub:"Completion rate. Number of due tasks in brackets."})+
      card("By weekday",chart({type:"bar",title:"Completion by weekday",labels:wd.map(w=>DAYN[w.d]),tips:wd.map(w=>DAYN[w.d]+" ("+plural(w.n,"day")+")"),xName:"Weekday",series:[{name:"Completion",c:COL.s1,vals:wd.map(w=>w.c)}],max:100,fmt:v=>v==null?"–":v+"%"}),{sub:"Completion rate for each day of the week"})+'</div>'+
    card("How often you reschedule",chart({type:"bar",title:"Moved or skipped tasks",labels:L,tips:T,xName:"Period",series:[{name:"Moved or skipped",c:COL.s1,vals:rows.map(r=>r.moved)}],int:true,click:clk("moved"),h:150}))+
    '<p class="fine center">The productivity heatmap is under <button class="dlink" data-dsec="calendar">Calendar</button>.</p>';
}

/* ---------- calendar heatmap ---------- */
const HEAT={completion:["Completion",d=>d.due?d.completion:null,v=>v+"%",[1,25,50,75,90]],done:["Tasks done",d=>d.n?d.done:null,String,null],time:["Time worked",d=>d.n?Math.round(d.worked):null,dur,null],focus:["Verified focus",d=>d.n?Math.round(d.verified):null,dur,null]};
function secCalendar(){
  const mk=D.cal||monthStart(A.today); D.cal=mk; const f=A.firstDay(), start=weekStart(mk), end=add(weekStart(monthEnd(mk)),6), ks=span(start,end);
  const [name,get,fmt,fixed]=HEAT[D.heat]; const vals={}; ks.forEach(k=>{ if(k<f||k>A.today) return; const a=agg(recsIn([k])); vals[k]=get(a); });
  const nums=Object.values(vals).filter(v=>v!=null&&v>0), mx=Math.max(1,...nums);
  const edges=fixed||[1,mx*.25,mx*.5,mx*.75,mx*.95]; const bin=v=>v==null?-1:v<=0?0:edges.filter(e=>v>=e).length;
  const sel=D.calSel&&D.calSel>=start&&D.calSel<=end?D.calSel:null;
  const grid='<div class="heat" role="grid">'+["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=>'<span class="hd">'+d+'</span>').join("")+ks.map(k=>{ const v=vals[k], b=bin(v), inM=k.slice(0,7)===mk.slice(0,7);
    return '<button class="hc h'+b+(inM?"":" out")+(k===A.today?" now":"")+(k===sel?" sel":"")+'" data-dcal="'+k+'" aria-label="'+esc(niceD(k)+": "+(v==null?"no data":name+" "+fmt(v)))+'"'+(k>A.today?" disabled":"")+'><span>'+kd(k).getDate()+'</span>'+(v!=null&&v>0?'<small>'+esc(fmt(v))+'</small>':'')+'</button>'; }).join("")+'</div>';
  const legend='<div class="hl"><span>Less</span>'+[0,1,2,3,4,5].map(i=>'<i class="h'+i+'"></i>').join("")+'<span>More</span><span class="hl-n"><i class="h-1"></i>No plan or no data</span></div>';
  const [y,mo]=mk.split("-").map(Number), prevM=monthStart(add(mk,-1)), nextM=add(monthEnd(mk),1);
  const head='<div class="dnav"><button class="dround" data-dcalm="'+prevM+'" aria-label="Previous month">&lsaquo;</button><b>'+MONTHS[mo-1]+' '+y+'</b><button class="dround" data-dcalm="'+nextM+'" aria-label="Next month"'+(nextM>A.today?" disabled":"")+'>&rsaquo;</button><div class="seg">'+Object.keys(HEAT).map(h=>'<button data-dheat="'+h+'" aria-pressed="'+(D.heat===h)+'">'+HEAT[h][0]+'</button>').join("")+'</div></div>';
  return head+'<div class="cal-wrap">'+card(name+" by day",grid+legend,{sub:D.heat==="completion"?"Share of due tasks you finished each day":D.heat==="focus"?"Timer time on tasks you rated fully focused":D.heat==="time"?"Measured time on tasks":"Number of tasks you finished"})+(sel?dayDetail(sel):card("Pick a day",empty("Click a day to see what you finished, what's left, time tracked, focus and punctuality.")))+'</div>';
}
function dayDetail(k){ const rs=recsIn([k]), a=agg(rs), done=rs.filter(r=>r.isDone), left=rs.filter(r=>!r.isDone);
  return card(esc(niceD(k)),'<div class="mini-tiles"><div><b>'+a.done+'<small>/'+a.n+'</small></b><span>Done</span></div><div><b>'+P(a.completion)+'</b><span>Completion</span></div><div><b>'+(a.worked?dur(a.worked):"–")+'</b><span>Time worked</span></div><div><b>'+a.segN+'</b><span>Focus sessions</span></div><div><b>'+P(a.punct)+'</b><span>Started on time</span></div><div><b>'+P(a.deadline)+'</b><span>Deadlines met</span></div></div>'+
    '<p class="dc-sum">'+daySummary(k,a)+'</p>'+
    (done.length?'<h4>Completed</h4><ul class="plain">'+done.map(r=>'<li>&#10003; '+esc(r.title)+(r.doneAt?' <small>at '+hm(r.doneAt)+'</small>':'')+(r.active!=null?' <small>· '+dur(r.active)+'</small>':'')+'</li>').join("")+'</ul>':'')+
    (left.length?'<h4>Not finished</h4><ul class="plain">'+left.map(r=>'<li>'+statusIcon(r)+' '+esc(r.title)+' <small>'+esc(statusName(r))+'</small></li>').join("")+'</ul>':'')+
    '<div class="dact"><button class="dbtn" data-dgo="'+k+'|">Open this day</button><button class="dbtn" data-ddrill="day:'+k+'">All tasks</button></div>'); }
function daySummary(k,a){ if(!a.n) return "Nothing was planned.";
  const s=[]; s.push(a.done===a.n?"Every planned task done.":a.done+" of "+plural(a.n,"task")+" done.");
  if(a.worked) s.push(dur(a.worked)+" of measured work"+(a.verified?", "+dur(a.verified)+" of it fully focused":"")+".");
  if(a.sN) s.push(a.sOn+a.sEarly===a.sN?"Every task started on time.":a.sLate+" started late.");
  if(a.moved) s.push(plural(a.moved,"task")+" moved."); return s.join(" "); }

/* ---------- workload ---------- */
function secWorkload(){
  const c=cfg(), t=A.today, next=span(t,add(t,13)), load=next.map(k=>{ const rs=recsOf(k).filter(r=>r.counted&&pass(r)&&(k>t||!r.isDone&&r.status!=="moved")); return {k,min:rs.reduce((x,r)=>x+r.est,0),n:rs.length,must:rs.filter(r=>r.core).length,rs}; });
  const over=load.filter(l=>l.min>c.capacity);
  const nm=nowMin(), todayLeft=recsOf(t).filter(r=>r.counted&&pass(r)&&!r.isDone&&r.status!=="moved"), leftMin=todayLeft.reduce((x,r)=>x+r.est,0), dayLeft=Math.max(0,24*60-nm);
  const wk=load.slice(0,7).flatMap(l=>l.rs), must=wk.filter(r=>r.core).length, catMin={}; wk.forEach(r=>{ catMin[r.cat]=(catMin[r.cat]||0)+r.est; });
  const m=CUR.m, remain=m.pending+m.overdue;
  const hist=recsIn(clamp(add(t,-59),t),true), byT={}; hist.forEach(r=>{ if(!(r.isDone&&r.active!=null&&r.est>0)) return; const k=norm(r.title); (byT[k]=byT[k]||{title:r.title,est:r.est,ratios:[],acts:[]}).ratios.push(r.active/r.est); byT[k].acts.push(r.active); byT[k].est=r.est; });
  const unreal=Object.values(byT).filter(x=>x.ratios.length>=3).map(x=>({...x,ratio:median(x.ratios),act:median(x.acts)})).filter(x=>x.ratio>=1.4||x.ratio<=.6).sort((a,b)=>Math.abs(Math.log(b.ratio))-Math.abs(Math.log(a.ratio)));
  const longPend=recsIn(clamp(add(t,-29),t),true), missedBy={}; longPend.forEach(r=>{ if(r.status==="missed"||r.status==="moved"){ const k=norm(r.title); (missedBy[k]=missedBy[k]||{title:r.title,n:0,last:r.key}).n++; } });
  const stuck=Object.values(missedBy).filter(x=>x.n>=3).sort((a,b)=>b.n-a.n);
  return '<div class="kpis k6">'+
    kpi({label:"Left today",value:dur(leftMin),sub:plural(todayLeft.length,"task")+" · "+dur(dayLeft)+" left in the day",drill:"open"})+
    kpi({label:"Next 7 days",value:dur(load.slice(0,7).reduce((x,l)=>x+l.min,0)),sub:plural(wk.length,"task")+" planned"})+
    kpi({label:"Must do vs flexible",value:must+'<small> / '+(wk.length-must)+'</small>',sub:"Next 7 days",drill:"must"})+
    kpi({label:"Overloaded days",value:over.length,sub:"Over your "+dur(c.capacity)+" daily limit"})+
    kpi({label:"Done vs remaining",value:m.done+'<small> / '+remain+'</small>',sub:periodName(),drill:"open"})+
    kpi({label:"Overdue now",value:recsIn([t]).filter(r=>r.status==="overdue").length,sub:"Planned end has passed",drill:"overdue"})+'</div>'+
    card("Upcoming workload",chart({type:"bar",title:"Planned hours, next 14 days",labels:load.map((l,i)=>i===0?"Today":DAYN[kd(l.k).getDay()].slice(0,2)+" "+kd(l.k).getDate()),tips:load.map(l=>niceD(l.k)+" · "+plural(l.n,"task")+(l.must?", "+l.must+" must do":"")),xName:"Day",series:[{name:"Planned",c:COL.s1,vals:load.map(l=>l.min)}],fmt:dur,mins:true,yfmt:v=>v>=60?(v%60?Math.round(v/60*10)/10:v/60)+"h":v+"m",ref:{v:c.capacity,label:"Your limit "+dur(c.capacity)},click:i=>openDrill("day:"+load[i].k)}),
      {sub:"Today shows only what's left. Days without their own plan use your daily plan.",right:'<div class="stepper"><span>Daily limit</span><button data-dcap="-30" aria-label="Lower">&minus;</button><b>'+dur(c.capacity)+'</b><button data-dcap="30" aria-label="Raise">+</button></div>'})+
    '<div class="two">'+card("Workload by type, next 7 days",Object.keys(catMin).length?hbars(Object.entries(catMin).map(([k,v])=>({label:CATN[k],v,c:CATC[k],drill:"cat:"+k})),dur):empty("Nothing planned."))+
      card("Overloaded days",over.length?'<ul class="diffs">'+over.map(l=>'<li><span><b>'+esc(niceD(l.k))+'</b><small>'+plural(l.n,"task")+', '+dur(l.min)+' planned</small></span><em class="bad">+'+dur(l.min-c.capacity)+'</em></li>').join("")+'</ul><div class="dact"><button class="dbtn" data-dact="plan">Edit my plan</button></div>':empty("No day in the next two weeks is over your limit."))+'</div>'+
    '<div class="two">'+card("Estimates that don't match reality",unreal.length?'<ul class="diffs">'+unreal.map(x=>'<li><span><b>'+esc(x.title)+'</b><small>Planned '+dur(x.est)+', usually takes '+dur(x.act)+' ('+x.ratios.length+' times)</small></span><em class="'+(x.ratio>1?"bad":"goodt")+'">'+(x.ratio>1?"×"+(Math.round(x.ratio*10)/10):"½")+'</em></li>').join("")+'</ul><p class="fine">Based on the last 60 days, needs 3 or more measured times.</p>':empty("No task is consistently far from its estimate. Needs 3 measured runs of the same task."))+
      card("Keeps getting left",stuck.length?'<ul class="diffs">'+stuck.map(x=>'<li><span><b><button class="dlink" data-ddrill="title:'+esc(norm(x.title))+'">'+esc(x.title)+'</button></b><small>Missed or moved '+x.n+' times in 30 days</small></span><em class="bad">!</em></li>').join("")+'</ul>':empty("No task was missed or moved 3 or more times in the last 30 days."))+'</div>';
}

/* ---------- goals, records, habits ---------- */
function secGoals(){
  const c=cfg(), s=ST(), t=A.today;
  const gl=c.goals.map(g=>{ const e=goalEval(g), G=GOALS[g.type], stN={met:"&#10003; Reached",ontrack:"On track",behind:"! Behind pace",progress:"In progress",nodata:"No data yet"}[e.status];
    return '<li class="goal g-'+e.status+'"><div class="g-top"><b>'+esc(G.n)+'</b><span class="gst">'+stN+'</span><button class="dx sm" data-dgoaldel="'+g.id+'" aria-label="Remove goal">&times;</button></div>'+
      '<div class="g-val"><strong>'+(e.cur==null?"–":e.cur)+'</strong> / '+g.target+' '+esc(G.u)+(g.type==="tasks_day"?" today":g.type==="streak"?"":" this week")+'</div><div class="m-bar"><i style="width:'+e.pct+'%"></i>'+(e.pace?'<em class="pace" style="left:'+Math.min(100,e.pace/g.target*100)+'%" title="Where you should be by today"></em>':'')+'</div>'+
      (e.hist.length?'<div class="g-hist" aria-label="History">'+e.hist.map(h=>'<i class="'+(h.met==null?"na":h.met?"y":"n")+'" title="'+esc(h.label+": "+(h.v==null?"no data":h.v))+'"></i>').join("")+'<span>'+(g.type==="tasks_day"?"last 14 days":"last 6 weeks")+'</span></div>':'')+'</li>'; }).join("");
  const add1='<div class="gadd"><span>Add a goal</span><div class="gtypes">'+Object.entries(GOALS).filter(([k])=>!c.goals.some(g=>g.type===k)).map(([k,G])=>'<button class="dchip" data-dgoaladd="'+k+'">'+esc(G.n)+'</button>').join("")+'</div></div>';
  const edit=D.goalNew?(()=>{ const G=GOALS[D.goalNew]; return '<div class="gform"><b>'+esc(G.n)+'</b><label>Target <input type="number" id="dGoalT" min="1" max="'+(G.u==="%"?100:999)+'" value="'+G.d+'"> '+esc(G.u)+'</label><button class="dbtn pri" data-dgoalsave>Save goal</button><button class="dbtn" data-dgoalcancel>Cancel</button></div>'; })():"";
  // personal records, from all history
  const f=A.firstDay(), all=span(f,t).map(dayAll).filter(d=>d.hasPlan), past=all.filter(d=>d.key<t||d.good);
  const bestDay=past.filter(d=>d.n>=3).sort((a,b)=>b.pctDay-a.pctDay||b.done-a.done)[0], most=past.slice().sort((a,b)=>b.done-a.done)[0];
  const allRecs=recsIn(span(f,t),true), am=agg(allRecs), st=streaks(), totalDone=am.done;
  const fDay=all.slice().sort((a,b)=>b.timer-a.timer)[0];
  const ms=[10,25,50,100,250,500,1000,2500].find(x=>x>totalDone)||totalDone+1000;
  const recs='<div class="recs">'+[["Best day",bestDay?bestDay.pctDay+"%":"–",bestDay?niceD(bestDay.key):"Needs a day with 3+ tasks"],["Most tasks in a day",most?most.done:"–",most?niceD(most.key):""],["Longest streak",plural(st.best,"day"),"Current: "+plural(st.cur,"day")],
    ["Longest focus stretch",am.segMax?dur(am.segMax):"–","Without a pause"],["Most timer time in a day",fDay&&fDay.timer?dur(fDay.timer):"–",fDay&&fDay.timer?niceD(fDay.key):""],["Tasks done, all time",totalDone,"Next milestone: "+ms]].map(r=>'<div><span>'+r[0]+'</span><b>'+r[1]+'</b><small>'+esc(r[2])+'</small></div>').join("")+'</div>'+
    '<div class="meter"><div class="m-top"><span>Progress to '+ms+' tasks</span><b>'+totalDone+'</b></div><div class="m-bar"><i style="width:'+Math.round(totalDone/ms*100)+'%"></i></div></div>'+
    '<p class="fine">Since '+esc(niceD(f))+': '+dur(am.worked)+' of measured work, '+plural(all.length,"day")+' with a plan.</p>';
  // habits: kept apart from tasks
  const H=s.habits||[], log=s.habitLog||{}, days=span(add(t,-6),t);
  const hstreak=id=>{ let n=0,k=t; if(!(log[k]&&log[k][id])) k=add(k,-1); while(log[k]&&log[k][id]){ n++; k=add(k,-1); } return n; };
  const h30=id=>span(add(t,-29),t).filter(k=>log[k]&&log[k][id]).length;
  const habits='<div class="tscroll"><table class="habits"><thead><tr><th>Habit</th>'+days.map(k=>'<th>'+(k===t?"Today":DAYN[kd(k).getDay()].slice(0,2))+'</th>').join("")+'<th>Streak</th><th>30 days</th><th></th></tr></thead><tbody>'+
    (H.length?H.map(h=>'<tr><td class="tn">'+esc(h.name)+'</td>'+days.map(k=>'<td><button class="hk'+(log[k]&&log[k][h.id]?" on":"")+'" data-dhab="'+k+'|'+h.id+'" aria-pressed="'+!!(log[k]&&log[k][h.id])+'" aria-label="'+esc(h.name+", "+niceD(k))+'">'+(log[k]&&log[k][h.id]?"&#10003;":"")+'</button></td>').join("")+'<td>'+plural(hstreak(h.id),"day")+'</td><td>'+Math.round(h30(h.id)/30*100)+'%</td><td><button class="dx sm" data-dhabdel="'+h.id+'" aria-label="Remove habit">&times;</button></td></tr>').join(""):'<tr><td colspan="11" class="fine">No habits yet. Add one below, like “Drink 2 litres of water” or “Read 10 pages”.</td></tr>')+
    '</tbody></table></div><form class="hadd" data-dhabform><input id="dHabName" maxlength="60" placeholder="New habit, e.g. Walk 20 minutes" aria-label="New habit"><button class="dbtn pri">Add habit</button></form>';
  return '<div class="two">'+card("Your goals",(gl?'<ul class="goals">'+gl+'</ul>':empty("No goals yet. Pick one below. Goals only read your data, they never change your tasks."))+edit+add1)+card("Personal records",recs)+'</div>'+
    card("Habits",habits,{sub:"Tick a habit for today or the last 6 days. Habits are kept apart from tasks, so they never change your task numbers."});
}

/* ---------- score ---------- */
function secScore(){
  const m=CUR.m, pm=CUR.pm, sc=scoreOf(m,m.keys,true), ps=scoreOf(pm,pm.keys,true), w=cfg().weights, t=A.today;
  const weeks=[7,6,5,4,3,2,1,0].map(i=>{ const s=add(weekStart(t),-7*i), ks=clamp(s,add(s,6)); if(!ks.length) return {label:shortD(s),v:null}; const mm=agg(recsIn(ks)); mm.cons=consistency(ks); return {label:shortD(s),v:scoreOf(mm,ks,false).overall}; });
  const contrib=PARTS.map(([k,n])=>{ if(sc.parts[k]==null||ps.parts[k]==null||!w[k]) return null; const sw=sc.used.reduce((a,x)=>a+w[x],0)||1; return {n,d:(sc.parts[k]-ps.parts[k])*w[k]/sw}; }).filter(x=>x&&Math.abs(x.d)>=.5).sort((a,b)=>Math.abs(b.d)-Math.abs(a.d));
  const why={completion:m.due+" tasks were due",punctuality:m.sN+" started, "+m.dlN+" finished with a planned end",consistency:(m.cons.plan||0)+" days with a plan",focus:plural(m.ratedN,"timed task")+" with a focus rating",accuracy:plural(m.accN,"task")+" with measured time",goals:plural(cfg().goals.length,"goal")};
  const need={completion:"Needs 3 tasks that were due",punctuality:"Needs 3 started or finished tasks",consistency:"Needs 2 days with a plan",focus:"Rate your focus after 2 timed tasks",accuracy:"Needs 3 finished tasks with measured time",goals:"Set a goal in Goals & habits"};
  return '<div class="two">'+card("Your productivity score",scoreMini(sc,ps)+(sc.overall!=null?'<p class="fine">Based on '+sc.used.length+' of 6 parts. Parts without enough data are left out, not counted as zero.</p>':''),{sub:periodName()})+
      card("Score by week",weeks.some(x=>x.v!=null)?chart({type:"line",title:"Score by week",labels:weeks.map(x=>x.label),tips:weeks.map(x=>"Week of "+x.label),xName:"Week",series:[{name:"Score",c:COL.s1,vals:weeks.map(x=>x.v)}],max:100,note:"Weekly scores leave out goals, because goals are set for now."}):empty("Needs a few days of data."))+'</div>'+
    card("What changed since "+esc(prevName()),contrib.length?hbars(contrib.map(c=>({label:c.n+(c.d>0?" (helped)":" (pulled down)"),v:Math.abs(Math.round(c.d*10)/10),c:c.d>0?COL.good:COL.warn,icon:c.d>0?"&#9650;":"&#9660;"})),v=>v+" pts"):empty("No clear change, or not enough earlier data to compare."))+
    card("The six parts and how much each counts",'<div class="parts">'+PARTS.map(([k,n,d])=>'<div class="part"><div class="p-top"><b>'+n+'</b><span class="p-v">'+(sc.parts[k]==null?"–":sc.parts[k])+'</span></div><p>'+d+'.</p><p class="fine">'+(sc.parts[k]==null?need[k]:"Uses "+why[k])+'</p><div class="seg" role="group" aria-label="Weight for '+n+'">'+[0,1,2,3].map(v=>'<button data-dweight="'+k+'|'+v+'" aria-pressed="'+(w[k]===v)+'">'+(v===0?"Off":v+"×")+'</button>').join("")+'</div></div>').join("")+'</div>'+
      '<p class="expl">Score = the weighted average of the parts that have data. Longer hours never raise it on their own: focus counts how well you focused, not how long. Days with fewer tasks aren&#39;t penalised, because completion is a share of what you planned.</p>',{tag:"calc"});
}

/* ---------- reports ---------- */
function repRange(){ const k=D.repKey||A.today; if(D.rep==="day") return [k,k]; if(D.rep==="week"){ const s=weekStart(k); return [s,add(s,6)]; } return [monthStart(k),monthEnd(k)]; }
function secReports(){
  const [a,b]=repRange(), keys=clamp(a,b), m=agg(recsIn(keys)); m.cons=consistency(keys);
  const pa=D.rep==="day"?add(a,-1):D.rep==="week"?add(a,-7):monthStart(add(a,-1)), pb=D.rep==="day"?pa:D.rep==="week"?add(pa,6):add(a,-1), pk=clamp(pa,pb), p=agg(recsIn(pk)); p.cons=consistency(pk);
  const title=D.rep==="day"?(a===A.today?"Today, ":"")+niceD(a):D.rep==="week"?"Week of "+shortD(a)+" – "+shortD(b):MONTHS[+a.slice(5,7)-1]+" "+a.slice(0,4);
  const pname={day:"the day before",week:"the week before",month:"the month before"}[D.rep], rok=pk.length>0&&pk.length>=keys.length*.7, dd=(c,q,u,bt)=>delta(c,q,u,bt,rok).replace(esc(prevName()),pname);
  if(!rok){ p.due=0; p.completion=null; }
  const shift=D.rep==="day"?[add(a,-1),add(a,1)]:D.rep==="week"?[add(a,-7),add(a,7)]:[monthStart(add(a,-1)),add(b,1)];
  const head='<div class="dnav"><div class="seg">'+[["day","Daily"],["week","Weekly"],["month","Monthly"]].map(([k,n])=>'<button data-drep="'+k+'" aria-pressed="'+(D.rep===k)+'">'+n+'</button>').join("")+'</div><button class="dround" data-drepk="'+shift[0]+'" aria-label="Earlier">&lsaquo;</button><b>'+esc(title)+'</b><button class="dround" data-drepk="'+shift[1]+'" aria-label="Later"'+(shift[1]>A.today?" disabled":"")+'>&rsaquo;</button>'+(keys.indexOf(A.today)<0?'<button class="dchip" data-drepk="'+A.today+'">Now</button>':'')+'<button class="dchip" data-dcopy>Copy report</button></div>';
  if(!keys.length) return head+card("Report",empty("No data for this "+D.rep+". Reports start from your first plan on "+esc(niceD(A.firstDay()))+"."));
  const tiles='<div class="kpis k6">'+kpi({label:"Planned",value:m.n,sub:m.due+" were due",drill:"keys:"+a+","+b})+kpi({label:"Completed",value:m.done,sub:P(m.completion)+" of due",delta:dd(m.completion,p.completion,"pts","up"),drill:"keys:"+a+","+b+",done"})+
    kpi({label:"Missed or overdue",value:m.missed+m.overdue,sub:m.moved+" moved",drill:"keys:"+a+","+b+",missed"})+kpi({label:"Time worked",value:m.worked?dur(m.worked):"–",sub:"Timer: "+dur(m.timer),delta:dd(m.worked,p.worked,"min",null),tag:"measured"})+
    kpi({label:"Focus",value:m.segN+'<small> sessions</small>',sub:"Verified: "+(m.ratedMin?dur(m.verified):"not rated")})+kpi({label:D.rep==="day"?"Punctuality":"Consistency",value:D.rep==="day"?P(m.punct):P(m.cons.pct),sub:D.rep==="day"?"Deadlines met: "+P(m.deadline):m.cons.good+" of "+plural(m.cons.plan,"day")+" at 70%+",delta:D.rep==="day"?dd(m.punct,p.punct,"pts","up"):dd(m.cons.pct,p.cons.pct,"pts","up")})+'</div>';
  const rs=recsIn(keys), wins=[], left=[], att=[];
  if(m.done) wins.push(plural(m.done,"task")+" completed"+(m.completion>=80?", a strong "+m.completion+"%":"")+".");
  if(m.worked) wins.push(dur(m.worked)+" of measured work"+(m.deepN?", including "+plural(m.deepN,"deep work session")+" ("+dur(m.deepMin)+")":"")+".");
  if(m.dlN&&m.deadline>=80) wins.push(m.deadline+"% of finished tasks were done by their planned end.");
  if(m.completion!=null&&p.completion!=null&&m.completion>p.completion) wins.push("Completion up "+(m.completion-p.completion)+" points from "+pname+".");
  rs.filter(r=>r.status==="missed"||r.status==="overdue"||r.status==="pending").slice(0,8).forEach(r=>left.push(esc(r.title)+" <small>("+esc(shortD(r.key))+", "+esc(statusName(r).toLowerCase())+")</small>"));
  const mv=moveStats(keys).filter(x=>x.n>=2); mv.slice(0,3).forEach(x=>att.push("“"+esc(x.title)+"” was moved "+x.n+" times."));
  if(m.overBig) att.push(plural(m.overBig,"task")+" took 50% or more longer than planned.");
  if(m.sN>=3&&m.punct<50) att.push("Only "+m.punct+"% of tasks started on time.");
  if(m.completion!=null&&p.completion!=null&&p.completion-m.completion>=15) att.push("Completion is down "+(p.completion-m.completion)+" points from "+pname+".");
  let chartH="";
  if(D.rep==="day") chartH=card("Tasks",recTable(rs.slice().sort((x,y)=>(x.s||0)-(y.s||0))));
  else { const ks=span(a,b), rows=ks.map(k=>k<A.firstDay()||k>A.today?null:agg(recsIn([k])));
    chartH=card("Day by day",chart({type:"bar",stacked:true,title:"Day by day",labels:ks.map(k=>D.rep==="week"?DAYN[kd(k).getDay()]:String(kd(k).getDate())),tips:ks.map(niceD),xName:"Day",series:[{name:"Done",c:COL.good,vals:rows.map(r=>r?r.done:null)},{name:"Not done",c:COL.gray,vals:rows.map(r=>r?r.n-r.done:null)}],int:true,click:i=>openDrill("day:"+ks[i])}));
    const top=ks.map((k,i)=>({k,r:rows[i]})).filter(x=>x.r&&x.r.n).sort((x,y)=>y.r.done/y.r.n-x.r.done/x.r.n||y.r.done-x.r.done).slice(0,3);
    if(top.length) chartH+=card("Most productive days",'<ol class="plain">'+top.map(x=>'<li><b>'+esc(niceD(x.k))+'</b> · '+x.r.done+' of '+x.r.n+' done'+(x.r.worked?", "+dur(x.r.worked)+" worked":"")+'</li>').join("")+'</ol>');
    if(D.rep==="month"){ const gs=goalScore(keys); chartH+=card("Goals this month",gs==null?empty("No goals set."):meter(gs,"Average progress toward your goals")); } }
  D.lastReport=title+"\n"+[["Planned",m.n],["Completed",m.done+" ("+P(m.completion)+")"],["Missed or overdue",m.missed+m.overdue],["Moved",m.moved],["Time worked",dur(m.worked)],["Timer focus",dur(m.timer)],["Started on time",P(m.punct)],["Deadlines met",P(m.deadline)]].map(x=>x[0]+": "+x[1]).join("\n")+
    (wins.length?"\n\nWins:\n- "+wins.join("\n- "):"")+(att.length?"\n\nNeeds attention:\n- "+att.join("\n- ").replace(/<[^>]+>/g,"").replace(/&[a-z]+;/g,""):"");
  return head+'<p class="rep-sum">'+esc(daySummaryRange(m,p,pname))+'</p>'+tiles+
    '<div class="three">'+card("&#10003; Achievements",wins.length?'<ul class="plain">'+wins.map(x=>'<li>'+x+'</li>').join("")+'</ul>':empty("Nothing finished yet."))+card("Unfinished work",left.length?'<ul class="plain">'+left.map(x=>'<li>'+x+'</li>').join("")+'</ul>':empty("Nothing left open."))+card("! Needs attention",att.length?'<ul class="plain">'+att.map(x=>'<li>'+x+'</li>').join("")+'</ul>':empty("Nothing stands out."))+'</div>'+chartH; }
function daySummaryRange(m,p,pname){ if(!m.n) return "Nothing was planned."; let s="You planned "+plural(m.n,"task")+" and finished "+m.done+(m.due?" ("+m.completion+"% of those due)":"")+".";
  if(m.worked) s+=" You recorded "+dur(m.worked)+" of work."; if(p.due&&m.due) s+=" Last time: "+p.completion+"%."; return s; }

/* ---------- insights ---------- */
function insights(){
  const m=CUR.m, pm=CUR.pm, out=[], pn=prevName();
  if(m.due>=5&&pm.due>=5){ const d=m.completion-pm.completion; out.push({t:"You completed "+m.completion+"% of your due tasks in this period, compared with "+pm.completion+"% in "+pn+".",b:"Based on "+m.due+" and "+pm.due+" due tasks.",s:d<=-10?"A lower rate often means too much was planned. Try planning one task fewer per day.":null,w:Math.abs(d)}); }
  if(m.worked>=30) out.push({t:"You spent "+dur(m.worked)+" on tasks with measured time"+(pm.worked>=30?", compared with "+dur(pm.worked)+" in "+pn:"")+".",b:plural(m.measuredN,"task")+" with timer or start and finish times.",w:5});
  if(m.accN>=3){ const ae=m.estSum/m.accN, aa=m.actSum/m.accN; if(Math.abs(aa-ae)>=5) out.push({t:"Your finished tasks took "+dur(aa)+" on average, against your estimate of "+dur(ae)+".",b:"Based on "+plural(m.accN,"task")+" with measured time.",s:aa>ae?"Plan about "+Math.round((aa/ae-1)*100)+"% more time for tasks like these.":"You can plan a little less time, or fit in one more task.",w:Math.abs(aa-ae)}); }
  const dn=m.recs.filter(r=>r.doneAt); if(dn.length>=6){ const h=new Array(24).fill(0); dn.forEach(r=>h[new Date(r.doneAt).getHours()]++); let best=0,bi=0; for(let i=0;i<22;i++){ const v=h[i]+h[i+1]+h[i+2]; if(v>best){ best=v; bi=i; } } if(best/dn.length>=.35) out.push({t:"You finished most tasks between "+A.fmt(bi*60).replace(":00","")+" and "+A.fmt((bi+3)*60).replace(":00","")+" ("+best+" of "+dn.length+").",b:"Based on when you marked tasks done.",s:"Put your hardest tasks in this window.",w:8}); }
  if(m.moved>=3){ const rep=moveStats(m.keys).filter(x=>x.n>=2).length; out.push({t:"You moved or skipped "+plural(m.moved,"task")+(rep?", and "+plural(rep,"task")+" moved more than once":"")+".",b:"Moves are counted, not judged. Moving a task on purpose is part of planning.",s:rep?"Tasks that keep moving may need to be smaller or planned on a lighter day.":null,w:m.moved}); }
  if(m.timer>=30&&pm.timer>=30){ const d=Math.round((m.timer-pm.timer)/pm.timer*100); if(Math.abs(d)>=10) out.push({t:"Your timer focus time went "+(d>0?"up":"down")+" "+Math.abs(d)+"% compared with "+pn+" ("+dur(m.timer)+" vs "+dur(pm.timer)+").",b:"Timer time only, not verified focus.",w:Math.abs(d)/5}); }
  if(m.sN>=5&&m.sLate/m.sN>=.4) out.push({t:pct(m.sLate,m.sN)+"% of tasks started more than 5 minutes late, on average by "+dur(m.sLateSum/m.sLate)+".",b:"Based on "+plural(m.sN,"started task")+".",s:"Leave a 10-minute buffer between tasks, or plan the first task a little later.",w:7});
  const days=m.keys.map(k=>agg(recsIn([k]))).filter(d=>d.due>=1); if(days.length>=8){ const med=median(days.map(d=>d.n)), big=days.filter(d=>d.n>med), small=days.filter(d=>d.n<=med);
    if(big.length>=3&&small.length>=3){ const cb=pct(big.reduce((a,d)=>a+d.done,0),big.reduce((a,d)=>a+d.due,0)), cs=pct(small.reduce((a,d)=>a+d.done,0),small.reduce((a,d)=>a+d.due,0)); if(cs-cb>=15) out.push({t:"On days with more than "+med+" tasks you finished "+cb+"%, against "+cs+"% on lighter days.",b:"Based on "+plural(days.length,"day")+".",s:"Around "+med+" tasks a day seems to suit you best.",w:9}); } }
  if(m.ratedN>=3&&m.focusQ!=null) out.push({t:"You rated "+pct(m.verified,m.ratedMin)+"% of your rated timer time as fully focused.",b:"Based on "+plural(m.ratedN,"task")+" you rated.",s:m.focusQ<60?"Try closing other tabs before you press Start, and use Pause when you step away.":null,w:4});
  return out.sort((a,b)=>b.w-a.w); }
function insHTML(x){ return '<li><p>'+esc(x.t)+'</p><small>'+esc(x.b)+'</small>'+(x.s?'<p class="sug">&#128161; '+esc(x.s)+'</p>':'')+'</li>'; }
function secInsights(){ const ins=insights(); return card("Insights for "+esc(periodName().toLowerCase()),ins.length?'<ul class="ins">'+ins.map(insHTML).join("")+'</ul>':empty("Not enough data yet for reliable insights. Each insight needs a minimum amount of data (for example 5 due tasks, or 3 measured tasks), so you never get a conclusion from one bad day."),{sub:"Every line is worked out from your own tasks and timer. None of it is a guess about you as a person."}); }

/* ---------- alerts ---------- */
const ALN={overdue:"Overdue tasks",soon:"Deadlines coming up",moved:"Tasks moved again and again",estimate:"Estimates far from reality",workload:"Very heavy days",trend:"Falling completion",goals:"Goals behind pace",untracked:"Finished tasks with no time",running:"Timer left running"};
function alerts(){ const c=cfg(), t=A.today, out=[], on=c.alerts, now=Date.now();
  const tr=recsIn([t],true);
  if(on.overdue) tr.filter(r=>r.status==="overdue").forEach(r=>out.push({id:"od:"+t+":"+r.id,lv:"crit",t:"“"+r.title+"” is overdue",d:"It was planned to end at "+A.fmt(r.e)+".",acts:[["Open task","go",t+"|"+r.id],["Move to tomorrow","move",t+"|"+r.id]]}));
  if(on.soon) tr.filter(r=>r.status==="pending"&&!r.startAt&&r.s!=null&&r.s-nowMin()<=30&&r.s-nowMin()>0).forEach(r=>out.push({id:"soon:"+t+":"+r.id,lv:"warn",t:"“"+r.title+"” starts at "+A.fmt(r.s),d:"In "+dur(r.s-nowMin())+". Ends at "+A.fmt(r.e)+".",acts:[["Open task","go",t+"|"+r.id]]}));
  if(on.running) tr.filter(r=>r.running&&r.active>Math.max(r.est*2,r.est+60)).forEach(r=>out.push({id:"run:"+t+":"+r.id,lv:"warn",t:"The timer for “"+r.title+"” may be left running",d:dur(r.active)+" so far, planned "+dur(r.est)+".",acts:[["Fix in timer history","sec","history"]]}));
  if(on.moved) moveStats(clamp(add(t,-13),t)).filter(x=>x.n>=2).forEach(x=>out.push({id:"mv:"+norm(x.title),lv:"warn",t:"“"+x.title+"” was moved "+x.n+" times in 2 weeks",d:"Maybe split it into a smaller first step, or plan it on a lighter day.",acts:[["Edit my plan","plan",""],["See the task","drill","title:"+norm(x.title)]]}));
  if(on.estimate){ const byT={}; recsIn(clamp(add(t,-29),t),true).forEach(r=>{ if(r.isDone&&r.active!=null&&r.est>0){ const k=norm(r.title); (byT[k]=byT[k]||{title:r.title,est:r.est,r:[]}).r.push(r.active/r.est); } });
    Object.values(byT).filter(x=>x.r.length>=3&&median(x.r)>=1.5).forEach(x=>out.push({id:"est:"+norm(x.title),lv:"info",t:"“"+x.title+"” usually takes "+Math.round(median(x.r)*10)/10+"× its estimate",d:"Planned "+dur(x.est)+". Updating the estimate keeps the rest of your day on time.",acts:[["Update in my plan","plan",""]]})); }
  if(on.workload) span(t,add(t,6)).forEach(k=>{ const mn=recsOf(k).filter(r=>r.counted&&!r.isDone&&r.status!=="moved").reduce((x,r)=>x+r.est,0); if(mn>c.capacity*1.2) out.push({id:"wl:"+k,lv:"warn",t:niceD(k)+" is very full",d:dur(mn)+" planned, your limit is "+dur(c.capacity)+".",acts:[["Edit my plan","plan",""],["See the day","drill","day:"+k]]}); });
  if(on.trend){ const a=agg(recsIn(clamp(add(t,-6),t),true)), b=agg(recsIn(clamp(add(t,-13),add(t,-7)),true)); if(a.due>=8&&b.due>=8&&b.completion-a.completion>=15) out.push({id:"tr:"+weekStart(t),lv:"info",t:"Completion dropped from "+b.completion+"% to "+a.completion+"%",d:"Last 7 days compared with the 7 before. Worth a look, not a worry.",acts:[["See trends","sec","trends"]]}); }
  if(on.goals) c.goals.forEach(g=>{ const e=goalEval(g); if(e.status==="behind") out.push({id:"gl:"+g.id+":"+weekStart(t),lv:"info",t:GOALS[g.type].n+" is behind pace",d:(e.cur==null?"No data":e.cur)+" of "+g.target+" "+GOALS[g.type].u+" so far.",acts:[["See goals","sec","goals"]]}); });
  if(on.untracked){ const r7=recsIn(clamp(add(t,-6),t),true); if(r7.some(r=>r.src==="timer")){ const un=r7.filter(r=>r.isDone&&!r.src&&r.cat==="work"); if(un.length>=3) out.push({id:"un:"+weekStart(t),lv:"info",t:plural(un.length,"work task")+" finished with no time recorded",d:"You use the timer on other tasks. Pressing Start on these too makes your time numbers complete.",acts:[["See them","drillr","untracked"]]}); } }
  const dis=c.dismissed; return out.filter(x=>!(dis[x.id]&&dis[x.id]>now)).sort((a,b)=>({crit:0,warn:1,info:2})[a.lv]-({crit:0,warn:1,info:2})[b.lv]); }
function alertHTML(x){ const ic={crit:"!",warn:"!",info:"i"}[x.lv]; return '<li class="al al-'+x.lv+'"><span class="al-i" aria-hidden="true">'+ic+'</span><div><b>'+esc(x.t)+'</b><p>'+esc(x.d)+'</p><div class="al-a">'+x.acts.map(a=>'<button class="dchip" data-dal="'+a[1]+'" data-dv="'+esc(a[2])+'">'+esc(a[0])+'</button>').join("")+'<button class="dchip ghost" data-ddismiss="'+esc(x.id)+'">Dismiss for a week</button></div></div><span class="sr">'+({crit:"Urgent",warn:"Warning",info:"Info"})[x.lv]+'</span></li>'; }
function secAlerts(){ const al=alerts(), c=cfg();
  return '<div class="two">'+card("Alerts",al.length?'<ul class="alerts">'+al.map(alertHTML).join("")+'</ul>':empty("All clear. Normal ups and downs are not flagged."),{sub:"Only things you can act on."})+
    card("Which alerts to show",'<ul class="toggles">'+Object.keys(ALN).map(k=>'<li><label><input type="checkbox" data-dalert="'+k+'"'+(c.alerts[k]?" checked":"")+'> '+ALN[k]+'</label></li>').join("")+'</ul>'+(Object.keys(c.dismissed).length?'<button class="dbtn" data-dundismiss>Show dismissed alerts again</button>':''))+'</div>'; }

/* ---------- timer history ---------- */
function secHistory(){
  const m=CUR.m, rows=[]; m.recs.forEach(r=>r.sess.forEach((x,j)=>rows.push({r,x,j})));
  rows.sort((a,b)=>b.x.s-a.x.s);
  const now=Date.now(), q=norm(D.histQ), list=q?rows.filter(o=>norm(o.r.title).includes(q)):rows;
  const legacy=m.recs.filter(r=>r.src==="startfinish");
  const tot={}; rows.forEach(o=>{ const k=norm(o.r.title); const t=tot[k]||(tot[k]={title:o.r.title,n:0,min:0}); t.n++; t.min+=A.sessActiveMs(o.x,now)/60000; });
  const flag=o=>{ const act=A.sessActiveMs(o.x,now)/60000, e=o.x.e||now; const cross=new Date(o.x.s).toDateString()!==new Date(e).toDateString(); return (act>Math.max(o.r.est*2,o.r.est+60)||cross||(!o.x.e&&act>12*60)); };
  const stN=x=>!x.e?(x.p.length&&!x.p[x.p.length-1].b?"Paused":"Running"):({done:"Finished",skipped:"Stopped, task moved",switched:"Stopped, started another task",stopped:"Stopped",fixed:"Corrected"})[x.x]||"Stopped";
  const body=list.length?'<div class="tscroll"><table class="dt"><thead><tr><th>Task</th><th>Date</th><th>Start – end</th><th>Active</th><th>Paused</th><th>Status</th><th>Type</th><th></th></tr></thead><tbody>'+list.slice(0,200).map(o=>{ const x=o.x, act=A.sessActiveMs(x,now)/60000, e=x.e||now, pz=(x.p||[]).reduce((a,q)=>a+Math.max(0,Math.min(q.b||e,e)-q.a),0)/60000, id=o.r.key+"|"+o.r.id+"|"+o.j, open=D.open===id;
    return '<tr class="'+(flag(o)?"flag":"")+'"><td class="tn">'+esc(o.r.title)+(flag(o)?' <span class="st st-overdue">! check this</span>':'')+(x.fix?' <span class="st st-moved">corrected</span>':'')+'</td><td>'+esc(shortD(o.r.key))+'</td><td>'+hm(x.s)+' – '+(x.e?hm(x.e):"now")+'</td><td><b>'+dur(act)+'</b></td><td>'+(pz?dur(pz)+" ("+x.p.length+")":"–")+'</td><td>'+stN(x)+'</td><td>'+CATN[o.r.cat]+'</td><td><button class="dlink" data-dsess="'+esc(id)+'">'+(open?"Close":"Details")+'</button></td></tr>'+
      (open?'<tr class="sdet"><td colspan="8">'+sessDetail(o,act)+'</td></tr>':''); }).join("")+'</tbody></table></div>':empty(rows.length?"No sessions match.":"No timer sessions in this period. Press Start on a task and it shows up here.");
  return '<div class="two wide-l">'+card("Timer sessions",'<input class="dsearch" data-dhistq placeholder="Search by task name" value="'+esc(D.histQ)+'" aria-label="Search sessions">'+body+(legacy.length?'<p class="fine">'+plural(legacy.length,"older task")+' in this period only have start and finish times (no sessions). They count in time worked, marked with *.</p>':''),{sub:plural(rows.length,"session")+" · "+periodName(),tag:"measured"})+
    card("Total per task",Object.keys(tot).length?'<table class="dt small"><thead><tr><th>Task</th><th>Sessions</th><th>Total</th></tr></thead><tbody>'+Object.values(tot).sort((a,b)=>b.min-a.min).map(t=>'<tr><td class="tn">'+esc(t.title)+'</td><td>'+t.n+'</td><td><b>'+dur(t.min)+'</b></td></tr>').join("")+'</tbody></table>':empty("Nothing yet."))+'</div>'; }
function sessDetail(o,act){ const x=o.x;
  return '<div class="sd"><div><b>Pauses</b>'+(x.p&&x.p.length?'<ul class="plain">'+x.p.map(q=>'<li>'+hm(q.a)+' – '+(q.b?hm(q.b):"still paused")+(q.b?' ('+dur((q.b-q.a)/60000)+')':'')+'</li>').join("")+'</ul>':'<p class="fine">No pauses.</p>')+
    (x.fix?'<p class="fine">Corrected on '+esc(new Date(x.fix.at).toLocaleString())+'. Original end: '+(x.fix.e0?hm(x.fix.e0):"still running")+' ('+dur(x.fix.a0)+' active). <button class="dlink" data-dsessundo="'+esc(o.r.key+"|"+o.r.id+"|"+o.j)+'">Restore original</button></p>':'')+'</div>'+
    '<div class="sfix"><b>Fix this session</b><p class="fine">Left the timer running, or forgot to stop it? Set how long you really worked. The original record is kept.</p><label>Active time <input type="number" min="1" max="960" id="dFix" value="'+Math.max(1,Math.round(act))+'"> min</label><button class="dbtn pri" data-dsessfix="'+esc(o.r.key+"|"+o.r.id+"|"+o.j)+'">Save correction</button></div></div>'; }
function findSess(v){ const [k,id,j]=v.split("|"), ds=ST().days[k]; return ds&&ds.sess&&ds.sess[id]&&ds.sess[id][+j]; }

/* ---------- about the data ---------- */
function secAbout(){ const s=ST(), f=A.firstDay(); let firstS=null, firstF=null, firstSnap=null;
  Object.keys(s.days||{}).sort().forEach(k=>{ const d=s.days[k]; if(!firstS&&d.sess&&Object.keys(d.sess).length) firstS=k; if(!firstF&&d.focus&&Object.keys(d.focus).length) firstF=k; if(!firstSnap&&d.snap) firstSnap=k; });
  const rows=[["Planned tasks, times and estimates","Your plan",f],["Done, skipped and moved","Tapped by you",f],["Start time","Start button",f],["Timer sessions, pauses","Start, Pause, Resume, Done",firstS],["Focus ratings","Your answer after a timed task",firstF],["Plan as it was that day","Saved automatically each day",firstSnap],["Task created time","Not tracked",null],["Priority","Must-do tasks (core) vs flexible",f]];
  return card("What is measured, calculated or missing",'<div class="tscroll"><table class="dt"><thead><tr><th>Data</th><th>Where it comes from</th><th>Available since</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+r[0]+'</td><td>'+r[1]+'</td><td>'+(r[2]?esc(niceD(r[2])):'<span class="st st-pending">Not recorded yet</span>')+'</td></tr>').join("")+'</tbody></table></div>')+
    card("Definitions",'<dl class="defs"><dt>Due task</dt><dd>A task whose planned end has passed, or that you finished or moved. Tasks still ahead today are not due, so they never lower your rates.</dd>'+
      '<dt>Deadline</dt><dd>The planned end time of a task, including any time you moved your day. Free-time blocks have no deadline and are left out.</dd>'+
      '<dt>On time</dt><dd>Within 5 minutes either side. Start punctuality compares with the time you first planned, before any moves.</dd>'+
      '<dt>Missed vs moved</dt><dd>Missed means the day ended without it done. Moved means you chose to skip or move it; we record whether that was before or after its deadline.</dd>'+
      '<dt>Time worked</dt><dd>Timer time (with pauses taken out), or for older tasks the gap between Start and Done. Planned time is never counted as work.</dd>'+
      '<dt>Verified focus</dt><dd>Timer time on tasks you rated “Fully” focused. The timer alone isn’t proof of focus.</dd>'+
      '<dt>Good day</dt><dd>70% or more of the day’s tasks done, the same rule as your streak. Days with no plan don’t break a streak.</dd>'+
      '<dt>Dates</dt><dd>Everything uses your device’s local date. A session belongs to the day of its task, even if it runs past midnight.</dd>'+
      '<dt>Older days</dt><dd>'+(firstSnap?"From "+esc(niceD(firstSnap))+" each day keeps a copy of its plan. Days before that use your plan as it is now.":"From now on each day keeps a copy of its plan. Days before that use your plan as it is now.")+'</dd></dl>'); }

/* ---------- shell ---------- */
const ICON={overview:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  reports:'<path d="M7 3h7l4 4v14H7z"/><path d="M10 12h5M10 16h5"/>',insights:'<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',alerts:'<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  time:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',focus:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',punct:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  timeline:'<path d="M3 7h10M7 12h12M3 17h8"/>',trends:'<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  workload:'<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',goals:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',score:'<path d="M4 15a8 8 0 1 1 16 0"/><path d="m12 15 4-5"/>',history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 8v4l3 2"/>',about:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'};
const NAV=[["At a glance",[["overview","Overview"],["reports","Reports"],["insights","Insights"],["alerts","Alerts"]]],["Analytics",[["time","Time tracking"],["focus","Focus"],["punct","Punctuality & delays"],["timeline","Day timeline"],["trends","Trends"],["calendar","Calendar"]]],["Plan & grow",[["workload","Workload"],["goals","Goals & habits"],["score","Productivity score"]]],["Records",[["history","Timer history"],["about","About the data"]]]];
const SECF={overview:secOverview,reports:secReports,insights:secInsights,alerts:secAlerts,time:secTime,focus:secFocus,punct:secPunct,timeline:secTimeline,trends:secTrends,calendar:secCalendar,workload:secWorkload,goals:secGoals,score:secScore,history:secHistory,about:secAbout};
const SECSUB={overview:"What you planned, what you did, and whether it's getting better.",reports:"A summary of any day, week or month.",insights:"Patterns found in your own data.",alerts:"Things you can act on now.",time:"Where your time really goes, and how it compares with your plan.",focus:"How much of your working time was real focus.",punct:"Starting on time, finishing by the planned end, and what gets moved.",timeline:"Your day, planned and recorded, hour by hour.",trends:"How things change over time.",calendar:"Every day at a glance.",workload:"Is your plan doable? See heavy days before they happen.",goals:"Your own targets, records and habits.",score:"One number, built from six parts you can see and adjust.",history:"Every timer session, with a way to fix mistakes.",about:"How every number is worked out."};
const NOPERIOD={calendar:1,reports:1,goals:1,about:1};
function build(){ if($("dash")) return;
  const el=document.createElement("div"); el.id="dash"; el.className="dash"; el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true"); el.setAttribute("aria-label","Productivity dashboard"); el.hidden=true;
  el.innerHTML='<aside class="dside"><div class="dbrand"><span class="dlogo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-2.05-4.95" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M17.5 3.5v4h-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div><b>HV Reset</b><small>Dashboard</small></div></div><nav id="dNav" aria-label="Dashboard sections"></nav><button class="dback" data-dclose>&larr; Back to my day</button></aside>'+
    '<div class="dmainwrap"><header class="dhead"><div class="dh-t"><h2 id="dTitle"></h2><p id="dSub"></p></div><div class="dh-c" id="dCtl"></div><button class="dx big" data-dclose aria-label="Close dashboard">&times;</button></header><div class="dchips" id="dChips"></div><main class="dmain" id="dMain" tabindex="-1"></main></div>'+
    '<div class="dpop" id="dPop" hidden></div><div class="dtip" id="dTip" role="tooltip" hidden></div><div class="ddscrim" id="dDrillScrim"></div><aside class="ddrill" id="dDrill" aria-label="Tasks"></aside>';
  document.body.appendChild(el);
  el.addEventListener("click",onClick); el.addEventListener("change",onChange); el.addEventListener("input",e=>{ if(e.target.matches("[data-dhistq]")){ D.histQ=e.target.value; clearTimeout(onChange._t); onChange._t=setTimeout(()=>{ render(); const i=document.querySelector("[data-dhistq]"); if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length); } },250); } });
  el.addEventListener("submit",e=>{ if(e.target.matches("[data-dhabform]")){ e.preventDefault(); const n=$("dHabName").value.trim(); if(!n) return; const s=ST(); (s.habits=s.habits||[]).push({id:"h"+Date.now().toString(36),name:n,c:Date.now()}); A.save(); render(); } });
  el.addEventListener("pointermove",e=>{ const h=e.target.closest("[data-ch]"); if(h) tipShow(h,e); else tipHide(); });
  el.addEventListener("pointerleave",tipHide); el.addEventListener("focusin",e=>{ const h=e.target.closest("[data-ch]"); if(h) tipShow(h); }); el.addEventListener("focusout",tipHide);
  el.addEventListener("keydown",e=>{ if((e.key==="Enter"||e.key===" ")&&e.target.matches("[data-ch],li[data-ddrill]")){ e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click",{bubbles:true})); } });
  $("dMain").addEventListener("scroll",tipHide,{passive:true});
  new ResizeObserver(()=>{ clearTimeout(build._r); build._r=setTimeout(drawAll,80); }).observe($("dMain"));
}
function navHTML(){ const al=alerts().length; return NAV.map(([g,items])=>'<div class="ng"><span>'+g+'</span>'+items.map(([k,n])=>'<button data-dsec="'+k+'" aria-current="'+(D.sec===k?"page":"false")+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+ICON[k]+'</svg><span>'+n+'</span>'+(k==="alerts"&&al?'<em class="nb">'+al+'</em>':'')+'</button>').join("")+'</div>').join(""); }
function ctlHTML(){ if(NOPERIOD[D.sec]) return D.sec==="reports"||D.sec==="calendar"?'<span class="dh-note">Filters still apply</span>'+filterBtn():"";
  return '<button class="dsel" data-dpop="period" aria-haspopup="true"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'+esc(periodName())+'<span class="car">&#9662;</span></button>'+filterBtn(); }
function filterBtn(){ const n=Object.values(D.f).filter(v=>v!=="all").length; return '<button class="dsel" data-dpop="filter" aria-haspopup="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Filters'+(n?' <em class="nb">'+n+'</em>':'')+'</button>'; }
const FOPT={cat:["Type",[["all","All types"],["work","Work"],["meal","Meals"],["rest","Breaks"]]],pri:["Priority",[["all","All"],["must","Must do"],["flex","Flexible"]]],status:["Status",[["all","Any status"],["done","Done"],["open","Open"],["missed","Missed or overdue"],["moved","Moved"]]],track:["Time tracking",[["all","All tasks"],["tracked","With measured time"],["untracked","No time recorded"]]]};
function chipsHTML(){ const on=Object.keys(D.f).filter(k=>D.f[k]!=="all"); if(!on.length) return ""; return on.map(k=>'<button class="dchip on" data-dfclear="'+k+'">'+esc(FOPT[k][1].find(o=>o[0]===D.f[k])[1])+' &times;</button>').join("")+'<button class="dchip ghost" data-dfclear="all">Clear all</button>'; }
function popPeriod(){ const cr=presetRange("custom"); D.pick=D.pick||{m:monthStart(A.today),a:null};
  const mk=D.pick.m, s=weekStart(mk), e=add(weekStart(monthEnd(mk)),6), [y,mo]=mk.split("-").map(Number);
  const a1=D.pick.a, cal='<div class="mcal"><div class="mc-h"><button data-dpickm="'+monthStart(add(mk,-1))+'" aria-label="Previous month">&lsaquo;</button><b>'+MONTHS[mo-1]+" "+y+'</b><button data-dpickm="'+add(monthEnd(mk),1)+'" aria-label="Next month"'+(add(monthEnd(mk),1)>A.today?" disabled":"")+'>&rsaquo;</button></div><div class="mc-g">'+["M","T","W","T","F","S","S"].map(d=>'<span>'+d+'</span>').join("")+
    span(s,e).map(k=>{ const inR=a1?k===a1:(D.preset==="custom"&&k>=cr[0]&&k<=cr[1]); return '<button data-dpickd="'+k+'" class="'+(k.slice(0,7)===mk.slice(0,7)?"":"out")+(inR?" in":"")+(k===A.today?" now":"")+'"'+(k>A.today?" disabled":"")+'>'+kd(k).getDate()+'</button>'; }).join("")+'</div><p class="fine">'+(a1?"Now pick the last day.":"Pick the first day, then the last day.")+'</p></div>';
  return '<div class="plist">'+PRESETS.map(([k,n])=>'<button data-dpreset="'+k+'" aria-pressed="'+(D.preset===k)+'"><span class="ck">'+(D.preset===k?"&#10003;":"")+'</span>'+n+'</button>').join("")+'</div><div class="pcustom"><b>Custom range</b>'+cal+'</div>'; }
function popFilter(){ return Object.entries(FOPT).map(([k,[n,opts]])=>'<div class="fgrp"><b>'+n+'</b><div class="seg wrap">'+opts.map(([v,l])=>'<button data-dfilter="'+k+'|'+v+'" aria-pressed="'+(D.f[k]===v)+'">'+l+'</button>').join("")+'</div></div>').join("")+'<p class="fine">Filters apply to every section. Streaks, goals and habits always use all your tasks.</p>'; }
function openPop(kind,btn){ const p=$("dPop"); if(!p.hidden&&p.dataset.kind===kind){ p.hidden=true; return; } p.dataset.kind=kind; p.innerHTML=kind==="period"?popPeriod():popFilter(); p.hidden=false;
  const r=btn.getBoundingClientRect(), w=Math.min(kind==="period"?560:420,innerWidth-16); p.style.width=w+"px"; p.style.left=Math.max(8,Math.min(r.right-w,innerWidth-w-8))+"px"; p.style.top=(r.bottom+6)+"px"; }
function refreshPop(){ const p=$("dPop"); if(!p.hidden) p.innerHTML=p.dataset.kind==="period"?popPeriod():popFilter(); }
let lastU=0;
function render(keepScroll){ if(!$("dash")||$("dash").hidden) return; fresh(); CH={}; tipHide();
  const [a,b]=presetRange(D.preset), [pa,pb]=prevOf(a,b); CUR={m:metrics(a,b),pm:metrics(pa,pb)}; CUR.cmpOK=CUR.pm.keys.length>0&&CUR.pm.keys.length>=CUR.m.keys.length*.7;
  if(!CUR.cmpOK){ const z=agg([]); z.cons={plan:0,good:0,pct:null}; z.keys=[]; z.recs=[]; CUR.pm=z; }
  const main=$("dMain"), sc=keepScroll?main.scrollTop:0;
  $("dNav").innerHTML=navHTML(); $("dCtl").innerHTML=ctlHTML(); $("dChips").innerHTML=chipsHTML();
  const title=NAV.flatMap(g=>g[1]).find(x=>x[0]===D.sec); $("dTitle").textContent=title?title[1]:"Dashboard"; $("dSub").textContent=SECSUB[D.sec]||"";
  let html; try{ html=SECF[D.sec](); }catch(err){ console.error(err); html=empty("Something went wrong while building this section. Your data is safe. Try another period."); }
  main.innerHTML='<div class="dsec s-'+D.sec+'">'+html+'</div>'; main.scrollTop=sc; lastU=ST().updatedAt||0; drawAll(); }
function open(o){ build(); o=o||{}; if(o.sec) D.sec=o.sec; const el=$("dash"); el.hidden=false; document.body.classList.add("dash-open"); render(); requestAnimationFrame(()=>{ el.classList.add("in"); $("dMain").focus({preventScroll:true}); }); }
function close(){ const el=$("dash"); if(!el) return; closeDrill(); $("dPop").hidden=true; tipHide(); el.classList.remove("in"); document.body.classList.remove("dash-open"); setTimeout(()=>{ if(!el.classList.contains("in")) el.hidden=true; },200); }
const isOpen=()=>$("dash")&&!$("dash").hidden&&document.body.classList.contains("dash-open");
function setSec(s){ D.sec=s; D.open=null; remember(); closeDrill(); render(); }
function onClick(e){ e.stopPropagation();
  if(!e.target.closest("#dPop,[data-dpop]")) $("dPop").hidden=true;
  const drillLi=e.target.closest("li[data-ddrill]"); if(drillLi&&!e.target.closest("button")) return openDrill(drillLi.dataset.ddrill);
  const hit=e.target.closest("[data-ch]"); if(hit&&CH[hit.dataset.ch]&&CH[hit.dataset.ch].click){ tipHide(); return CH[hit.dataset.ch].click(+hit.dataset.i); }
  const t=e.target.closest("button"); if(!t) return; const d=t.dataset, c=cfg();
  if("dclose" in d) return close();
  if(d.dsec) return setSec(d.dsec);
  if(d.dpop) return openPop(d.dpop,t);
  if(d.dpreset){ D.preset=d.dpreset; D.day=null; D.pick=null; remember(); $("dPop").hidden=true; return render(); }
  if(d.dpickm){ D.pick.m=d.dpickm; return refreshPop(); }
  if(d.dpickd){ const k=d.dpickd; if(!D.pick.a){ D.pick.a=k; return refreshPop(); } const x=D.pick.a<k?D.pick.a:k, y=D.pick.a<k?k:D.pick.a; D.from=x; D.to=y; D.preset="custom"; D.pick=null; D.day=null; remember(); $("dPop").hidden=true; return render(); }
  if(d.dfilter){ const [k,v]=d.dfilter.split("|"); D.f[k]=v; render(true); return refreshPop(); }
  if(d.dfclear){ if(d.dfclear==="all") Object.keys(D.f).forEach(k=>D.f[k]="all"); else D.f[d.dfclear]="all"; return render(true); }
  if(d.ddrill) return openDrill(d.ddrill);
  if("dclosedrill" in d) return closeDrill();
  if(d.dgo){ const [k,id]=d.dgo.split("|"); close(); return A.goTask(k,id||null); }
  if(d.dact==="plan"){ close(); return A.openPlanner("edit"); }
  if(d.dday){ D.day=d.dday; return render(); }
  if(d.dhour){ D.hour=d.dhour; return render(true); }
  if(d.dheat){ D.heat=d.dheat; remember(); return render(true); }
  if(d.dcalm){ D.cal=d.dcalm; return render(true); }
  if(d.dcal){ D.calSel=d.dcal; return render(true); }
  if(d.drep){ D.rep=d.drep; return render(true); }
  if(d.drepk){ D.repKey=d.drepk; return render(true); }
  if("dcopy" in d){ const txt=D.lastReport||""; (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>A.toast("Report copied"),()=>A.toast("Couldn't copy on this browser")); return; }
  if(d.dcap){ c.capacity=Math.max(60,Math.min(960,c.capacity+ +d.dcap)); A.save(); return render(true); }
  if(d.dweight){ const [k,v]=d.dweight.split("|"); c.weights[k]=+v; A.save(); return render(true); }
  if(d.dgoaladd){ D.goalNew=d.dgoaladd; return render(true); }
  if("dgoalcancel" in d){ D.goalNew=null; return render(true); }
  if("dgoalsave" in d){ const v=Math.max(1,parseInt($("dGoalT").value,10)||GOALS[D.goalNew].d); c.goals.push({id:"g"+Date.now().toString(36),type:D.goalNew,target:v,c:Date.now()}); D.goalNew=null; A.save(); A.toast("Goal added"); return render(true); }
  if(d.dgoaldel){ c.goals=c.goals.filter(g=>g.id!==d.dgoaldel); A.save(); return render(true); }
  if(d.dhab){ const [k,id]=d.dhab.split("|"), s=ST(); s.habitLog=s.habitLog||{}; const l=s.habitLog[k]=s.habitLog[k]||{}; if(l[id]) delete l[id]; else l[id]=Date.now(); if(!Object.keys(l).length) delete s.habitLog[k]; A.save(); return render(true); }
  if(d.dhabdel){ if(!confirm("Remove this habit and its history?")) return; const s=ST(); s.habits=(s.habits||[]).filter(h=>h.id!==d.dhabdel); Object.values(s.habitLog||{}).forEach(l=>delete l[d.dhabdel]); A.save(); return render(true); }
  if(d.dal){ const v=d.dv; if(d.dal==="go"){ const [k,id]=v.split("|"); close(); return A.goTask(k,id); } if(d.dal==="move"){ const [k,id]=v.split("|"); A.moveToTomorrow(k,id); A.toast("Moved to tomorrow"); return render(true); }
    if(d.dal==="plan"){ close(); return A.openPlanner("edit"); } if(d.dal==="sec") return setSec(v); if(d.dal==="drill") return openDrill(v); if(d.dal==="drillr") return openDrill(v); return; }
  if(d.ddismiss){ c.dismissed[d.ddismiss]=Date.now()+7*864e5; Object.keys(c.dismissed).forEach(k=>{ if(c.dismissed[k]<Date.now()) delete c.dismissed[k]; }); A.save(); return render(true); }
  if("dundismiss" in d){ c.dismissed={}; A.save(); return render(true); }
  if(d.dsess){ D.open=D.open===d.dsess?null:d.dsess; return render(true); }
  if(d.dsessfix){ const x=findSess(d.dsessfix); if(!x) return; const mins=Math.max(1,Math.min(960,parseInt($("dFix").value,10)||1)), now=Date.now();
    if(!x.fix) x.fix={at:now,e0:x.e||0,x0:x.x||"",p0:JSON.parse(JSON.stringify(x.p||[])),a0:A.sessActiveMs(x,now)/60000}; else x.fix.at=now;
    x.p=(x.p||[]).filter(q=>q.b).map(q=>({a:q.a,b:q.b})); let e=x.s+mins*60000; x.p.forEach(q=>{ if(q.a<e) e+=q.b-q.a; }); x.p=x.p.filter(q=>q.a<e); x.e=e; x.x="fixed"; A.save(); A.toast("Session corrected. The original is kept."); return render(true); }
  if(d.dsessundo){ const x=findSess(d.dsessundo); if(!x||!x.fix) return; x.e=x.fix.e0; x.x=x.fix.x0; x.p=x.fix.p0; delete x.fix; A.save(); A.toast("Original restored"); return render(true); }
}
function onChange(e){ const t=e.target;
  if(t.matches("[data-dzoom]")){ D.zoom=t.checked; return render(true); }
  if(t.matches("[data-dalert]")){ cfg().alerts[t.dataset.dalert]=t.checked; A.save(); return render(true); } }
window.addEventListener("keydown",e=>{ if(!isOpen()) return;
  if(e.key==="Escape"){ e.stopPropagation(); e.preventDefault(); if(!$("dPop").hidden){ $("dPop").hidden=true; return; } if($("dDrill").classList.contains("open")) return closeDrill(); return close(); }
  if(e.key==="Enter"||e.key==="ArrowLeft"||e.key==="ArrowRight") e.stopPropagation();   // keep the day view's shortcuts out of the dashboard
},true);
window.addEventListener("resize",()=>{ if(isOpen()) $("dPop").hidden=true; });
/* live: re-draw when data changes (another device, or a task finished) and once a minute for time-based numbers */
setInterval(()=>{ if(!isOpen()||document.hidden) return; if((ST().updatedAt||0)!==lastU) render(true); },4000);
setInterval(()=>{ if(isOpen()&&!document.hidden&&!document.activeElement.matches("input")) render(true); },60000);
window.HRDash={open,close,get open_(){ return isOpen(); }};
})();
