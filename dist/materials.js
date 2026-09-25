// SI units. Fixed profiles; numerical contact coefficients remain estimates.
export const G = 9.81;
export const BALLS = Object.freeze({
  steel: Object.freeze({name:'Steel',description:'Solid steel · long coast, firm rebounds',density:7900,radius:.0075,inertiaRatio:2/5}),
  rubber: Object.freeze({name:'Bouncy rubber',description:'Solid rubber · grippy, lively rebounds',density:1100,radius:.0075,inertiaRatio:2/5})
});
export const SURFACES = Object.freeze({
  wood: Object.freeze({name:'Hardwood',description:'Smooth sealed hardwood. Counter-tilt to brake.'}),
  sand: Object.freeze({name:'Dry sand',description:'A shallow sand bed. Larger tilts overcome the resistance.',density:1600,depth:.005,sinkFactor:.46,ploughFactor:.18,rollingFactor:.12,inertialFactor:1.5})
});
// b0 [m], b1 [s]: rolling moment arm b(v)=b0+b1*|omega_xy|*R.
// Effective modulus [Pa] only determines the torsional-friction footprint.
export const CONTACTS = Object.freeze({
  steel: Object.freeze({
    wood:Object.freeze({muStatic:.25,muKinetic:.18,muImpact:.20,eRef:.55,eTangent:0,b0:8e-6,b1:12e-6,effectiveModulus:1e9}),
    sand:Object.freeze({muStatic:.55,muKinetic:.40,muImpact:.40,eRef:.05,eTangent:0,b0:8e-6,b1:12e-6,effectiveModulus:1e9})
  }),
  rubber: Object.freeze({
    wood:Object.freeze({muStatic:.85,muKinetic:.65,muImpact:.70,eRef:.85,eTangent:.45,b0:40e-6,b1:50e-6,effectiveModulus:5e6}),
    sand:Object.freeze({muStatic:.80,muKinetic:.60,muImpact:.60,eRef:.12,eTangent:0,b0:40e-6,b1:50e-6,effectiveModulus:5e6})
  })
});
export function granularState(ball) {
  const s=SURFACES.sand;
  // Density-ratio scaling from PRE 109, 014903 (glass beads).
  // Transfer to dry sand and finite-depth clipping are explicit extrapolations.
  const sinkage=Math.min(s.depth,s.sinkFactor*ball.r*(ball.density/s.density)**.75);
  const z=Math.min(sinkage,2*ball.r),a=Math.sqrt(Math.max(0,2*ball.r*z-z*z));
  const area=ball.r*ball.r*Math.acos((ball.r-z)/ball.r)-(ball.r-z)*a;
  return {sinkage,footprint:a,area,ploughCoefficient:s.ploughFactor*z/ball.r,rollingArm:s.rollingFactor*z,inertialDrag:s.inertialFactor*s.density*area};
}
export function restitution(profile,speed) {
  // Positive v^(1/5) interpolation, not a fitted wood/sand constitutive law.
  if(profile.eRef<=0)return 0;
  if(profile.eRef>=1)return 1;
  return 1/(1+(1/profile.eRef-1)*Math.max(0,speed)**.2);
}
