// Previous board retained only as a regression fixture; it is not a second playable level.
import {MAZE,BOARD,toMetres} from '../../dist/maze.js';import {BALLS} from '../../dist/materials.js';import {terrainFor} from '../../dist/terrain.js';
export const LEGACY_ROUTE=MAZE.route.map(p=>p.map(v=>v*BOARD.metresPerUnit));
export function legacyLayoutFor(material='steel'){const scale=BALLS[material].radius/.0075,obj=o=>Object.fromEntries(Object.entries(toMetres(o)).map(([k,v])=>[k,v*scale]));return{scale,width:.3*scale,height:19/30*scale,start:obj(MAZE.start),goal:obj(MAZE.goal),walls:MAZE.walls.map(o=>({...obj(o),bottom:-.025*scale})),holes:MAZE.holes.map(obj),patches:[],terrain:terrainFor(scale)};}
