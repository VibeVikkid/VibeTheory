import React, { useState, useRef } from 'react';

export const BeforeAfterSlider = ({ beforeUrl, afterUrl }: { beforeUrl: string, afterUrl: string }) => {
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  const move = (clientX: number) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setPos(pct);
  };
  
  return (
    <div 
      ref={ref} 
      onMouseDown={e => { setDragging(true); move(e.clientX); }}
      onMouseMove={e => dragging && move(e.clientX)}
      onMouseUp={() => setDragging(false)}
      onMouseLeave={() => setDragging(false)}
      onTouchStart={e => { setDragging(true); move(e.touches[0].clientX); }}
      onTouchMove={e => dragging && move(e.touches[0].clientX)}
      onTouchEnd={() => setDragging(false)}
      style={{
        position: 'relative', 
        width: '100%', 
        aspectRatio: '4/3', 
        overflow: 'hidden', 
        borderRadius: 8, 
        cursor: 'ew-resize',
        userSelect: 'none'
      }}
    >
      <img src={beforeUrl} style={{position:'absolute', inset:0, width:'full', height:'100%', objectFit:'contain', pointerEvents: 'none'}} alt="Before" />
      <div style={{
          position: 'absolute', 
          inset: 0, 
          overflow: 'hidden',
          clipPath: `inset(0 0 0 ${pos}%)`
      }}>
        <img src={afterUrl} style={{width:'100%', height:'100%', objectFit:'contain', pointerEvents: 'none'}} alt="After" />
      </div>

      <div style={{position:'absolute', top:8, left:8, background:'rgba(255,255,255,0.85)', color:'black', padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:500, pointerEvents: 'none'}}>BEFORE</div>
      <div style={{position:'absolute', top:8, right:8, background:'rgba(255,255,255,0.85)', color:'black', padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:500, pointerEvents: 'none'}}>AFTER</div>
      
      <div style={{
          position:'absolute', 
          top:0, bottom:0, width:2, 
          background:'white', 
          boxShadow:'0 0 6px rgba(0,0,0,0.4)', 
          left: `${pos}%`,
          pointerEvents: 'none'
      }}>
        <div style={{
            position:'absolute', top:'50%', left:'50%', 
            transform:'translate(-50%, -50%)', width:32, height:32, 
            background:'white', borderRadius:'50%', color: 'black',
            boxShadow:'0 2px 8px rgba(0,0,0,0.2)', display:'flex', 
            alignItems:'center', justifyContent:'center',
            fontSize:10
        }}>◄►</div>
      </div>
    </div>
  );
};
