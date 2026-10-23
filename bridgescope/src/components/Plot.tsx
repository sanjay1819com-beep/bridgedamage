import { useId, useState } from 'react';
export type Series = {name: string; color: string; values: {x: number; y: number}[]; dashed?: boolean; area?: boolean};
type Props = {series: Series[]; height?: number; yLabel?: string; xLabel?: string; xFormat?: (x: number) => string;
  yFormat?: (y: number) => string; domain?: [number, number]; marker?: {x: number; label: string}; legend?: boolean; compact?: boolean; title?: string};
export default function Plot({series, height=220, yLabel='', xLabel='', xFormat=x=>String(Math.round(x)),
  yFormat=y=>y.toFixed(2), domain, marker, legend=true, compact=false, title='Signal visualization'}: Props) {
  const id=useId().replace(/:/g,'');
  const [hover,setHover]=useState<number|null>(null);
  const W=760, H=height, left=compact?44:54, right=16, top=18, bottom=30;
  const points=series.flatMap(s=>s.values).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  if (!points.length) return <div className="empty-chart">No measurements available</div>;
  const xmin=Math.min(...points.map(p=>p.x)), xmax=Math.max(...points.map(p=>p.x));
  let ymin=domain?.[0]??Math.min(...points.map(p=>p.y)), ymax=domain?.[1]??Math.max(...points.map(p=>p.y));
  if (!domain) {const pad=Math.max((ymax-ymin)*0.18, Math.abs(ymax)*0.0005,0.00001);ymin-=pad;ymax+=pad;}
  const sx=(x:number)=>left+(x-xmin)/(xmax-xmin||1)*(W-left-right);
  const sy=(y:number)=>H-bottom-(y-ymin)/(ymax-ymin||1)*(H-top-bottom);
  const path=(s:Series)=>s.values.filter(p=>Number.isFinite(p.y)).map((p,i)=>`${i?'L':'M'}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(' ');
  const nearest=(s:Series)=>s.values.reduce((a,b)=>Math.abs(b.x-(hover??xmin))<Math.abs(a.x-(hover??xmin))?b:a,s.values[0]);
  return <div className={`plot ${compact?'compact':''}`}>
    {yLabel&&<div className="plot-unit">{yLabel}</div>}
    <div className="plot-canvas">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} preserveAspectRatio="none"
        onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect();const px=(e.clientX-r.left)/r.width*W;setHover(xmin+Math.max(0,Math.min(1,(px-left)/(W-left-right)))*(xmax-xmin));}}
        onMouseLeave={()=>setHover(null)}>
        <title>{title}</title>
        <defs>{series.filter(s=>s.area).map((s,i)=><linearGradient key={s.name} id={`${id}-${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity="0.17"/><stop offset="100%" stopColor={s.color} stopOpacity="0"/></linearGradient>)}</defs>
        {Array.from({length:5},(_,i)=>{const y=ymin+(ymax-ymin)*i/4;return <g key={i}><line x1={left} x2={W-right} y1={sy(y)} y2={sy(y)} stroke="#25303b" strokeDasharray="3 5"/><text x={left-11} y={sy(y)+4} textAnchor="end" className="axis-text">{yFormat(y)}</text></g>;})}
        {Array.from({length:7},(_,i)=>{const x=xmin+(xmax-xmin)*i/6;return <text key={i} x={sx(x)} y={H-7} textAnchor="middle" className="axis-text">{xFormat(x)}</text>;})}
        {marker&&<g><line x1={sx(marker.x)} x2={sx(marker.x)} y1={top} y2={H-bottom} stroke="#ba9460" strokeDasharray="4 5"/><rect x={Math.min(sx(marker.x)+7,W-134)} y={top} width="123" height="21" rx="4" fill="#30291f"/><text x={Math.min(sx(marker.x)+14,W-127)} y={top+14} fill="#e8b86b" fontSize="10">{marker.label}</text></g>}
        {series.map((s,i)=><g key={s.name}>{s.area&&<path d={`${path(s)} L${sx(s.values[s.values.length-1].x)},${H-bottom} L${sx(s.values[0].x)},${H-bottom} Z`} fill={`url(#${id}-${i})`}/>}<path d={path(s)} fill="none" stroke={s.color} strokeWidth={compact?1.7:2.1} strokeDasharray={s.dashed?'5 5':undefined} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/></g>)}
        {hover!==null&&<g><line x1={sx(hover)} x2={sx(hover)} y1={top} y2={H-bottom} stroke="#607080"/>{series.map(s=>{const p=nearest(s);return p?<circle key={s.name} cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill={s.color} stroke="#101720" strokeWidth="2"/>:null;})}</g>}
      </svg>
      {hover!==null&&<div className="plot-tooltip" style={{left:`${Math.max(12,Math.min(73,(sx(hover)/W)*100))}%`}}><strong>{xFormat(hover)}{xLabel?` ${xLabel}`:''}</strong>{series.map(s=>{const p=nearest(s);return p?<span key={s.name}><i style={{background:s.color}}/>{s.name}<b>{yFormat(p.y)}</b></span>:null;})}</div>}
    </div>
    {legend&&<div className="plot-legend">{series.map(s=><span key={s.name}><i style={{background:s.color,opacity:s.dashed?0.6:1}}/>{s.name}</span>)}{xLabel&&<small>{xLabel}</small>}</div>}
  </div>;
}
