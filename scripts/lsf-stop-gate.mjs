// Optional Stop hook. Closed review budgets do not become a success verdict.
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {inspectWorkflow} from './workflow-check.mjs';
import {stopReviewHook} from './review-policy.mjs';
let input={};try{input=JSON.parse(readFileSync(0,'utf8')||'{}');}catch{}
const root=input.cwd||process.cwd();
const out=o=>{process.stdout.write(JSON.stringify(o));process.exit(0);};
if(!existsSync(join(root,'.lsf/active')))out({});
let config={};try{config=JSON.parse(readFileSync(join(root,'.lsf/workflow.json'),'utf8'));}catch{}
if(config.status==='waiting-for-user'&&config.wait_reason?.trim())out({systemMessage:'LSF 等待实际用户输入：'+config.wait_reason+'。尚未通过。'});
let result;try{result=await inspectWorkflow(root);}catch(e){result={passed:false,problems:['核验器运行失败：'+e.message],review_status:config.review_status};}
const decision=stopReviewHook(result);
const counter=join(root,'.lsf/stop-blocks');
if(!decision.decision){writeFileSync(counter,'0');out(decision);}
const n=existsSync(counter)?Number(readFileSync(counter,'utf8'))||0:0;
if(n>=3)out({systemMessage:'LSF 连续缺项拦截已到限，不再空转。整体未通过：'+result.problems.join('；')+'。如实报告，禁止称为达标。'});
writeFileSync(counter,String(n+1));out(decision);
