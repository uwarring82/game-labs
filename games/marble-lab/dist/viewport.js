export function fitBoard(width,height,aspect=9/19,dpr=1){
 const h=Math.max(1,Math.min(height,width/aspect)),w=h*aspect,pixelRatio=Math.max(1,Math.min(2,dpr||1));
 return {width:w,height:h,pixelRatio,pixelWidth:Math.max(1,Math.round(w*pixelRatio)),pixelHeight:Math.max(1,Math.round(h*pixelRatio))};
}
export function watchViewport(root,onResize){
 let scheduled=false;
 const update=()=>{scheduled=false;const v=window.visualViewport;
  root.style.setProperty('--view-height',`${v?.height??window.innerHeight}px`);
  root.style.setProperty('--view-width',`${v?.width??window.innerWidth}px`);
  root.style.setProperty('--view-top',`${v?.offsetTop??0}px`);
  root.style.setProperty('--view-left',`${v?.offsetLeft??0}px`);onResize();
 };
 const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(update);}};
 window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
 document.addEventListener('fullscreenchange',schedule);update();return schedule;
}
