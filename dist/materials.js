// SI units. Contact pairs are scenarios, not universal material constants.
export const G=9.81;
export const AIR=Object.freeze({density:1.225,dragCoefficient:.47});
const freeze=Object.freeze;
export const BALLS=freeze({
  steel:freeze({name:'Steel',short:'STEEL',description:'Solid steel · long coast, firm rebounds',density:7900,radius:.0075,inertiaRatio:2/5}),
  rubber:freeze({name:'Bouncy rubber',short:'RUBBER',description:'Solid rubber · grippy, lively rebounds',density:1100,radius:.0075,inertiaRatio:2/5}),
  pingpong:freeze({name:'Table tennis',short:'TABLE TENNIS',description:'Hollow shell · light, springy, air resistance matters most',mass:.0027,radius:.020,inertiaRatio:2/3}),
  cork:freeze({name:'Cork',short:'CORK',description:'Solid cork · soft contacts and short coast',density:240,radius:.0075,inertiaRatio:2/5}),
  billiard:freeze({name:'Billiard',short:'BILLIARD',description:'Solid resin · substantial momentum, precise rolling',mass:.170,radius:.028575,inertiaRatio:2/5})
});
export const SURFACES=freeze({
  wood:freeze({name:'Hardwood',description:'Sealed wood. Counter-tilt to brake.',scene:'THE WORKSHOP'}),
  sand:freeze({name:'Dry sand',description:'A shallow granular bed. A larger tilt may be needed to start.',scene:'THE DUNES',density:1600,depth:.005,sinkFactor:.46,ploughFactor:.18,rollingFactor:.12,inertialFactor:1.5}),
  ice:freeze({name:'Smooth ice',description:'Low grip. Strong tilts and reversals can make the ball skid.',scene:'THE ICE RINK'}),
  baize:freeze({name:'Baize',description:'Woven cloth. Rolling resistance helps the ball settle.',scene:'THE BILLIARD ROOM'})
});
export const WALL_MATERIALS=freeze({wood:freeze({name:'Hardwood',description:'Rigid wooden walls; rebound depends on the ball.'}),rubber:freeze({name:'Rubber bumpers',description:'Passive elastic bumpers; they return energy but never add it.'})});
// Pair tuple: muStatic, muKinetic, muImpact, eRef at 1 m/s,
// eTangent, b0 [m], b1 [s], effective contact modulus [Pa]. All estimates,
// except billiard/baize's literature-reference sliding and rolling targets.
const pair=(muStatic,muKinetic,muImpact,eRef,eTangent,b0,b1,effectiveModulus)=>freeze({muStatic,muKinetic,muImpact,eRef,eTangent,b0,b1,effectiveModulus});
export const CONTACTS=freeze({
 steel:freeze({wood:pair(.25,.18,.20,.55,0,8e-6,12e-6,1e9),sand:pair(.55,.40,.40,.05,0,8e-6,12e-6,1e9),ice:pair(.03,.025,.025,.55,0,0,0,1e9),baize:pair(.25,.20,.20,.35,0,.0075*1.4*.012,0,1e7)}),
 rubber:freeze({wood:pair(.85,.65,.70,.85,.45,40e-6,50e-6,5e6),sand:pair(.80,.60,.60,.12,0,40e-6,50e-6,5e6),ice:pair(.10,.07,.08,.78,.25,8e-6,10e-6,5e6),baize:pair(.85,.65,.65,.65,.2,.0075*1.4*.025,20e-6,3e6)}),
 pingpong:freeze({wood:pair(.25,.20,.20,.85,.10,30e-6,20e-6,1e7),sand:pair(.45,.30,.30,.12,0,30e-6,20e-6,1e7),ice:pair(.04,.03,.03,.82,.05,0,0,1e7),baize:pair(.30,.20,.20,.65,.10,.02*(5/3)*.015,0,5e6)}),
 cork:freeze({wood:pair(.60,.45,.45,.28,0,120e-6,100e-6,2e6),sand:pair(.60,.45,.45,.05,0,120e-6,100e-6,2e6),ice:pair(.08,.06,.06,.25,0,30e-6,30e-6,2e6),baize:pair(.65,.45,.45,.20,0,.0075*1.4*.03,50e-6,1e6)}),
 billiard:freeze({wood:pair(.25,.20,.20,.60,0,30e-6,20e-6,1e9),sand:pair(.55,.40,.40,.05,0,30e-6,20e-6,1e9),ice:pair(.04,.03,.03,.65,0,0,0,1e9),baize:pair(.25,.20,.20,.40,0,.028575*1.4*.01,0,1e7)})
});
// Geometry remains a flat bumper face, not a regulation snooker cushion nose.
// Billiard/rubber uses published representative e=.98 and mu=.14, with constant e.
export const WALL_CONTACTS=freeze(Object.fromEntries(Object.keys(BALLS).map(id=>[id,freeze({wood:CONTACTS[id].wood,rubber:freeze({
 ...CONTACTS[id].wood,
 ...({steel:{muStatic:.70,muKinetic:.55,muImpact:.55,eRef:.88,eTangent:.15},rubber:{muStatic:.90,muKinetic:.75,muImpact:.75,eRef:.88,eTangent:.4},pingpong:{muStatic:.60,muKinetic:.45,muImpact:.45,eRef:.90,eTangent:.2},cork:{muStatic:.70,muKinetic:.50,muImpact:.50,eRef:.35,eTangent:0},billiard:{muStatic:.14,muKinetic:.14,muImpact:.14,eRef:.98,eTangent:0,constantRestitution:true}}[id]),
 effectiveModulus:3e6
})})])));
export function granularState(ball,loadRatio=1){
 const s=SURFACES.sand;
 // Quasi-static load extension: effective density scales with N/(mg).
 // Provisional, without granular memory. Shell uses bulk density m/volume.
 const sinkage=Math.min(s.depth,s.sinkFactor*ball.r*(ball.density/s.density*Math.max(0,loadRatio))**.75);
 const z=Math.min(sinkage,2*ball.r),a=Math.sqrt(Math.max(0,2*ball.r*z-z*z));
 const area=ball.r*ball.r*Math.acos((ball.r-z)/ball.r)-(ball.r-z)*a;
 return {sinkage,footprint:a,area,ploughCoefficient:s.ploughFactor*z/ball.r,rollingArm:s.rollingFactor*z,inertialDrag:s.inertialFactor*s.density*area};
}
export function restitution(profile,speed){
 if(profile.constantRestitution)return profile.eRef;
 if(profile.eRef<=0)return 0;if(profile.eRef>=1)return 1;
 return 1/(1+(1/profile.eRef-1)*Math.max(0,speed)**.2);
}
