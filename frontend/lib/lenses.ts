export type AnalysisLens = {id:string;name:string;position:string;metrics:string[];x:string;y:string;distribution:string;basis:"percentile"|"per90";reference:boolean;priorities:Record<string,number>};
export function validateLens(value: unknown, available:string[]): AnalysisLens {
  const l=value as AnalysisLens;
  if(!l||typeof l.id!=="string"||!/^[\w-]{1,100}$/.test(l.id)||typeof l.name!=="string"||!l.name.trim()||l.name.length>80||!["Forward","Winger","Midfielder","Defender"].includes(l.position)||!Array.isArray(l.metrics)||!l.metrics.length||l.metrics.length>8||new Set(l.metrics).size!==l.metrics.length||l.metrics.some(f=>!available.includes(f))||![l.x,l.y,l.distribution].every(f=>available.includes(f))||!["percentile","per90"].includes(l.basis)||typeof l.reference!=="boolean")throw new Error("This lens has invalid settings or requires unavailable metrics.");
  const priorities:Record<string,number>={};
  for(const category of ["Finishing","Creation","Involvement"]){const value=l.priorities?.[category];if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>200)throw new Error("Lens priorities must be between 0 and 200.");priorities[category]=value;}
  if(Object.values(priorities).every(v=>v===0))throw new Error("At least one analysis priority must be above zero.");
  return {id:l.id,name:l.name.trim(),position:l.position,metrics:[...l.metrics],x:l.x,y:l.y,distribution:l.distribution,basis:l.basis,reference:l.reference,priorities};
}
