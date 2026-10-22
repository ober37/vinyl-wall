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
 // About info the background task (Part L) writes: one doc per artist, shared by that artist's records. Sample links only.
 artists:{
  "mb-miles":{name:"Miles Davis",source:"claude",wiki:"https://en.wikipedia.org/wiki/Miles_Davis",fetchedAt:1,
   summary:"Miles Davis (1926–1991) was an American jazz trumpeter, bandleader and composer, and one of the most influential figures in jazz.\n\nAcross five decades he was at the front of bebop, cool jazz, hard bop, modal jazz and jazz fusion, and his bands launched the careers of many of the music's great players.",
   links:[{kind:"website",url:"https://www.milesdavis.com/"},{kind:"instagram",url:"https://www.instagram.com/milesdavis/"},{kind:"youtube",url:"https://www.youtube.com/@MilesDavis"},
    {kind:"spotify",url:"https://open.spotify.com/artist/0kbYTNQb4Pb1rPbbaF0pT4"},{kind:"facebook",url:"https://www.facebook.com/MilesDavis"},{kind:"x",url:"https://x.com/milesdavis"},
    {kind:"website",url:"javascript:alert(1)"}]},
  "mb-beatles":{name:"The Beatles",source:"claude",wiki:"https://en.wikipedia.org/wiki/The_Beatles",fetchedAt:1,
   summary:"The Beatles were an English rock band formed in Liverpool in 1960: John Lennon, Paul McCartney, George Harrison and Ringo Starr. They are the best-selling music act of all time.\n\nWorking with producer George Martin, they moved from Merseybeat hits to studio-built albums such as Revolver and Sgt. Pepper's Lonely Hearts Club Band, which helped turn the album into an art form. They split in 1970, and each member went on to a solo career.",
   links:[{kind:"website",url:"https://www.thebeatles.com/"},{kind:"instagram",url:"https://www.instagram.com/thebeatles/"},{kind:"youtube",url:"https://www.youtube.com/@TheBeatles"}]}},
 gear:{
  t1:{type:"turntable",name:"Audio-Technica AT-LP120X",setup:"den",status:"active",tracks:true,startHours:0,minutes:38*60,added:1},
  c1:{type:"cartridge",name:"Audio-Technica AT-VM95E",setup:"den",status:"active",tracks:true,startHours:0,minutes:38*60,added:2},
  s1:{type:"stylus",name:"Audio-Technica ATN-VM95E",setup:"den",status:"active",tracks:true,ratedLow:300,ratedHigh:500,startHours:0,minutes:38*60,added:3},
  t2:{type:"turntable",name:"Technics SL-1500C",setup:"living",status:"active",tracks:true,startHours:0,minutes:410*60,added:4},
  c2:{type:"cartridge",name:"Ortofon 2M Red",setup:"living",status:"active",tracks:true,startHours:0,minutes:262*60,added:5},
  s2:{type:"stylus",name:"Ortofon 2M Red stylus",setup:"living",status:"active",tracks:true,ratedLow:300,ratedHigh:500,startHours:0,minutes:262*60,added:6},
  p1:{type:"speakers",name:"Bookshelf speakers",setup:"*",status:"active",tracks:false,installed:"2025-03-01",added:7}},
 records:{
  r1:{title:"Kind of Blue",artist:"Miles Davis",year:"1959",label:"Columbia",status:"own",runtime:46,why:"The record that taught me to sit still and listen.",pressing:"2015 Analogue Productions 45rpm 2LP (Discogs r7140383)",discogsId:7140383,catalog:"AAPJ 8163-45",
   matrix:"Side A: AAPJ 8163-45 A · Side B: AAPJ 8163-45 B · Side C: AAPJ 8163-45 C · Side D: AAPJ 8163-45 D (all etched, QRP)",
   mediaGrade:"NM",sleeveGrade:"VG+",shop:"A local record shop",paid:"48",acquired:"2024-03-02",
   artistRef:"mb-miles",aboutAt:1,about:{wiki:"https://en.wikipedia.org/wiki/Kind_of_Blue",source:"claude",
    summary:"Kind of Blue is Miles Davis's 1959 album with a sextet of John Coltrane, Cannonball Adderley, Bill Evans, Wynton Kelly, Paul Chambers and Jimmy Cobb.\n\nRecorded in two sessions at Columbia's 30th Street Studio with little rehearsal, it builds its pieces on modes rather than fast-moving chord changes, which gives the soloists room to stretch out. Bill Evans's spare, impressionistic voicings shaped its calm sound. It became the best-selling jazz album of all time and one of the most influential records in any genre, and it is often called the place to start with jazz.",
    released:"1959-08-17",label:"Columbia",producers:["Teo Macero","Irving Townsend"],recorded:"Columbia 30th Street Studio, New York · March 2 and April 22, 1959",genres:["Modal jazz","Cool jazz"],
    tracks:[{pos:"A",title:"So What",dur:"9:22"},{pos:"B1",title:"Freddie Freeloader",dur:"9:46"},{pos:"B2",title:"Blue in Green",dur:"5:37"},{pos:"C",title:"All Blues",dur:"11:33"},{pos:"D",title:"Flamenco Sketches",dur:"9:26"}],
    tracksSource:"discogs",tracksUrl:"https://www.discogs.com/release/7140383"},notes:[
   {d:day(400),t:"Played the whole album on Den (~46 min)"},{d:day(40),t:"Cleaned it before a spin."},
   {d:day(40),t:"Played the whole album at a friend's place."},{d:first,t:"Played one side on Den (~23 min)",side:"B",j:"Blue in Green floated tonight. Evans's intro is so quiet you lean in."},{d:day(0),t:"Played the whole album on Living room (~46 min). Side B hit different tonight."}],added:1},
  r2:{title:"Rumours",artist:"Fleetwood Mac",year:"1977",label:"Warner Bros.",status:"own",runtime:39,aboutAt:1,notes:[  // played enough for the 10+ hours badge
   ...Array.from({length:17},(_,i)=>({d:day(40+(16-i)*12),t:"Played the whole album on Living room (~39 min)"}))],added:2},
  r3:{title:"Blue Train",artist:"John Coltrane",year:"1957",label:"Blue Note",status:"own",runtime:42,notes:[{d:day(370),t:"Played the whole album on Den (~42 min)"}],added:3},
  r5:{title:"Aja",artist:"Steely Dan",year:"1977",status:"ordered",orderStatus:"shipped",eta:"2026-10-24",notes:[],added:5},
  r4:{title:"Abbey Road",artist:"The Beatles",year:"1969",status:"wish",priority:1,pressing:"UK first pressing",budget:"150",label:"Apple",catalog:"PCS 7088",notes:[],added:4,artistRef:"mb-beatles",aboutAt:1,
   about:{wiki:"https://en.wikipedia.org/wiki/Abbey_Road",source:"claude",
    summary:"Abbey Road is the Beatles' eleventh studio album, released in September 1969 and the last they recorded together, though Let It Be came out later.\n\nProduced by George Martin, it pairs standouts like Come Together and George Harrison's Something and Here Comes the Sun with the long medley that closes side two. Its polished sound made early use of the Moog synthesizer, and the cover photo of the band on the zebra crossing outside the studio became one of the most imitated images in popular music.",
    released:"1969-09-26",label:"Apple",producers:["George Martin"],recorded:"EMI Studios, Olympic and Trident, London · February–August 1969",genres:["Rock"],
    tracks:[["A1","Come Together","4:20"],["A2","Something","3:03"],["A3","Maxwell's Silver Hammer","3:27"],["A4","Oh! Darling","3:26"],["A5","Octopus's Garden","2:51"],["A6","I Want You (She's So Heavy)","7:47"],
     ["B1","Here Comes the Sun","3:05"],["B2","Because","2:45"],["B3","You Never Give Me Your Money","4:02"],["B4","Sun King","2:26"],["B5","Mean Mr. Mustard","1:06"],["B6","Polythene Pam","1:12"],
     ["B7","She Came In Through the Bathroom Window","1:57"],["B8","Golden Slumbers","1:31"],["B9","Carry That Weight","1:36"],["B10","The End","2:05"],["B11","Her Majesty","0:23"]].map(([pos,title,dur])=>({pos,title,dur})),
    tracksSource:"musicbrainz",tracksUrl:"https://musicbrainz.org/release-group/9162580e-5df4-32de-80cc-f45a8d8a9b1d"},researchLog:[
   {id:"ab2",at:day(3),headline:"Hunt the 2019 half-speed reissue under $40.",summary:"The 2019 anniversary mix is the best value; originals are for collectors.",pressings:["2019 50th Anniversary half-speed: best value"],price:"About $30-40 for 2019; firsts $150+."},
   {id:"ab1",at:day(60),headline:"UK first pressings are collector money.",summary:"Check the Her Majesty listing on the sleeve to spot a true first.",check:["Her Majesty not listed on the back"],price:"UK firsts $150-400."}]},
  r6:{title:"Pet Sounds",artist:"The Beach Boys",year:"1966",status:"wish",priority:3,notes:[],added:6}}};
