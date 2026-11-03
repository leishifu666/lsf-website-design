// Resolve a section directly from a scout component tree, its index, or equivalent measured JSON.
import {posix} from 'node:path';

const required = (ok, label) => { if (!ok) throw Error('区块布局取证：' + label); };
const text = s => typeof s === 'string' && s.trim().length > 0;

function at(record, pointer) {
  if (pointer == null) return record;
  required(text(pointer) && pointer.startsWith('/'),'使用 JSON pointer 定位节点');
  for (const part of pointer.slice(1).split('/')) {
    const key = part.replaceAll('~1','/').replaceAll('~0','~');
    required(record != null && Object.hasOwn(record,key),'找不到节点 ' + pointer);
    record = record[key];
  }
  return record;
}

async function measure(ref, source, jsonRecord) {
  required(text(ref?.file),'缺 layout.file 原站/成品 DOM 测量');
  let path = ref.file;
  let doc = await jsonRecord(path,source);
  let node = at(doc,ref.pointer);
  // components.json lists component-N.json beside itself; the tree owns the actual rect and styles.
  if (Array.isArray(doc) && text(node?.file)) {
    path = posix.join(posix.dirname(path),node.file);
    doc = await jsonRecord(path,source);
    node = doc;
  }
  const viewport = node.viewport ?? doc.viewport;
  const selector = node.selector ?? doc.selector;
  if (node.trees) {
    required(node.trees.length === 1,'匹配多个或零个元素，请用 pointer 选定具体节点：' + path);
    node = node.trees[0];
  }
  const style = Number.isInteger(node.style) ? doc.styles?.[node.style] : node.style;
  const rect = node.rect;
  required(text(selector) && Number.isFinite(viewport?.width) && Number.isFinite(viewport.height) &&
    ['x','y','width','height'].every(k => Number.isFinite(rect?.[k])) && rect.width > 0 && rect.height > 0,
    path + ' 缺实际 selector、CSS 视口或可见矩形');
  required(style && ['display','position','grid-template-columns','flex-direction'].some(k => text(style[k])) &&
    Object.entries(style).filter(([,v]) => text(v)).length >= 2,path + ' 缺节点的实际 computed style');
  const children = node.children ?? node.layers;
  required(Array.isArray(children),path + ' 缺 DOM 子节点或图层顺序；无子项用空数组');
  const childOrder = children.map(c => typeof c === 'string' ? (node.layers ? c : '#text') : c.tag ?? c.role ?? c.selector);
  required(childOrder.every(text),path + ' 的子节点或图层缺 tag/role/selector');
  const keys = ['display','position','grid-template-columns','flex-direction','gap','font-size','line-height','color','background-color','z-index'];
  return {path,selector,viewport,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
    widthFraction:rect.width/viewport.width,heightFraction:rect.height/viewport.height,
    style:Object.fromEntries(keys.filter(k => style[k] != null).map(k => [k,style[k]])),childOrder};
}

export async function inspectSectionLayout(section,contract,paired,jsonRecord) {
  const label = section.id;
  const state = section.layout?.state;
  required(section.states.includes(state),label + ' 缺与 layout 对应的原站状态');
  const original = await measure(section.layout,true,jsonRecord);
  const row = contract.states.find(s => s.id === state && s.width === original.viewport.width);
  required(row?.original?.viewport.height === original.viewport.height,label + ' 原站 DOM 与同态截图视口不一致');
  if (!paired) return;
  const built = await measure(section.built?.layout,false,jsonRecord);
  required(original.path !== built.path,label + ' 须独立采集两侧 DOM');
  required(built.viewport.width === original.viewport.width && row?.built?.viewport.height === built.viewport.height,
    label + ' 成品 DOM 与所配对的状态截图视口不一致');
  const structureChanged = original.style.display !== built.style.display || original.style.position !== built.style.position ||
    JSON.stringify(original.childOrder) !== JSON.stringify(built.childOrder);
  required(section.built.verdict !== 'match' || !structureChanged,
    label + ' 排版模式或图层顺序不同；注明主题适配或修复，并依据当前版本复测');
  return {section:label,state,original,built,
    sizeDelta:{width:built.rect.width-original.rect.width,height:built.rect.height-original.rect.height}};
}
