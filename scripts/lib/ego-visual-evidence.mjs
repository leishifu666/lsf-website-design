// Import inside an ego-browser nodejs round. Reuses the reviewer's Page and never launches a browser.
import {mkdir,writeFile} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';

export async function captureVisualEvidence(page,{outDir,widths=[375,768,1440],contentSelector='main',sectionSelector='main > section, main > article'}={}){
  if(!outDir||!isAbsolute(outDir))throw new Error('outDir须为原项目内本轮评审证据目录的绝对路径');
  await mkdir(outDir,{recursive:true});
  const report={tool:'ego-browser',url:await page.url(),at:new Date().toISOString(),observations:[],limits:[
    '几何提示须结合截图、项目参考与实际状态复核，不自动作为审美扣分',
    'DOM不能完整描述WebGL/Canvas、固定图层或滚动叙事；须实际操作并查看中间状态',
    '仅切换视口宽度，不代表触屏输入或全部手机状态已验证',
    '首屏与整页截图不证明hover、流畅度或全部状态已验证'
  ]};
  for(const width of widths){
    const height=width===768?1024:width<600?812:900;
    await page.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await page.evaluate(async()=>{window.scrollTo(0,0);await document.fonts.ready;await new Promise(requestAnimationFrame);});
    const sample=await page.evaluate(({contentSelector,sectionSelector})=>{
      const round=v=>Math.round(v*10)/10;
      const box=el=>{const r=el.getBoundingClientRect();return {left:round(r.left),right:round(r.right),top:round(r.top+scrollY),bottom:round(r.bottom+scrollY),width:round(r.width),height:round(r.height)};};
      const visible=el=>{
        if(!el.getBoundingClientRect().width||!el.getBoundingClientRect().height)return false;
        for(let n=el;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;}
        return true;
      };
      const describe=el=>{
        const s=getComputedStyle(el);
        return {tag:el.tagName.toLowerCase(),id:el.id,text:el.textContent.trim().replace(/\s+/g,' ').slice(0,100),box:box(el),style:{fontFamily:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight,color:s.color,background:s.backgroundColor,padding:s.padding,margin:s.margin,display:s.display,position:s.position,transform:s.transform}};
      };
      const root=document.querySelector(contentSelector);
      const h1s=[...document.querySelectorAll('h1,[role="heading"][aria-level="1"]')].filter(visible).map(describe);
      const sections=[...document.querySelectorAll(sectionSelector)].filter(visible).map(el=>({
        ...describe(el),heading:el.querySelector('h1,h2,h3,[role="heading"]')?.textContent.trim()??null,
        children:[...el.children].filter(visible).map(describe).slice(0,40)
      }));
      return {viewport:{width:innerWidth,height:innerHeight},scroll:{x:scrollX,y:scrollY},documentHeight:document.documentElement.scrollHeight,
        root:root?describe(root):null,h1s,sections,
        spatialLayers:document.querySelectorAll('canvas,svg[data-scene],.scene,[data-scene]').length,
        overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth};
    },{contentSelector,sectionSelector});
    const findings=[];
    const add=(id,where,measurement,note)=>findings.push({id,where,measurement,note,status:'needs-visual-review'});
    if(!sample.h1s.some(h=>h.box.top<height&&h.box.bottom>0))add('first-screen-title','首屏',sample.h1s.map(h=>h.box),'未检测到首屏可见主标题；结合截图判断标题、语义和入场状态');
    if(sample.root){
      const left=sample.root.box.left,right=width-sample.root.box.right;
      if(Math.abs(left-right)>16)add('outer-margins',contentSelector,{left,right},'核对是否为无意偏移；满版容器的内部边距仍须看具体内容');
    }
    for(const section of sample.sections){
      const children=section.children.filter(c=>c.box.width>0&&c.box.height>0&&c.style.position!=='fixed');
      const top=children.length?Math.min(...children.map(c=>c.box.top)):section.box.top;
      const bottom=children.length?Math.max(...children.map(c=>c.box.bottom)):section.box.bottom;
      const empty=Math.max(top-section.box.top,section.box.bottom-bottom);
      if(empty>height*0.6)add('section-space',section.id||section.text.slice(0,30),{empty,box:section.box},'检查异常留白；背景、伪元素、pin与固定场景可能承载内容，不能仅凭DOM删除区块');
    }
    const ordered=[...sample.sections].sort((a,b)=>a.box.top-b.box.top);
    for(let i=1;i<ordered.length;i++){
      const gap=ordered[i].box.top-ordered[i-1].box.bottom;
      if(gap>height*0.6)add('between-sections',ordered[i].id||ordered[i].text.slice(0,30),{gap},'核对章节间是否意外空白或动效未触发');
    }
    if(sample.overflow>1)add('horizontal-overflow','页面',{pixels:sample.overflow},'实际横向检查，区分有意的可操作横向内容与页面溢出');
    const fold=join(outDir,`${width}-fold.png`);
    await page.screenshot({path:fold});
    // CDP captures the actual document. Very long narratives need additional in-between screenshots.
    const full=join(outDir,`${width}-full.png`);
    const image=await page.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.min(sample.documentHeight,16000),scale:1}});
    await writeFile(full,Buffer.from(image.data,'base64'));
    const limits=[];
    if(sample.documentHeight>16000)limits.push('整页图截到16000px，评审需继续滚动并补图');
    report.observations.push({width,height,measurements:sample,findings,screenshots:{fold,full},limits});
  }
  const file=join(outDir,'layout-evidence.json');
  await writeFile(file,JSON.stringify(report,null,2)+'\n');
  return {file,report};
}
