import {readingPlan} from './lib/resources.mjs';

const args=process.argv.slice(2),opt=(k,f)=>{const i=args.indexOf(k);return i<0?f:args[i+1];};
try{
  if(!opt('--mode'))throw new Error('用法：node scripts/read-plan.mjs --mode A --stage preview [--topic motion,images]；G评审可加 --design-mode A');
  console.log(JSON.stringify(readingPlan({mode:opt('--mode'),stage:opt('--stage','start'),topics:opt('--topic','').split(',').filter(Boolean),designMode:opt('--design-mode',null)}),null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
