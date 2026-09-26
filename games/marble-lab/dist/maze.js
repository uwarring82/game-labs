// Authoring coordinates are board units, independent of viewport and ball size.
export const BOARD={width:9,height:19,metresPerUnit:1/30};
export const MAZE={
 start:{x:1.23,y:2.0},goal:{x:7.8,y:17.55,r:.57},
 walls:[
  {x:0,y:0,w:9,h:.24,height:1.2},{x:0,y:18.76,w:9,h:.24,height:1.2},
  {x:0,y:0,w:.24,h:19,height:1.2},{x:8.76,y:0,w:.24,h:19,height:1.2},
  {x:.24,y:4.8,w:6.15,h:.27,height:.54},
  {x:2.58,y:9.4,w:6.18,h:.27,height:.54},
  {x:.24,y:14,w:6.15,h:.27,height:.54},
  {x:4.35,y:9.67,w:.27,h:1.32,height:.54}
 ],
 holes:[{x:4.92,y:2.2,r:.48},{x:7.32,y:7.5,r:.48},{x:1.8,y:12,r:.48},{x:5.19,y:16.65,r:.48}],
 route:[[1.23,3.85],[7.92,3.85],[7.92,6.1],[1.05,6.1],[1.05,10.8],[3.51,10.8],[3.51,12.8],[7.92,12.8],[7.8,17.55]]
};
export const toMetres=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,v*BOARD.metresPerUnit]));
