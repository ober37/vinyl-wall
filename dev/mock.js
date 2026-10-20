/* A stand-in for the claude.ai runtime (window.claude) so the page can run in a plain browser.
   Data lives in memory; writes re-emit snapshots like the real database. URL flags pick a scenario:
   ?empty  empty wall      ?dz  Discogs connected      ?dz&stale  import stuck for 15 min
   ?data=<file>  load a wall snapshot (a JSON file in dev/, never committed) instead of the sample data
   ?nomcp  no background task (e.g. a shared view)     ?up=available|none
   Calls the page makes to connectors are recorded in window.__calls; Export saves a real file through the browser. */
(function(){
const q=new URLSearchParams(location.search), now=Date.now();
// play note dates: n days back, as a local date like the page's today(); first is the 1st of this month
const day=n=>{const t=new Date(now-n*864e5);return new Date(t-t.getTimezoneOffset()*6e4).toISOString().slice(0,10)}, first=day(0).slice(0,8)+"01";
const data={
 settings:{site:{title:"My Vinyl Wall",bg:{kind:"preset",preset:"listening"},discogs:{}}},
 setups:{den:{name:"Den",note:"",added:1},living:{name:"Living room",note:"Main hi-fi",added:2}},
 gear:{
  t1:{type:"turntable",name:"Audio-Technica AT-LP120X",setup:"den",status:"active",tracks:true,startHours:0,minutes:38*60,added:1},
  c1:{type:"cartridge",name:"Audio-Technica AT-VM95E",setup:"den",status:"active",tracks:true,startHours:0,minutes:38*60,added:2},
  s1:{type:"stylus",name:"Audio-Technica ATN-VM95E",setup:"den",status:"active",tracks:true,ratedLow:300,ratedHigh:500,startHours:0,minutes:38*60,added:3},
  t2:{type:"turntable",name:"Technics SL-1500C",setup:"living",status:"active",tracks:true,startHours:0,minutes:410*60,added:4},
  c2:{type:"cartridge",name:"Ortofon 2M Red",setup:"living",status:"active",tracks:true,startHours:0,minutes:262*60,added:5},
  s2:{type:"stylus",name:"Ortofon 2M Red stylus",setup:"living",status:"active",tracks:true,ratedLow:300,ratedHigh:500,startHours:0,minutes:262*60,added:6},
  p1:{type:"speakers",name:"Bookshelf speakers",setup:"*",status:"active",tracks:false,installed:"2025-03-01",added:7}},
 records:{
  r1:{title:"Kind of Blue",artist:"Miles Davis",year:"1959",label:"Columbia",status:"own",runtime:46,why:"The record that taught me to sit still and listen.",pressing:"2015 Analogue Productions 45rpm",mediaGrade:"NM",sleeveGrade:"VG+",shop:"A local record shop",paid:"48",acquired:"2024-03-02",notes:[
   {d:day(400),t:"Played the whole album on Den (~46 min)"},{d:day(40),t:"Cleaned it before a spin."},
   {d:day(40),t:"Played the whole album at a friend's place."},{d:first,t:"Played one side on Den (~23 min)"},{d:day(0),t:"Played the whole album on Living room (~46 min). Side B hit different tonight."}],added:1},
  r2:{title:"Rumours",artist:"Fleetwood Mac",year:"1977",label:"Warner Bros.",status:"own",runtime:39,notes:[  // played enough for the 10+ hours badge
   ...Array.from({length:17},(_,i)=>({d:day(40+(16-i)*12),t:"Played the whole album on Living room (~39 min)"}))],added:2},
  r3:{title:"Blue Train",artist:"John Coltrane",year:"1957",label:"Blue Note",status:"own",runtime:42,notes:[{d:day(370),t:"Played the whole album on Den (~42 min)"}],added:3},
  r5:{title:"Aja",artist:"Steely Dan",year:"1977",status:"ordered",orderStatus:"shipped",eta:"2026-10-24",notes:[],added:5},
  r4:{title:"Abbey Road",artist:"The Beatles",year:"1969",status:"wish",priority:1,notes:[],added:4,researchLog:[
   {id:"ab2",at:day(3),headline:"Hunt the 2019 half-speed reissue under $40.",summary:"The 2019 anniversary mix is the best value; originals are for collectors.",pressings:["2019 50th Anniversary half-speed: best value"],price:"About $30-40 for 2019; firsts $150+."},
   {id:"ab1",at:day(60),headline:"UK first pressings are collector money.",summary:"Check the Her Majesty listing on the sleeve to spot a true first.",check:["Her Majesty not listed on the back"],price:"UK firsts $150-400."}]},
  r6:{title:"Pet Sounds",artist:"The Beach Boys",year:"1966",status:"wish",priority:3,notes:[],added:6}}};
if(q.get("data")){try{const x=new XMLHttpRequest();x.open("GET",q.get("data"),false);x.send();const snap=JSON.parse(x.responseText);
  for(const c of ["settings","setups","gear","records"]) if(snap[c]) data[c]=snap[c]; data.settings.site=data.settings.site||{};}catch(e){console.warn("Couldn't load snapshot",e)}}
const site=data.settings.site;
if(q.has("empty")){data.records={};data.gear={}}
if(!q.has("nomcp")) site.taskId="trig_preview";
if(q.has("dz")){site.discogs={username:"tester",hasToken:true,last4:"ABCD",status:"ok",verifiedUser:"tester",importMsg:""};
  if(q.has("stale")) Object.assign(site.discogs,{importRequested:true,importRequestedAt:now-15*60000})}
const up=q.get("up");
if(up) site.update={available:{latest:"9.0.0",checkedMs:now},none:{latest:"0.0.1",checkedMs:now}}[up];
const L={};const snap=c=>({docs:Object.entries(data[c]||{}).map(([id,d])=>({id,exists:true,data:()=>d})),size:0,empty:false,docChanges:()=>[],metadata:{}});
const emit=c=>(L[c]||[]).forEach(n=>n(snap(c)));
const coll=c=>({onSnapshot(n){(L[c]=L[c]||[]).push(n);setTimeout(()=>n(snap(c)),0);return()=>{}},doc(id){return docRef(c,id||Math.random().toString(36).slice(2))},get:async()=>snap(c),where(){return this},orderBy(){return this},limit(){return this}});
const docRef=(c,id)=>({id,path:c+"/"+id,
  onSnapshot(n){const f=()=>{const d=(data[c]||{})[id];n({id,exists:!!d,data:()=>d,metadata:{}})};(L[c]=L[c]||[]).push(f);setTimeout(f,0);return()=>{}},
  get:async()=>({exists:!!(data[c]||{})[id],data:()=>(data[c]||{})[id]}),
  set:async v=>{(data[c]=data[c]||{})[id]={...v};setTimeout(()=>emit(c),0)},
  update:async v=>{(data[c]=data[c]||{})[id]={...((data[c]||{})[id]||{}),...v};setTimeout(()=>emit(c),0)},
  delete:async()=>{delete (data[c]||{})[id];setTimeout(()=>emit(c),0)}});
window.__data=data;window.__emit=emit;window.__calls=[];
window.claude={use:async n=>
  n==="db"?{collection:coll,doc:p=>{const i=p.lastIndexOf("/");return docRef(p.slice(0,i),p.slice(i+1))}}:
  n==="user"?{canEdit:async()=>true,isOwner:async()=>true,id:async()=>"u1"}:
  n==="mcp"&&!q.has("nomcp")?{callTool:async(...a)=>{window.__calls.push(a);const l=JSON.parse(sessionStorage.getItem("__callLog")||"[]");l.push([a[1],Object.keys(a[2]||{})]);sessionStorage.setItem("__callLog",JSON.stringify(l));return {}}}:
  n==="downloads"?{save:async({filename,data})=>{window.__calls.push(["downloads.save",filename]);
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data]));a.download=filename;a.click();return {status:"saved"}}}:
  n==="sample"?{json:async()=>window.fakeSample||{headline:"Hunt the 2019 half-speed reissue under $40.",summary:"The 2019 half-speed is the best value; UK firsts are for collectors.",pressings:["2019 50th Anniversary half-speed: best value","1969 UK first pressing: collector money"],check:["Runout matches the Discogs entry","Watch for warps"],where:["Discogs","Local shops"],price:"About $30-40 for 2019; firsts $150+."}}:
  null};
})();
