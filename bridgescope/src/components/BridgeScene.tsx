import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Home, Grid3X3, Maximize2, Move3D, Pause, Play } from 'lucide-react';
import type { Analysis } from '../types';

type Props = {analysis: Analysis | null; selected: number; onSelect: (zone:number)=>void; modeShape?: number[]};
export default function BridgeScene({analysis, selected, onSelect, modeShape}: Props) {
  const host=useRef<HTMLDivElement>(null);
  const sceneState=useRef<{reset:()=>void; grid:()=>void; animate:()=>void}|null>(null);
  const latest=useRef({analysis,selected,onSelect,modeShape});
  latest.current={analysis,selected,onSelect,modeShape};
  const [gridVisible,setGridVisible]=useState(true),[animated,setAnimated]=useState(false),[failed,setFailed]=useState(false),[wide,setWide]=useState(false);
  useEffect(()=>{
    if (!host.current) return;
    const container=host.current;
    const scene=new THREE.Scene();
    const width=container.clientWidth, height=container.clientHeight;
    let renderer:THREE.WebGLRenderer;
    try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});} catch {setFailed(true);return;}
    renderer.setSize(width,height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
    renderer.setClearColor('#111a23',0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    const camera=new THREE.PerspectiveCamera(34,width/height,0.1,300);
    const cameraHome=new THREE.Vector3(48,36,48);
    camera.position.copy(cameraHome);
    const controls=new OrbitControls(camera,renderer.domElement);
    controls.target.set(0,2,0);controls.enableDamping=true;controls.dampingFactor=.065;
    controls.maxPolarAngle=Math.PI/2.1;controls.minDistance=28;controls.maxDistance=115;
    controls.enablePan=true;
    scene.add(new THREE.HemisphereLight('#b6d4e3','#25333b',2.5));
    const light=new THREE.DirectionalLight('#fff5e4',3.5);light.position.set(-15,45,25);light.castShadow=true;
    light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-45;light.shadow.camera.right=45;
    light.shadow.camera.top=35;light.shadow.camera.bottom=-35;light.shadow.normalBias=.04;scene.add(light);
    const fill=new THREE.DirectionalLight('#7391b8',1.2);fill.position.set(20,12,-25);scene.add(fill);
    const objects:THREE.Object3D[]=[];
    const mat=(color:string,roughness=.8,metalness=.05)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
    const concrete=mat('#83919b'), pierMat=mat('#627380'),road=mat('#273541'),rail=mat('#a0b0b5',.4,.3);
    const groundMat=mat('#182630');
    function box(w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material) {
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
    }
    box(87,.5,49,0,-3.4,0,groundMat);
    // Stylized river is illustrative scenery, not a measured geographic map.
    const river=box(27,.04,49,0,-3.12,0,mat('#1c3d4e',.3,.35));
    for(let j=0;j<16;j++){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-12+j%3,-3.08,-23+j*3),new THREE.Vector3(11-j%4,-3.08,-23+j*3)]),new THREE.LineBasicMaterial({color:'#325161',transparent:true,opacity:.35}));scene.add(line);}
    const grid=new THREE.GridHelper(88,44,'#364550','#293844');grid.position.y=-3.08;scene.add(grid);
    for(const x of [-15,15]) {
      for(const z of [-1.9,1.9]){box(1.2,6.5,1.15,x,.15,z,pierMat);box(2.7,.6,2.1,x,-2.8,z,pierMat);}
      box(2,.65,6.9,x,3.4,0,concrete);
    }
    for(const x of [-29.5,29.5]){box(2,7.1,7,x,.25,0,pierMat);box(11,.7,7.5,x<0?-35:35,3.8,0,groundMat);box(11,.06,6,x<0?-35:35,4.19,0,road);}
    const decks:THREE.Mesh[]=[],roads:THREE.Mesh[]=[],sensors:THREE.Mesh[]=[],labels:THREE.Sprite[]=[];
    for(let i=0;i<12;i++){
      const x=-27.5+i*5;
      const deck=box(4.98,.72,7,x,4,0,concrete.clone());deck.userData={zone:i+1,kind:'deck'};decks.push(deck);objects.push(deck);
      const asphalt=box(4.98,.05,5.9,x,4.39,0,road);asphalt.userData={zone:i+1,kind:'deck'};roads.push(asphalt);objects.push(asphalt);
      for(const z of [-3.18,3.18]){box(4.98,.24,.22,x,4.54,z,rail);}
      const sensor=new THREE.Mesh(new THREE.SphereGeometry(.20,16,12),mat('#8ac8bb',.3,.3));sensor.position.set(x,4.75,2.24);sensor.userData={zone:i+1,kind:'sensor'};scene.add(sensor);sensors.push(sensor);objects.push(sensor);
      const ring=new THREE.Mesh(new THREE.RingGeometry(.3,.36,24),new THREE.MeshBasicMaterial({color:'#8ac8bb',transparent:true,opacity:.4,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.copy(sensor.position);ring.position.y-=.13;scene.add(ring);
      const canvas=document.createElement('canvas');canvas.width=192;canvas.height=64;
      const ctx=canvas.getContext('2d')!;ctx.font='500 27px monospace';ctx.textAlign='center';ctx.fillStyle='#cad9df';ctx.fillText(`S${String(i+1).padStart(2,'0')}`,96,39);
      const texture=new THREE.CanvasTexture(canvas);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));sprite.scale.set(3.2,1.07,1);sprite.position.set(x,6.1,2.3);scene.add(sprite);labels.push(sprite);
    }
    // Girder underside and traffic-lane paint.
    for(const z of [-2.2,2.2])box(60,.9,.45,0,3.35,z,pierMat);
    for(let x=-29;x<30;x+=3.1)box(1.55,.035,.055,x,4.43,0,mat('#9ba9ac'));
    for(const z of [-2.72,2.72])box(60,.025,.045,0,4.43,z,mat('#c4ccca'));
    // Subtle model datum.
    const datumY=-2.95;
    const lineMat=new THREE.LineBasicMaterial({color:'#78909c',transparent:true,opacity:.5});
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-30,datumY,12),new THREE.Vector3(30,datumY,12)]),lineMat));
    for(const x of [-30,-15,0,15,30])scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,datumY,11.4),new THREE.Vector3(x,datumY,12.6)]),lineMat));
    const selection=box(4.95,.045,6.95,-27.5+(selected-1)*5,4.45,0,new THREE.MeshBasicMaterial({color:'#e8b86b',transparent:true,opacity:.14,depthWrite:false}));
    const raycaster=new THREE.Raycaster();const mouse=new THREE.Vector2();let pointerX=0,pointerY=0;
    function pointerDown(e:PointerEvent){pointerX=e.clientX;pointerY=e.clientY;}
    function pointerUp(e:PointerEvent){
      if(Math.abs(e.clientX-pointerX)+Math.abs(e.clientY-pointerY)>7)return;
      const rect=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera);
      const hit=raycaster.intersectObjects(objects)[0];if(hit)latest.current.onSelect(hit.object.userData.zone);
    }
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);
    let animationId=0,isAnimating=false,lastPaint='';
    sceneState.current={reset:()=>{camera.position.copy(cameraHome);controls.target.set(0,2,0);},grid:()=>{grid.visible=!grid.visible;},animate:()=>{isAnimating=!isAnimating;}};
    const loop=()=>{
      animationId=requestAnimationFrame(loop);controls.update();
      const {analysis:a,selected:s,modeShape:shape}=latest.current;
      const paint=`${a?.id}-${s}`;
      if(lastPaint!==paint){
        lastPaint=paint;const ranking=a?.localization.ranking??[];
        decks.forEach((d,i)=>{
          const fit=ranking[i]?.score??0;const active=a?.assessment==='review'&&fit>.35;
          (d.material as THREE.MeshStandardMaterial).color.set(active?(fit>.8?'#d8a65e':'#9a825f'):'#83919b');
          (sensors[i].material as THREE.MeshStandardMaterial).color.set(i===s-1?'#ffe4ac':active?'#e8b86b':'#8ac8bb');
        });
        selection.position.x=-27.5+(s-1)*5;
      }
      const phase=Math.sin(performance.now()/650);
      decks.forEach((d,i)=>{const displacement=isAnimating?(shape?.[i]??Math.sin((i+.5)/12*Math.PI))*phase*.6:0;d.position.y=4+displacement;roads[i].position.y=4.39+displacement;sensors[i].position.y=4.75+displacement;labels[i].position.y=6.1+displacement;});
      renderer.render(scene,camera);
    };loop();
    const observer=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;if(w&&h){camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}});observer.observe(container);
    return ()=>{cancelAnimationFrame(animationId);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){o.geometry?.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}if(o instanceof THREE.Sprite){o.material.map?.dispose();o.material.dispose();}});renderer.dispose();renderer.domElement.remove();sceneState.current=null;};
  },[]);
  return <div className={`bridge-scene ${wide?'scene-expanded':''}`}>
    <div className="scene-grid-bg"/>
    <div ref={host} className="three-host" aria-label="Interactive three-dimensional illustrative bridge. Drag to orbit; click a sensor or deck zone."/>
    {failed&&<div className="webgl-fallback"><Move3D size={40}/><strong>3D rendering is unavailable in this browser</strong><span>Use the selectable zone map below. Analysis remains available.</span><div className="fallback-zones">{Array.from({length:12},(_,i)=><button key={i} onClick={()=>onSelect(i+1)} className={selected===i+1?'active':''}>{i+1}</button>)}</div></div>}
    <div className="scene-tag"><span className="tiny-dot"/> ILLUSTRATIVE GEOMETRY <span>60 m / 3 spans</span></div>
    <div className="scene-actions"><button title="Reset camera" aria-label="Reset camera" onClick={()=>sceneState.current?.reset()}><Home size={15}/></button><button className={gridVisible?'active':''} title="Toggle ground grid" aria-label="Toggle ground grid" onClick={()=>{sceneState.current?.grid();setGridVisible(!gridVisible);}}><Grid3X3 size={15}/></button><button title={animated?'Stop exaggerated mode animation':'Animate an exaggerated normalized mode shape'} aria-label="Toggle mode shape animation" className={animated?'active':''} onClick={()=>{sceneState.current?.animate();setAnimated(!animated);}}>{animated?<Pause size={15}/>:<Play size={15}/>}</button><button title="Expand bridge view" aria-label="Expand bridge view" onClick={()=>setWide(!wide)}><Maximize2 size={15}/></button></div>
    <div className="scene-hint"><Move3D size={13}/> Drag to orbit <span>·</span> Scroll to zoom <span>·</span> Click to inspect</div>
    <div className="scene-compass"><span>N</span><svg viewBox="0 0 40 40"><path d="M20 5l6 24-6-5-6 5z" fill="#8197a7"/><path d="M20 5v19l-6 5z" fill="#d4dedf"/></svg></div>
    {animated&&<div className="animation-note">Normalized mode shape · deformation exaggerated</div>}
  </div>;
}