if(q.get("data")){try{const x=new XMLHttpRequest();x.open("GET",q.get("data"),false);x.send();const snap=JSON.parse(x.responseText);
  for(const c of ["settings","setups","gear","records","artists"]) if(snap[c]) data[c]=snap[c]; data.settings.site=data.settings.site||{};}catch(e){console.warn("Couldn't load snapshot",e)}}
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
// stored images for export/import: uploads land here and /_blob/<id> serves them (window.__failUpload makes uploads fail)
const blobs={};window.__blobs=blobs;
const realFetch=window.fetch.bind(window);
window.fetch=(u,...o)=>{const m=typeof u==="string"&&u.match(/^\/_blob\/(.+)$/);
  if(!m)return realFetch(u,...o);const b=blobs[decodeURIComponent(m[1])];
  return Promise.resolve(b?new Response(b,{status:200}):new Response("",{status:404}))};
const assetsCap={upload:async b=>{if(window.__failUpload)throw Object.assign(new Error("upload failed"),{code:"unavailable"});
    const id="a"+Math.random().toString(36).slice(2,10);blobs[id]=b;window.__calls.push(["assets.upload",id]);return {id,url:"/_blob/"+id,sizeBytes:b.size,contentType:b.type}},
  list:async()=>({assets:Object.keys(blobs).map(id=>({id})),usage:{}}),delete:async id=>{delete blobs[id]}};
