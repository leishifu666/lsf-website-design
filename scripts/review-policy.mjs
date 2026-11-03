import { readFileSync } from 'node:fs';
export const reviewPolicy = JSON.parse(readFileSync(new URL('../references/design-review-policy.json', import.meta.url), 'utf8'));
export const dimensionNames = reviewPolicy.dimensions.map(d => d.name);
export const terminalReviewStates = ['passed', 'closed-unmet', 'closed-unverified', 'changed-after-review'];
const object = properties => ({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const string = {type:'string'};
const array = items => ({type:'array',items});
export const reviewSchema = object({
  schema_version:{type:'integer',const:2}, rubric_id:{type:'string',const:reviewPolicy.id},
  review_type:{type:'string',enum:['full_blind','targeted_verification','full_rescore_with_issue_list','comparison']},
  total:{type:['number','null']},
  dimensions:array(object({name:string,score:{type:'number'},max:{type:'number'},evidence:string,deductions:string})),
  hard_gates:array(object({gate:string,pass:{type:'boolean'},note:string})),
  blocking_issues:array(object({id:string,category:string,dimension:string,where:string,evidence:string,impact:string,fix:string,acceptance:string})),
  suggestions:array(string),evidence_gaps:array(object({gate_or_item:string,missing:string,needed:string})),
  issue_results:array(object({id:string,status:{type:'string',enum:['resolved','unresolved','rejection_upheld']},evidence:string})),
  style_fidelity:array(object({aspect:string,status:{type:'string',enum:['一致','接近','偏离','未验证']},evidence:string})),
  animation_audit:array(string),keep:string,engineering_notes:array(string),not_applicable:array(string),
  verdict:{type:'string',enum:['达标','未达标','未验证','对比完成']},
});

// A valid unsuccessful review must remain distinct from a malformed response.
export function validateReviewReport(r, {type=r?.review_type, expectedDimensions=dimensionNames, issues=[], fidelityAspects=null, missingPairs=false, fidelityIds=null}={}) {
  const errors=[];
  if(r?.schema_version!==2 || r?.rubric_id!==reviewPolicy.id || r.review_type!==type) errors.push('评审版本、口径或类型不符');
  for(const key of ['dimensions','hard_gates','blocking_issues','suggestions','evidence_gaps','issue_results','style_fidelity','animation_audit','engineering_notes','not_applicable']) if(!Array.isArray(r?.[key])) errors.push('缺数组 '+key);
  if(errors.length) return errors;
  if(typeof r.keep!=='string'||!r.keep.trim())errors.push('须说明保留优点');
  if(!['达标','未达标','未验证','对比完成'].includes(r.verdict)) errors.push('评审结论不符');
  if(new Set(r.dimensions.map(d=>d.name)).size!==r.dimensions.length) errors.push('评分维度重复');
  for(const name of expectedDimensions) if(!r.dimensions.some(d=>d.name===name)) errors.push('缺受影响维度：'+name);
  for(const d of r.dimensions) {
    const p=reviewPolicy.dimensions.find(p=>p.name===d.name);
    if(!p || !Number.isFinite(d.score) || d.score<0 || d.score>p.max || d.max!==p.max || !d.evidence?.trim()) errors.push('维度分值或证据不符：'+d.name);
  }
  if(['full_blind','full_rescore_with_issue_list'].includes(type)) {
    if(r.total!==r.dimensions.reduce((s,d)=>s+d.score,0)) errors.push('总分与五维得分不一致');
  } else if(r.total!==null) errors.push('局部复核/方案对比的 total 必须为 null，由脚本结算');
  if(type==='comparison') {if(r.verdict!=='对比完成'||r.dimensions.length)errors.push('方案对比不打成品五维分，不给网站完成结论');return errors;}
  if (missingPairs && !r.evidence_gaps.some(g => g.gate_or_item === '原站辨识度')) errors.push('原站同态材料缺失，必须列为未验证');
  if (fidelityAspects) {
    for (const aspect of fidelityAspects) {
      const rows = r.style_fidelity.filter(item => item.aspect === aspect);
      if (rows.length !== 1 || !['一致','接近','偏离','未验证'].includes(rows[0].status) || !rows[0].evidence?.trim())
        errors.push('缺独立同态对照或证据：' + aspect);
      else if (fidelityIds && rows[0].status !== '未验证' && !fidelityIds[aspect].some(id => rows[0].evidence.includes('[' + id + ']')))
        errors.push('评审证据须引用此项实际对照 ID：' + aspect);
      else if (rows[0].status === '未验证' && !r.evidence_gaps.some(g => g.gate_or_item === aspect))
        errors.push('未验证项必须登记缺口：' + aspect);
      else if (rows[0].status === '偏离' && !r.blocking_issues.length)
        errors.push('参考偏离须列入可复核的阻塞问题：' + aspect);
    }
  }
  if(new Set(r.hard_gates.map(g=>g.gate)).size!==r.hard_gates.length) errors.push('视觉约束重复');
  for(const name of reviewPolicy.visual_gates) if(!r.hard_gates.some(g=>g.gate===name)) errors.push('缺视觉约束：'+name);
  if(r.hard_gates.some(g=>!reviewPolicy.visual_gates.includes(g.gate)||typeof g.pass!=='boolean'||!g.note?.trim())) errors.push('视觉约束须有证据，不能加入工程门槛');
  if(r.suggestions.length>reviewPolicy.review_loop.suggestions_max) errors.push('建议项超过上限');
  if(new Set(r.blocking_issues.map(i=>i.id)).size!==r.blocking_issues.length) errors.push('阻塞项编号重复');
  for(const i of r.blocking_issues) if(!i.id || !dimensionNames.includes(i.dimension) || !['category','where','evidence','impact','fix','acceptance'].every(k=>typeof i[k]==='string'&&i[k].trim())) errors.push('阻塞项须含维度、位置、证据、影响、修法和验收条件');
  for(const g of r.evidence_gaps) if(!g.gate_or_item||!g.missing||!g.needed) errors.push('证据缺口须写明缺项与补证方法');
  if(type!=='full_blind') {
    if(new Set(r.issue_results.map(i=>i.id)).size!==r.issue_results.length || r.issue_results.length!==issues.length) errors.push('复核须逐项返回冻结问题，不增删编号');
    for(const i of issues) {
      const v=r.issue_results.find(v=>v.id===i.id);
      if(!v||!['resolved','unresolved','rejection_upheld'].includes(v.status)||!v.evidence?.trim()) errors.push('缺有效复核结论：'+i.id);
    }
  }
  if(['full_blind','full_rescore_with_issue_list'].includes(type)) {
    const below=r.total<reviewPolicy.minimum_score || r.dimensions.some(d=>d.score<reviewPolicy.dimensions.find(p=>p.name===d.name)?.floor);
    if(below&&!r.blocking_issues.length&&!r.evidence_gaps.length) errors.push('分数不足却没有可见问题或证据缺口，评审无效');
  }
  return errors;
}

export function validateDesignReview(r) {
  const errors=[];
  if(r?.rubric_id!==reviewPolicy.id) errors.push('评分规则须为 '+reviewPolicy.id);
  const ds=Array.isArray(r?.dimensions)?r.dimensions:[];
  if(ds.length!==dimensionNames.length||new Set(ds.map(d=>d.name)).size!==ds.length) errors.push('须完整且不重复地给出五个视觉维度');
  for(const p of reviewPolicy.dimensions) {
    const d=ds.find(d=>d.name===p.name);
    if(!d||d.max!==p.max||!Number.isFinite(d.score)||d.score<p.floor||d.score>p.max) errors.push(p.name+'分值、满分或底线不符');
  }
  if(r?.verdict!=='达标'||!Number.isFinite(r?.total)||r.total<reviewPolicy.minimum_score) errors.push('独立美学评审未达标');
  if(ds.reduce((s,d)=>s+Number(d.score||0),0)!==r?.total) errors.push('总分与五维得分之和不一致');
  const gs=Array.isArray(r?.hard_gates)?r.hard_gates:[];
  for(const name of reviewPolicy.visual_gates) if(!gs.some(g=>g.gate===name&&g.pass===true)) errors.push('视觉约束未通过/未验证：'+name);
  if(gs.some(g=>!reviewPolicy.visual_gates.includes(g.gate))) errors.push('工程或其他项目不得加入视觉门槛');
  if(r?.evidence_gaps?.length) errors.push('仍有证据缺口');
  if(r?.blocking_issues?.length||r?.issue_results?.some(i=>i.status==='unresolved')) errors.push('仍有未解决阻塞项');
  if(r?.style_fidelity?.some(s=>s.status==='未验证')) errors.push('仍有未验证的参考对照');
  if(r?.style_fidelity?.some(s=>s.status==='偏离')) errors.push('仍有参考风格偏离');
  return errors;
}

export function settleReview(r,{base=null,issues=[]}={}) {
  const partial=r.review_type==='targeted_verification';
  if(partial&&!base) throw new Error('局部复核缺首审基准');
  const dimensions=reviewPolicy.dimensions.map(p=>{
    const fresh=r.dimensions.find(d=>d.name===p.name), value=fresh||base?.dimensions.find(d=>d.name===p.name);
    if(!value) throw new Error('缺评分维度：'+p.name);
    return {...value,source:fresh?'current-review':'first-review'};
  });
  const unresolved=issues.filter(i=>!r.issue_results.some(v=>v.id===i.id&&['resolved','rejection_upheld'].includes(v.status)));
  const result={rubric_id:reviewPolicy.id,basis:partial?'composite':r.review_type==='full_blind'?'first_pass':'full_rescore_with_issue_list',label:partial?'首审＋局部复核合成，非第二次全量盲评':r.review_type==='full_blind'?'首审全量盲评':'带问题清单的全量复核，非盲评',dimensions,total:dimensions.reduce((s,d)=>s+d.score,0),hard_gates:r.hard_gates,evidence_gaps:r.evidence_gaps,blocking_issues:[...r.blocking_issues,...unresolved.filter(i=>!r.blocking_issues.some(b=>b.id===i.id))],issue_results:r.issue_results,style_fidelity:r.style_fidelity,verdict:'达标'};
  if(validateDesignReview(result).length) result.verdict=result.evidence_gaps.length?'未验证':'未达标';
  return result;
}

export function stopReviewHook(result) {
  if(result.passed) return {};
  const reason=result.problems.join('；');
  if(terminalReviewStates.includes(result.review_status)||result.review_budget_exhausted) return {systemMessage:`LSF 评审循环已收尾（${result.review_status}），不再自动派发。整体核验未通过：${reason}。如实报告未达标/未验证及其他缺项，禁止称作全部完成。`};
  return {decision:'block',reason:`【LSF 流程未通过】${reason}。仅在剩余评审预算内继续；不能自评、伪造证据或无限重评。`};
}
