// Independent exec fallback. Host and exec consume the same project budget.
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {prepareReview,finishReview} from './lib/review-workflow.mjs';
const args=process.argv.slice(2);
const opt=(n,d=null)=>{const i=args.indexOf(n);return i<0?d:args[i+1];};
try{
  const dir=args[0];
  if(!dir||dir.startsWith('--')||!opt('--root'))throw new Error('用法：node review-round.mjs <轮次> --root <原项目> --target <目标卡> --fallback-reason <Gemini/Claude不可用的实际原因> --model <已核对的当前模型ID> [--mode full|verify] [--responses <处理记录>] [--scope default|polish|exploration]');
  const fallbackReason=opt('--fallback-reason')?.trim();
  if(!fallbackReason)throw new Error('先检查Gemini/Claude可用性；exec仅作备选，须提供--fallback-reason，不消耗评审预算');
  if(!opt('--model')?.trim())throw new Error('exec须用--model传已核对的当前模型ID；未知时改用宿主继承当前模型的新子Agent，不猜CLI默认型号');
  // Resolve the executable before reserving a costly invocation.
  let executable=process.env.LSF_CODEX_EXE||'codex';
  if(process.platform==='win32'&&!process.env.LSF_CODEX_EXE){
    const found=spawnSync('where.exe',['codex.exe'],{encoding:'utf8',windowsHide:true});
    executable=found.stdout?.split(/\r?\n/).map(s=>s.trim()).find(s=>/\.exe$/i.test(s));
    if(!executable)throw new Error('找不到codex.exe；使用宿主评审，不以自评替代');
  }
  const root=resolve(opt('--root'));
  const round=resolve(process.cwd(),dir);
  const target=opt('--target')?resolve(opt('--target')):null;
  const responses=opt('--responses')?resolve(opt('--responses')):null;
  const prepared=await prepareReview(root,{round,target,responses,mode:opt('--mode','full'),scope:opt('--scope','default'),channel:'exec',fallbackReason:`${fallbackReason}；已核对的当前模型ID：${opt('--model')}`,designMode:opt('--design-mode',null)});
  const raw=join(prepared.dir,'review-response.json');
  const r=spawnSync(executable,['exec','--ephemeral','-s','read-only','--skip-git-repo-check','-c','model_reasoning_effort="xhigh"',...(opt('--model')?['-m',opt('--model')]:[]),'-i',prepared.input.evidence.images.join(','),'--output-schema',join(prepared.dir,'review-schema.json'),'-o',raw,'-'],{input:prepared.prompt,encoding:'utf8',cwd:prepared.site,windowsHide:true,maxBuffer:1<<26,timeout:15*60*1000});
  const status=r.error?.code==='ETIMEDOUT'?'timeout':r.error||r.status!==0?'failed':'returned';
  const result=await finishReview(root,{call:prepared.input.call,result:raw,agent:'codex-exec-'+prepared.input.call,status,reason:status==='returned'?'':String(r.error?.message||r.stderr||'进程失败').slice(-800)});
  console.log(JSON.stringify(result,null,2));
  process.exitCode=result.final?.verdict==='达标'||prepared.input.review_type==='comparison'&&result.status==='returned'?0:1;
}catch(e){console.error('✗ '+e.message);process.exitCode=2;}