window.claude={use:async n=>
  n==="db"?{collection:coll,doc:p=>{const i=p.lastIndexOf("/");return docRef(p.slice(0,i),p.slice(i+1))}}:
  n==="assets"?assetsCap:
  n==="user"?{canEdit:async()=>true,isOwner:async()=>true,id:async()=>"u1"}:
  n==="mcp"&&!q.has("nomcp")?{callTool:async(...a)=>{window.__calls.push(a);const l=JSON.parse(sessionStorage.getItem("__callLog")||"[]");l.push([a[1],Object.keys(a[2]||{})]);sessionStorage.setItem("__callLog",JSON.stringify(l));return {}}}:
  n==="downloads"?{save:async({filename,data})=>{window.__calls.push(["downloads.save",filename]);window.__lastSave=data;
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data]));a.download=filename;a.click();return {status:"saved"}}}:
  // Claude for the research chat: canned replies, streamed like the real thing, and a canned summary for Save summary
  n==="sample"?Object.assign(async(input,opts={})=>{const msgs=Array.isArray(input)?input:[{role:"user",content:String(input)}];window.__calls.push(["sample",msgs.length]);
    const q=msgs[msgs.length-1].content.split("\n\n").pop().trim();
    // canned answers for the starter questions; anything else says plainly that the preview can't ask Claude
    const canned={"Which pressing should I hunt?":"For a great-sounding copy, the 2019 50th Anniversary half-speed is the best value. UK 1969 first pressings on Apple (PCS 7088) are collector money.\n- Check the runout and the label against the Discogs entry",
      "What should it cost?":"Expect about $30-40 for the 2019 edition in near-mint shape. Clean UK first pressings run $150-400 depending on condition.",
      "How do I spot a first pressing?":"A UK first has Her Majesty missing from the back sleeve, a misaligned Apple logo on the label, and a matrix ending -1 on both sides.",
      "What's my copy worth?":"Recent sales of this pressing in similar condition land around $40-60. What it sells for, under Your copy, shows real sales."};
    const text=window.fakeReply||canned[q]||`This is the preview, so there's no real Claude to ask. On your wall, Claude would answer "${q}" here.`;
    for(let i=40;i<text.length;i+=40){opts.onText&&opts.onText({text:text.slice(0,i),delta:""});await new Promise(r=>setTimeout(r,30))}
    opts.onText&&opts.onText({text,delta:""});return {text,truncated:false}},
   {json:async()=>window.fakeSample||{headline:"Hunt the 2019 half-speed reissue under $40.",summary:"The 2019 half-speed is the best value; UK firsts are for collectors.",pressings:["2019 50th Anniversary half-speed: best value","1969 UK first pressing: collector money"],check:["Runout matches the Discogs entry","Watch for warps"],where:["Discogs","Local shops"],price:"About $30-40 for 2019; firsts $150+."}}):
  null};
})();
