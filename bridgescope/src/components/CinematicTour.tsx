import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Activity, ArrowRight, BellRing, Box, Check, Download, Layers3, Move3D, Pause, Play, Radio, RefreshCcw, ShieldCheck, Thermometer, Truck, X, Zap } from 'lucide-react';
import type { Analysis } from '../types';

type Props = {analysis: Analysis; selected: number; onSelect: (zone:number)=>void; onClose: ()=>void; onExport: ()=>void; autoPlay?: boolean};

const zoneX=(zone:number)=>-27.5+(zone-1)*5;
const stageRanges=[[0,.16],[.16,.34],[.34,.54],[.54,.74],[.74,.90],[.90,1.01]] as const;
const stages=[
 {eyebrow:'01 · THE STRUCTURE',title:'A bridge is always speaking.',body:'Ambient excitation from traffic and wind produces a vibration response at every sensor location.',icon:Box},
 {eyebrow:'02 · OBSERVATION',title:'Twelve synchronized sensors listen.',body:'The bridge response is synchronized across sensors. Correspondence between sensor motions becomes a mode shape.',icon:Radio},
 {eyebrow:'03 · CONTEXT',title:'Temperature and traffic can change the same signal.',body:'The healthy model predicts the modal change expected under known environmental and load conditions before any structural finding is made.',icon:Thermometer},
 {eyebrow:'04 · RESIDUAL',title:'The unexplained part becomes evidence.',body:'Compensated frequency residuals identify the part of the modal change that is not explained by the current scenario.',icon:Activity},
 {eyebrow:'05 · LOCALIZATION',title:'Structural evidence maps to a suspected zone.',body:'Candidate zones and stiffness reductions are compared against frequencies and modal shapes. Compatible alternatives remain visible.',icon:Zap},
 {eyebrow:'06 · DECISION',title:'Evidence supports review—not a blind decision.',body:'The result can be exported with its assumptions, limitations, and modality evidence for engineering review.',icon:ShieldCheck},
];

