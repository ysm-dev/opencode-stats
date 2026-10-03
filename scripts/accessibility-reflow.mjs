// Throwaway research measurement, not application code. Run with DEPENDENCIES pointing at
// the prototype/dashboard directory containing playwright 1.63.0 and axe-core 4.13.0.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const deps = process.env.DEPENDENCIES;
const { chromium } = await import(`${deps}/node_modules/playwright/index.mjs`);
const out = process.env.OUTPUT ?? '/private/var/folders/f_/mpd_wxpx37nb3c44n96b_6pw0000gn/T/opencode/a11y-results';
await fs.mkdir(out, {recursive:true});
const axe = await fs.readFile(`${deps}/node_modules/axe-core/axe.min.js`, 'utf8');
const views = ['overview','models','projects','agents','tools','sessions-day','sessions-table'];
const spacing = '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }';
const browser = await chromium.launch();
const report = { browser:browser.version(), axe:'4.13.0', reflow:[], spacing:[], zoom:[], targets:[], axeRuns:[] };
async function load(page, view, extra = '') {
  const [name, sessions='day'] = view.split('-');
  await page.goto(`http://127.0.0.1:4747/?variant=F&embed=1&live=off&page=${name}&sessions=${sessions}&${extra}`);
  await page.locator('.m-content').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(100);
}
async function open(page, state) {
  if(state==='filters') await page.locator('.m-context-button').click();
  if(state==='page-menu') await page.getByRole('button',{name:'Page',exact:true}).click();
  if(state==='range-menu') await page.getByRole('button',{name:'Time range',exact:true}).click();
  if(state==='commands') await page.getByRole('button',{name:'Search pages, ranges and filters',exact:true}).click();
}
async function scan(page) {
  return page.evaluate(()=>{
    const round = n=>Math.round(n*100)/100;
    const all = [...document.querySelectorAll('.m-root *')];
    const intended = '.c-table-scroll,.m-graph-scroll.m-scrolls';
    const cssName = e=> e.tagName.toLowerCase() + (e.getAttribute('class') ? '.'+e.getAttribute('class').trim().split(/\s+/).join('.'):'') + (e.getAttribute('aria-label') ? `[${e.getAttribute('aria-label')}]`:'');
    const name = e=>({key:all.indexOf(e),name:cssName(e),text:(e.textContent??'').trim().replace(/\s+/g,' ').slice(0,120)});
    const isShown = e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('svg[aria-hidden="true"]');};
    const clips=[], outside=[], fixedRows=[], texts=[];
    for(const e of all) {
      if(!isShown(e)) continue;
      const r=e.getBoundingClientRect(), s=getComputedStyle(e);
      const excluded=!!e.closest(intended);
      if(!excluded && (r.left<-.5||r.right>innerWidth+.5)) outside.push({...name(e),left:round(Math.max(0,-r.left)),right:round(Math.max(0,r.right-innerWidth))});
      if(e instanceof HTMLElement && e.textContent.trim()) {
        const x=['hidden','clip'].includes(s.overflowX)&&e.scrollWidth>e.clientWidth+1;
        const y=['hidden','clip'].includes(s.overflowY)&&e.scrollHeight>e.clientHeight+1;
        if(x||y) clips.push({...name(e),dx:x?e.scrollWidth-e.clientWidth:0,dy:y?e.scrollHeight-e.clientHeight:0,width:round(r.width),height:round(r.height),ellipsis:s.textOverflow==='ellipsis',excluded});
      }
      for(const t of e.childNodes) {
        if(t.nodeType!==Node.TEXT_NODE || !t.textContent.trim()) continue;
        const range=document.createRange();range.selectNodeContents(t);
        for(const raw of range.getClientRects()) {
          let box={left:raw.left,right:raw.right,top:raw.top,bottom:raw.bottom};
          for(let a=e; a && a!==document.body;a=a.parentElement) {
            const st=getComputedStyle(a), ar=a.getBoundingClientRect();
            if(['hidden','clip','auto','scroll'].includes(st.overflowX)){box.left=Math.max(box.left,ar.left);box.right=Math.min(box.right,ar.right);}
            if(['hidden','clip','auto','scroll'].includes(st.overflowY)){box.top=Math.max(box.top,ar.top);box.bottom=Math.min(box.bottom,ar.bottom);}
          }
          if(box.right>box.left&&box.bottom>box.top) texts.push({e,box,text:t.textContent.trim().slice(0,100)});
        }
      }
      if(e.matches('.d-session,.d-day-heading,.c-table tr,.a-nav-item,.c-facet-value,.m-menu-trigger,[data-slot="segmented-control-v2-item"]')) {
        const range=document.createRange();range.selectNodeContents(e);
        const boxes=[...range.getClientRects()].filter(b=>b.width>0&&b.height>0);
        const top=Math.min(r.top,...boxes.map(b=>b.top)),bottom=Math.max(r.bottom,...boxes.map(b=>b.bottom));
        if(top<r.top-1||bottom>r.bottom+1) fixedRows.push({...name(e),height:round(r.height),top:round(r.top-top),bottom:round(bottom-r.bottom)});
      }
    }
    const overlaps=[];
    texts.sort((a,b)=>a.box.top-b.box.top);
    for(let i=0;i<texts.length;i++) for(let j=i+1;j<texts.length&&texts[j].box.top<texts[i].box.bottom-.5;j++) {
      const a=texts[i],b=texts[j];
      if(a.e===b.e||a.e.contains(b.e)||b.e.contains(a.e)) continue;
      // A sheet/menu intentionally paints over the page, not alongside its text.
      if(a.e.closest('.m-sheet,.c-palette,.m-menu-list')!==b.e.closest('.m-sheet,.c-palette,.m-menu-list')) continue;
      if(a.e.closest(intended)||b.e.closest(intended)) continue;
      const w=Math.min(a.box.right,b.box.right)-Math.max(a.box.left,b.box.left);
      const h=Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.top,b.box.top);
      if(w>1&&h>1) overlaps.push({a:{...name(a.e),text:a.text},b:{...name(b.e),text:b.text},width:round(w),height:round(h)});
    }
    const sizes = [...document.querySelectorAll('.m-bars,.m-bar,.m-rangebar,.m-scroll,.m-build,.m-sheet,.m-sheet-head,.m-sheet-body,.m-menu-list,.c-palette,.c-palette-input,.c-palette-list')].map(e=>({name:cssName(e),rect:e.getBoundingClientRect().toJSON(),scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}));
    const bars=[...document.querySelectorAll('.m-bar>*,.m-rangebar>*')].map(e=>({...name(e),rect:e.getBoundingClientRect().toJSON()}));
    const rowSizes=Object.fromEntries(['.d-session:not(.d-subagent)','.d-subagent','.d-day-heading','.c-table tr','.c-table td','.a-nav-item','.c-facet-value','[data-slot="segmented-control-v2-item"]'].map(selector=>[selector,[...new Set([...document.querySelectorAll(selector)].map(e=>round(e.getBoundingClientRect().height)))]]));
    return {root:[document.documentElement.scrollWidth,document.documentElement.clientWidth],outside,clips,overlaps,fixedRows,sizes,bars,rowSizes};
  });
}
async function reach(page) {
  return page.evaluate(()=>{
    const result=[];
    for(const selector of ['.m-scroll','.m-sheet-body','.m-menu-list','.c-palette-list']) {
      const el=document.querySelector(selector);if(!el)continue;
      el.scrollTop=el.scrollHeight;
      const r=el.getBoundingClientRect(), last=el.querySelector('button:last-of-type');
      const controls=[...el.querySelectorAll('button,input,summary,[tabindex="0"]')];
      const bottom=controls.at(-1)?.getBoundingClientRect();
      result.push({selector,top:r.top,bottom:r.bottom,height:r.height,scrollTop:el.scrollTop,maxScroll:el.scrollHeight-el.clientHeight,last:controls.at(-1)?.textContent.slice(0,100),lastRect:bottom?.toJSON(),lastBottomBeyondViewport:bottom?Math.max(0,bottom.bottom-innerHeight):0});
    }
    return result;
  });
}
// Each of 7 page/view states x 3 viewports x 5 overlay states; longest status line on all.
if (!process.env.FONT_ONLY && !process.env.TARGET_ONLY) {
for(const [width,height] of [[320,640],[320,256],[360,640]]) {
  const page=await browser.newPage({viewport:{width,height},colorScheme:'light'});
  for(const view of views) for(const state of ['base','filters','page-menu','range-menu','commands']) {
    await load(page,view,'build=stopped');await open(page,state);
    report.reflow.push({width,height,view,state,scan:await scan(page),reach:await reach(page)});
  }
  await page.close();
}
// Paired DOM checks: keep the same page/data and only add the spacing style.
for(const width of [360,1280]) {
  const page=await browser.newPage({viewport:{width,height:800},colorScheme:'light'});
  for(const view of views) for(const state of width===360?['base','filters','page-menu','range-menu','commands']:['base','commands']) {
    await load(page,view,'build=stopped');
    if(width===1280&&state==='commands') await page.getByRole('button',{name:'⌘K Commands'}).click();else await open(page,state);
    const before=await scan(page);await page.addStyleTag({content:spacing});const after=await scan(page);
    const keys=new Set(before.clips.map(x=>x.key));
    const pairs=new Set(before.overlaps.map(x=>`${x.a.key}:${x.b.key}`));
    const rows=new Set(before.fixedRows.map(x=>x.key));
    report.spacing.push({width,view,state,before,after,newClips:after.clips.filter(x=>!keys.has(x.key)),newOverlaps:after.overlaps.filter(x=>!pairs.has(`${x.a.key}:${x.b.key}`)),newRows:after.fixedRows.filter(x=>!rows.has(x.key))});
  }
  await page.close();
}
// Layout-equivalent zoom emulation, not CDP pinch/pageScaleFactor.
const zoomPage=await browser.newPage({viewport:{width:640,height:400},deviceScaleFactor:2});
for(const view of views) for(const state of ['base','filters','page-menu','range-menu','commands']) {
  await load(zoomPage,view,'build=stopped');await open(zoomPage,state);
  report.zoom.push({view,state,scan:await scan(zoomPage),reach:await reach(zoomPage)});
}
await zoomPage.close();
// axe's default full ruleset, no exclusions. Embedded mode excludes prototype toolbar.
for(const width of [360,1280]) for(const scheme of ['light','dark']) {
  const page=await browser.newPage({viewport:{width,height:800},colorScheme:scheme});
  for(const view of views) {
    await load(page,view);await page.addScriptTag({content:axe});
    const result=await page.evaluate(async()=>{
      const a=await window.axe.run(document);
      return {scheme:document.documentElement.dataset.colorScheme,background:getComputedStyle(document.querySelector('.m-main')).backgroundColor,violations:a.violations.map(v=>({id:v.id,impact:v.impact,count:v.nodes.length,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary,checks:[...n.any,...n.all,...n.none].map(c=>({id:c.id,data:c.data}))}))})),incomplete:a.incomplete.map(v=>({id:v.id,count:v.nodes.length,error:v.error?.message,examples:v.nodes.slice(0,2).map(n=>({target:n.target,summary:n.failureSummary}))}))};
    });
    report.axeRuns.push({width,scheme,view,...result});
  }
  await page.close();
}
}
// Target boxes, nearest edge gap and nearest centre distance. Label replaces its
// checkbox: clicking anywhere on the label toggles the same input, not a second target.
async function targets(page) {
  return page.evaluate(()=>{
    const layer=document.querySelector('.m-sheet,.c-palette');
    const els=[...document.querySelectorAll('button,a[href],input,summary,label.c-facet-value,.m-rhythm rect')].filter(e=>{
      const r=e.getBoundingClientRect();return (!layer||layer.contains(e))&&r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'&&!(e.matches('input[type="checkbox"]')&&e.closest('label'));
    });
    const boxes=els.map(e=>({e,r:e.getBoundingClientRect()}));
    const rnd=n=>Math.round(n*100)/100;
    return boxes.map(({e,r},i)=>{
      const peers=boxes.filter((b,j)=>j!==i&&!e.contains(b.e)&&!b.e.contains(e));
      const gap=b=>Math.hypot(Math.max(0,r.left-b.r.right,b.r.left-r.right),Math.max(0,r.top-b.r.bottom,b.r.top-r.bottom));
      const center=b=>Math.hypot((r.left+r.right-b.r.left-b.r.right)/2,(r.top+r.bottom-b.r.top-b.r.bottom)/2);
      return {tag:e.tagName,name:e.getAttribute('class')??'',label:e.getAttribute('aria-label')??e.textContent.trim().replace(/\s+/g,' ').slice(0,80),width:rnd(r.width),height:rnd(r.height),gap:rnd(Math.min(...peers.map(gap))),center:rnd(Math.min(...peers.map(center))),small:r.width<24||r.height<24};
    });
  });
}
if (!process.env.FONT_ONLY) {
for(const touch of ['auto','on']) {
  const page=await browser.newPage({viewport:{width:360,height:800}});
  for(const view of views) for(const state of ['base','filters','commands','selected-readouts','chips']) {
    if(['selected-readouts','chips'].includes(state)&&view!=='overview')continue;
    await load(page,view,`touch=${touch}`);
    await open(page,state);
    if(state==='selected-readouts') {
      await page.locator('.d-cell').last().focus();
      await page.locator('.m-chart-plot svg').first().focus();
      await page.keyboard.press('ArrowLeft');
    }
    if(state==='chips') {
      await page.locator('.m-context-button').click();
      await page.locator('.c-facet-value').first().click();
      await page.getByRole('button',{name:'Done',exact:true}).click();
    }
    const chartBuckets=await page.evaluate(()=>[...document.querySelectorAll('.m-chart-plot svg')].map(svg=>({width:svg.getBoundingClientRect().width,height:svg.getBoundingClientRect().height,barWidths:[...new Set([...svg.querySelectorAll('rect')].map(r=>Number(r.getAttribute('width'))))]})));
    report.targets.push({touch,view,state,targets:await targets(page),chartBuckets});
  }
  await page.close();
}
}
await browser.close();
// Real Chromium font preference, with an unstyled control page verifying 16 -> 32.
report.fonts=[];
if (!process.env.TARGET_ONLY) {
for(const size of [16,32]) {
  const profile=path.join(out,`font-profile-${size}`);
  await fs.mkdir(path.join(profile,'Default'),{recursive:true});
  await fs.writeFile(path.join(profile,'Default','Preferences'),JSON.stringify({webkit:{webprefs:{default_font_size:size}}}));
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',viewport:{width:1280,height:800},headless:true});
  const page=await context.newPage();
  await page.goto('data:text/html,<p>Unstyled browser default font control</p>');
  const control=await page.locator('p').evaluate(e=>getComputedStyle(e).fontSize);
  assert.equal(control, `${size}px`, 'Browser font preference must affect unstyled control');
  for(const view of views) {
    await load(page,view);
    const fonts=await page.evaluate(()=>[...document.querySelectorAll('.m-root *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())).map((e,i)=>({i,tag:e.tagName,class:e.getAttribute('class'),text:e.textContent.trim().slice(0,80),font:getComputedStyle(e).fontSize})));
    report.fonts.push({size,control,view,fonts,scan:await scan(page)});
  }
  await context.close();
}
}
await fs.writeFile(path.join(out,process.env.FONT_ONLY?'font-results.json':process.env.TARGET_ONLY?'target-results.json':'results.json'),JSON.stringify(report,null,2));
if (!process.env.FONT_ONLY && !process.env.TARGET_ONLY) {
  const index={measured:'2026-10-03',source:'726a30c',units:'CSS px; clip width = scrollWidth - clientWidth; DOM indices are scoped to their case',baseline:report.reflow.filter(x=>x.state==='base').map(x=>({width:x.width,height:x.height,view:x.view,root:x.scan.root,clips:x.scan.clips})),newTextSpacing:report.spacing.filter(x=>x.state==='base').map(x=>({width:x.width,height:800,view:x.view,newClips:x.newClips}))};
  await fs.writeFile(path.join(out,'clipping-index.json'),JSON.stringify(index,null,2));
}
console.log(JSON.stringify({output:path.join(out,process.env.FONT_ONLY?'font-results.json':process.env.TARGET_ONLY?'target-results.json':'results.json'),reflow:report.reflow.length,spacing:report.spacing.length,axe:report.axeRuns.length,zoom:report.zoom.length,targets:report.targets.length,browser:report.browser}));