export default function CinematicTour({analysis,selected,onSelect,onClose,onExport,autoPlay=true}:Props){
 const shell=useRef<HTMLDivElement>(null), host=useRef<HTMLDivElement>(null), progressRef=useRef(0), playingRef=useRef(autoPlay), scrollLock=useRef(false);
 const latest=useRef({analysis,selected,onSelect});latest.current={analysis,selected,onSelect};
 const [progress,setProgress]=useState(0),[playing,setPlaying]=useState(autoPlay),[webgl,setWebgl]=useState(true);
 const safeProgress=Math.min(1,Math.max(0,progress));
 const active=Math.min(5,Math.max(0,stageRanges.findIndex(r=>safeProgress>=r[0]&&safeProgress<r[1])));
 const activeStage=stages[Math.max(0,active)];const ActiveIcon=activeStage.icon;
 const probable=useMemo(()=>{const zone=analysis.localization.zone??selected;const companions=analysis.localization.ranking.filter(r=>r.zone!==zone&&r.score>.35).sort((a,b)=>b.score-a.score).slice(0,2);return {zone,companions};},[analysis,selected]);
 const seek=(value:number)=>{const p=Math.min(1,Math.max(0,value));progressRef.current=p;setProgress(p);if(shell.current){scrollLock.current=true;const max=shell.current.scrollHeight-shell.current.clientHeight;requestAnimationFrame(()=>{shell.current?.scrollTo({top:max*p,behavior:'auto'});scrollLock.current=false;});}};
 const restart=()=>{seek(0);setPlaying(true);playingRef.current=true;};
 useEffect(()=>{
  if(!host.current)return;const container=host.current;
  const scene=new THREE.Scene();
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{setWebgl(false);return;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));renderer.setSize(container.clientWidth,container.clientHeight);renderer.setClearColor('#0a121c',0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(28,container.clientWidth/container.clientHeight,.1,400);
  const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;const smooth=(x:number)=>x*x*(3-2*x);
  scene.fog=new THREE.Fog('#0b151f',50,155);
  scene.add(new THREE.HemisphereLight('#d2e7f3','#14202b',2.8));
  const sun=new THREE.DirectionalLight('#fff0d4',3.8);sun.position.set(-24,44,31);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-55;sun.shadow.camera.right=55;sun.shadow.camera.top=45;sun.shadow.camera.bottom=-45;sun.shadow.normalBias=.035;scene.add(sun);
  const cyan=new THREE.DirectionalLight('#557fa5',1.35);cyan.position.set(28,18,-26);scene.add(cyan);
  const material=(color:string,rough=.75,metal=.04)=>new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal});
  const concrete=material('#8b979e',.8),concreteDark=material('#596c78',.86),pier=material('#687e87',.85),asphalt=material('#243545',.71,.05),rail=material('#a8b7ba',.38,.35),groundMat=material('#102433',.95);
  const deckGroups:THREE.Group[]=[],roadZones:THREE.Mesh[]=[],sensorMeshes:THREE.Mesh[]=[],sensorRings:THREE.Mesh[]=[],modePoints:THREE.Mesh[]=[];
  function box(w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;}
  function rounded(w:number,h:number,d:number,mat:THREE.Material){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);body.castShadow=true;body.receiveShadow=true;g.add(body);scene.add(g);return g;}
  // Terrain and water.
  const ground=box(105,.35,68,0,-4.1,0,groundMat);ground.receiveShadow=true;
  const water=box(29,.035,68,0,-3.88,0,new THREE.MeshStandardMaterial({color:'#153a4b',roughness:.18,metalness:.45,transparent:true,opacity:.82}));water.receiveShadow=true;
  const waveLines:THREE.Line[]=[];for(let i=0;i<18;i++){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-12,-3.84,-31+i*3.6),new THREE.Vector3(12,-3.84,-31+i*3.6)]),new THREE.LineBasicMaterial({color:'#356070',transparent:true,opacity:.32}));line.userData.phase=i*.6;waveLines.push(line);scene.add(line);}
  for(const [x,z,s] of [[-42,-25,4],[-35,25,5],[37,-28,7],[44,21,4],[-47,8,7],[42,31,8]] as const){const tree=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.15,.22,2.3,7),material('#4d4536',.9));trunk.position.y=-2.9;const crown=new THREE.Mesh(new THREE.ConeGeometry(s*.55,4.5,8),material('#173c36',.95));crown.position.y=-.7;tree.add(trunk,crown);tree.position.set(x,-4,z);scene.add(tree);}
  // Substructure.
  for(const x of [-15,15]){for(const z of [-2,2]){box(1.18,7,1.18,x,.25,z,pier);box(1.55,.65,6.9,x,3.02,0,pier);}box(3.3,.75,5.2,x,-3.15,0,pier);}
  for(const x of [-30,30])box(2.2,7.25,7.3,x,.15,0,pier);
  // Bridge approach slabs.
  box(12,.48,7.2,-36,3.95,0,concrete);box(12,.48,7.2,36,3.95,0,concrete);
  box(12,.08,6,-36,4.21,0,asphalt);box(12,.08,6,36,4.21,0,asphalt);
  // Damaged-zone deck groups and bridge character.
  const deckY=4.1, roadY=4.42;
  for(let i=1;i<=12;i++){
   const x=zoneX(i), group=new THREE.Group();
   const girder=new THREE.Mesh(new THREE.BoxGeometry(4.95,.58,7),material('#7f8f98',.78));girder.castShadow=true;girder.receiveShadow=true;group.add(girder);
   const soffit=new THREE.Mesh(new THREE.BoxGeometry(4.95,.45,4.5),concreteDark);soffit.position.y=-.52;soffit.castShadow=true;group.add(soffit);
   const leftCantilever=new THREE.Mesh(new THREE.BoxGeometry(4.95,.55,1.12),concrete);leftCantilever.position.set(0,.22,-3.05);leftCantilever.castShadow=true;group.add(leftCantilever);
   const rightCantilever=leftCantilever.clone();rightCantilever.position.z=3.05;group.add(rightCantilever);
   const deckMat=material('#89979f',.77);const deck=new THREE.Mesh(new THREE.BoxGeometry(4.95,.2,6.7),deckMat);deck.position.y=.39;deck.castShadow=true;deck.receiveShadow=true;group.add(deck);deck.userData.zone=i;
   const road=new THREE.Mesh(new THREE.BoxGeometry(4.95,.045,5.8), asphalt.clone());road.position.y=.525;road.userData.zone=i;group.add(road);roadZones.push(road);
   group.position.set(x,deckY,0);scene.add(group);deckGroups.push(group);
   for(const z of [-3.28,3.28]){const rail1=new THREE.Mesh(new THREE.BoxGeometry(4.95,.14,.13),rail);rail1.position.set(x,4.76,z);rail1.castShadow=true;scene.add(rail1);const base=new THREE.Mesh(new THREE.BoxGeometry(4.95,.22,.18),concreteDark);base.position.set(x,4.58,z);base.userData.groupi=i;scene.add(base);}
  }
  for(let x=-28.3;x<30;x+=1.9)box(.58,.035,.055,x,4.49,0,material('#b9c5c6',.45,.25));
  for(const z of [-2.92,2.92])box(60,.025,.05,0,4.475,z,material('#c9d3cf',.5,.2));
  for(let x=-29;x<30;x+=2){for(const z of [-3.28,3.28])box(.09,.62,.09,x,4.78,z,rail);}
  // Dimension frame and sensors.
  const dimMat=new THREE.LineBasicMaterial({color:'#7da2b5',transparent:true,opacity:.38});
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-30,-2.95,12),new THREE.Vector3(30,-2.95,12)]),dimMat));
  for(let i=1;i<=12;i++){
   const x=zoneX(i),sensorMat=material('#8bc3b9',.27,.4);
   const sensor=new THREE.Mesh(new THREE.SphereGeometry(.23,18,14),sensorMat);sensor.position.set(x,4.9,2.35);sensor.castShadow=true;sensor.userData.zone=i;scene.add(sensor);sensorMeshes.push(sensor);
   const mast=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.64,10),material('#c4cfd1',.5,.25));mast.position.set(x,4.55,2.35);scene.add(mast);
   const ring=new THREE.Mesh(new THREE.RingGeometry(.35,.47,36),new THREE.MeshBasicMaterial({color:'#8bc3b9',transparent:true,opacity:.2,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(x,4.81,2.35);scene.add(ring);sensorRings.push(ring);
   const canvas=document.createElement('canvas');canvas.width=256;canvas.height=82;const ctx=canvas.getContext('2d')!;ctx.textAlign='center';ctx.font='600 34px monospace';ctx.fillStyle='#d6e6e8';ctx.fillText(`S${String(i).padStart(2,'0')}`,128,50);const texture=new THREE.CanvasTexture(canvas);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.scale.set(2.55,.82,1);sprite.position.set(x,5.8,2.42);scene.add(sprite);
   const point=new THREE.Mesh(new THREE.SphereGeometry(.12,12,8),new THREE.MeshBasicMaterial({color:'#e9d093',transparent:true,opacity:.12}));point.position.set(x,4.6,-2.5);scene.add(point);modePoints.push(point);
  }
  // Traffic vehicles: emission headlights and simple shadows.
  type Vehicle={group:THREE.Group;lane:number;offset:number;speed:number;direction:number};
  const vehicles:Vehicle[]=[];
  for(let i=0;i<6;i++){
   const direction=i%2?1:-1, lane=i%2?1.25:-1.25, g=rounded(1.32+i*.03,.58,2.3,i%3===0?material('#a46d52',.6,.2):i%3===1?material('#586d74',.65,.16):material('#7f8e90',.62,.16));
   const cab=new THREE.Mesh(new THREE.BoxGeometry(.95,.53,1.05),material('#4f626c',.5,.15));cab.position.set(0,.53,-.38);g.add(cab);
   const light1=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),new THREE.MeshBasicMaterial({color:direction>0?'#ffe3a5':'#f36b5f'}));light1.position.set(-.36,.05,-1.12*direction);g.add(light1);const light2=light1.clone();light2.position.x=.36;g.add(light2);
   const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.6,2.7),new THREE.MeshBasicMaterial({color:'#000',transparent:true,opacity:.24,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.33;g.add(shadow);g.position.y=4.78;
   const car={group:g,lane,offset:i*.17,speed:.018+i*.003,direction};vehicles.push(car);
  }
  // Evidence pulse rods leading to the candidate zone.
  const evidenceTubes:THREE.Mesh[]=[];
  for(const point of [[-16,6.7,5],[0,6.5,5.8],[13,6.7,5]] as const){const curveLine=[new THREE.Vector3(point[0],point[1],point[2]),new THREE.Vector3((point[0]+zoneX(analysis.localization.zone??selected))/2,7.7,2.6),new THREE.Vector3(zoneX(analysis.localization.zone??selected),5.4,0)];const curve=new THREE.CatmullRomCurve3(curveLine);const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,48,.025,8,false),new THREE.MeshBasicMaterial({color:'#d7a860',transparent:true,opacity:.13}));scene.add(tube);evidenceTubes.push(tube);}
  // Persistent damage-location and ambiguity markers.
  const beaconRing=new THREE.Mesh(new THREE.RingGeometry(1.15,1.25,64),new THREE.MeshBasicMaterial({color:'#f0bd69',transparent:true,opacity:0,side:THREE.DoubleSide}));beaconRing.rotation.x=-Math.PI/2;scene.add(beaconRing);
  const beaconTower=new THREE.Mesh(new THREE.CylinderGeometry(.12,.5,4.8,18,1,true),new THREE.MeshBasicMaterial({color:'#f0bd69',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));scene.add(beaconTower);
  const zoneLight=new THREE.PointLight('#e8b86b',0,27,2);scene.add(zoneLight);
  const alternativeRings:THREE.Mesh[]=[];
  for(let i=1;i<=12;i++){const ring=new THREE.Mesh(new THREE.RingGeometry(.8,.9,40),new THREE.MeshBasicMaterial({color:'#c19a67',transparent:true,opacity:0,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(zoneX(i),4.67,0);scene.add(ring);alternativeRings.push(ring);}
  // Bridge rules and landmarks.
  const landmark=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-30,-3,-15),new THREE.Vector3(-30,2,-15)]),new THREE.LineBasicMaterial({color:'#7ba0b0',transparent:true,opacity:.45}));scene.add(landmark);
  // Camera path.
  const zx=zoneX(analysis.localization.zone??selected);
  const cameraCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(53,25,58),new THREE.Vector3(23,19,47),new THREE.Vector3(-12,9,31),new THREE.Vector3(zx-8,8,25),new THREE.Vector3(zx+6,10,20),new THREE.Vector3(48,20,48)]);
  const targetCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,2.5,0),new THREE.Vector3(0,3,0),new THREE.Vector3(0,4,0),new THREE.Vector3(zx,4.15,0),new THREE.Vector3(zx,4.15,0),new THREE.Vector3(0,4,0)]);
  let last=performance.now();
  const loop=()=>{
   const now=performance.now(),dt=(now-last)/1000;last=now;
   if(playingRef.current){const next=Math.min(1.001,progressRef.current+dt/42);if(Math.abs(next-progressRef.current)>.002){progressRef.current=next;if(next>=1){playingRef.current=false;setPlaying(false);}setProgress(Math.min(1,next));}}
   const p=ease(progressRef.current),time=now/1000;
   cameraCurve.getPoint(p,camera.position);const target=targetCurve.getPoint(p);camera.lookAt(target);camera.updateMatrixWorld();
   // Animate environment and traffic.
   waveLines.forEach(line=>{line.position.x=Math.sin(time*.65+line.userData.phase)*.6;(line.material as THREE.LineBasicMaterial).opacity=.25+Math.sin(time+line.userData.phase)*.08;});
   vehicles.forEach(v=>{const distance=72,s=((time*v.speed*10+v.offset)%1)*distance;v.group.position.x=v.direction>0?-36+s:36-s;v.group.position.z=v.lane;v.group.rotation.y=v.direction>0?0:Math.PI;});
   // Modal deformation is exaggerated and normalized.
   const shape=analysis.modes.find(m=>m.mode===2)?.observed_shape??analysis.modes[0].observed_shape;
   const osc=Math.sin(time*2.2);
   deckGroups.forEach((g,i)=>{const motion=(shape[i]??Math.sin((i+.5)/12*Math.PI))*osc*.28;g.position.y=deckY+motion*.45;const sens=sensorMeshes[i];if(sens)sens.position.y=4.9+motion*.45*.85;sensorRings[i].position.y=4.81+motion*.45*.85;modePoints[i].position.y=4.6+motion*.5;});
   // Stage intensity.
   const sensorOn=intensity(p,.13,.39),contextOn=intensity(p,.34,.58),residualOn=intensity(p,.54,.79),beaconOn=intensity(p,.74,1.01);
   sensorMeshes.forEach((s,i)=>{const pulse=.5+.5*Math.sin(time*3-i*.4);s.scale.setScalar(1+sensorOn*pulse*.28);(s.material as THREE.MeshStandardMaterial).color.set(sensorOn>.2?'#d8c27e':'#8bc3b9');});
   sensorRings.forEach((r,i)=>{const pulse=(time*.65+i/12)%1,radius=.8+pulse*1.55;r.scale.set(radius,radius,1);(r.material as THREE.MeshBasicMaterial).opacity=sensorOn*(1-pulse)*.38;});
   modePoints.forEach((m,i)=>{(m.material as THREE.MeshBasicMaterial).opacity=residualOn*(.12+.48*Math.abs(shape[i]??0));});
   const current=latest.current.analysis.localization.zone??latest.current.selected;
   roadZones.forEach((r,i)=>{const z=i+1;let alpha=0;if(z===current)alpha=beaconOn;else if(latest.current.analysis.localization.ranking[i]?.score>.35)alpha=beaconOn*.23;const mat=r.material as THREE.MeshStandardMaterial;mat.color.set(alpha?('#d9a956' as string):'#243545');mat.emissive.set(alpha?'#5c3f17':'#000');mat.emissiveIntensity=alpha*(.5+.35*Math.sin(time*3));});
   const cand=latest.current.analysis.localization.zone??latest.current.selected;
   beaconRing.position.set(zoneX(cand),4.68,0);
   beaconRing.scale.setScalar(1+.14*Math.sin(time*4));
   (beaconRing.material as THREE.MeshBasicMaterial).opacity=beaconOn*(.35+.25*Math.sin(time*4));
   beaconTower.position.set(zoneX(cand),6.9,0);
   (beaconTower.material as THREE.MeshBasicMaterial).opacity=beaconOn*(.10+.05*Math.sin(time*4));
   alternativeRings.forEach((ring,i)=>{const fit=(i+1)!==cand?latest.current.analysis.localization.ranking[i]?.score??0:0;(ring.material as THREE.MeshBasicMaterial).opacity=beaconOn*(fit>.35?fit*.17:0);});
   zoneLight.position.set(zoneX(cand),6.2,0);zoneLight.intensity=beaconOn*3.3;
   evidenceTubes.forEach((tube,i)=>{(tube.material as THREE.MeshBasicMaterial).opacity=residualOn*(.08+.08*Math.sin(time*2.4-i));});
   renderer.render(scene,camera);
   frame=requestAnimationFrame(loop);
  };
  function intensity(p:number,a:number,b:number){return p<=a?0:p>=b?1:(p-a)/(b-a);}
  function ease(x:number){return Math.pow(x,1.08);}
  let frame=requestAnimationFrame(loop);
  const observer=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;if(w&&h){camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}});observer.observe(container);
  return()=>{playingRef.current=false;cancelAnimationFrame(frame);observer.disconnect();scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){o.geometry?.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}if(o instanceof THREE.Sprite){o.material.map?.dispose();o.material.dispose();}});renderer.dispose();renderer.domElement.remove();};
 },[]);
 useEffect(()=>{
  const element=shell.current;if(!element)return;
  const handler=()=>{if(scrollLock.current)return;const max=element.scrollHeight-element.clientHeight;if(max<=0)return;const p=Math.min(1,Math.max(0,element.scrollTop/max));if(playingRef.current){setPlaying(false);playingRef.current=false;}progressRef.current=p;setProgress(p);};
  element.addEventListener('scroll',handler,{passive:true});return()=>element.removeEventListener('scroll',handler);
 },[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();if(e.key==='ArrowRight')seek(Math.min(1,progressRef.current+.16));if(e.key==='ArrowLeft')seek(Math.max(0,progressRef.current-.16));};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
 const playToggled=()=>{const next=!playing;setPlaying(next);playingRef.current=next;if(next&&progressRef.current>=1)seek(0);};
 const scenario=analysis.scenario,local=analysis.localization;
 return <div className="presentation-tour" ref={shell}>
  <div className="tour-stage-wrap">
   {webgl?<div className="tour-canvas" ref={host}/>:<div className="tour-fallback"><Move3D size={40}/><strong>Cinematic 3D requires WebGL</strong><span>The dashboard remains available from the normal view.</span></div>}
   <div className="tour-vignette"/><div className="tour-grain"/>
   <header className="tour-header"><div className="tour-brand"><span className="tour-logo"><Layers3 size={17}/></span><span>BridgeScope <small>EVIDENCE TOUR</small></span></div><div className="tour-actions"><button className="tour-icon" aria-label={playing?'Pause presentation':'Play presentation'} onClick={playToggled}>{playing?<Pause size={16}/>:<Play size={16}/>}</button><button className="tour-icon" aria-label="Restart presentation" onClick={restart}><RefreshCcw size={15}/></button><button className="tour-icon" aria-label="Close presentation" onClick={onClose}><X size={17}/></button></div></header>
   <div className="tour-progress" aria-label={`Presentation progress ${Math.round(safeProgress*100)} percent`}><i style={{width:`${safeProgress*100}%`}}/></div>
   <aside className="tour-dots" aria-label="Presentation sections">{stages.map((s,i)=><button key={s.title} className={i===active?'active':''} onClick={()=>seek(stageRanges[i][0]+.001)} aria-label={`Go to section ${i+1}: ${s.eyebrow}`}><i/><span>{s.eyebrow}</span></button>)}</aside>
   <div className="tour-copy" key={active} aria-live="polite">
    <div className="tour-eyebrow"><ActiveIcon size={16}/>{activeStage.eyebrow}</div>
    <h1>{activeStage.title}</h1>
    <p>{activeStage.body}</p>
    {active===0&&<div className="tour-meta"><span><Truck size={13}/>{scenario.traffic} veh/min</span><span><Thermometer size={13}/>{scenario.temperature}°C</span><span><Radio size={13}/>12 channels</span></div>}
    {active===2&&<div className="tour-evidence-card"><small>ENVIRONMENT-CONDITIONED CHANGE</small><strong>{signedPercent(analysis.environmental_shift_pct)}</strong><span>predicted first-mode change</span></div>}
    {active===3&&<div className="tour-metrics"><span>f₁ residual <b>{signedHz(analysis.modes[0].residual_hz)}</b></span><span>modes outside tolerance <b>{analysis.modes_exceeding_tolerance} / {analysis.matched_modes}</b></span><span>mean MAC <b>{analysis.mean_mac.toFixed(3)}</b></span></div>}
    {active===4&&<div className="tour-zone-card"><small>SUSPECTED ZONE</small><strong>{zoneName(probable.zone)}</strong><p>{(probable.zone-1)*5}–{probable.zone*5} m from west abutment</p><span>Primary fit · relative index, not probability</span>{probable.companions.length>0&&<em>Also compatible: {probable.companions.map(c=>zoneName(c.zone)).join(', ')}</em>}</div>}
    {active===5&&<div className="tour-endcard"><span><ShieldCheck size={18}/>Evidence, not a blind alert</span><button className="button primary" onClick={onExport}><Download size={15}/> Export engineering report</button></div>}
   </div>
   <div className="tour-scrub"><span>{Math.round(safeProgress*100)}%</span><div><i style={{width:`${safeProgress*100}%`}}/></div><button onClick={()=>seek(Math.min(1,progressRef.current+.16))}>Next <ArrowRight size={14}/></button></div>
   <div className="tour-pill" title="Localization shown is a model-based suspected zone."><BellRing size={13}/><span>Primary location <b>{zoneName(probable.zone)}</b></span><em>SUSPECTED · NOT CONFIRMED</em></div>
  </div>
  <div className="tour-scroll-space" aria-hidden="true">{stages.map((_,i)=><div key={i} className="tour-scroll-section"/>)}</div>
 </div>;
 function zoneName(zone:number|null){return zone?`Z${String(zone).padStart(2,'0')}`:'—';}
 function signedHz(v:number){return `${v>=0?'+':''}${v.toFixed(3)} Hz`;}
 function signedPercent(v:number){return `${v>=0?'+':''}${v.toFixed(2)}%`;}
}
