// Throwaway research probe; dependencies are supplied from the prototype worktree.
import fs from 'node:fs/promises';
const {chromium}=await import(`${process.env.DEPENDENCIES}/node_modules/playwright/index.mjs`);
const out=process.env.OUTPUT??'/private/var/folders/f_/mpd_wxpx37nb3c44n96b_6pw0000gn/T/opencode/a11y-results';
const browser=await chromium.launch();
const results=[];
for(const width of [320,360]) for(const touch of ['auto','on']) for(const range of ['30d','365d','day:2026-09-30']) {
  const page=await browser.newPage({viewport:{width,height:256}});
  await page.goto(`http://127.0.0.1:4747/?variant=F&embed=1&live=off&build=stopped&touch=${touch}&range=${range}`);
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('.m-context-button').click();
  await page.locator('.c-facet-value').first().click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  const bars=await page.evaluate(()=>({
    root:[document.documentElement.scrollWidth,document.documentElement.clientWidth],
    bars:[...document.querySelectorAll('.m-bars,.m-bar,.m-rangebar,.m-bar>*,.m-rangebar>*,.m-menu-trigger>span,.m-context-button,.m-count')].map(e=>({class:e.className,text:e.textContent.trim(),rect:e.getBoundingClientRect().toJSON(),dx:e.scrollWidth-e.clientWidth,dy:e.scrollHeight-e.clientHeight})),
    clips:[...document.querySelectorAll('.m-root *')].filter(e=>e instanceof HTMLElement&&e.getBoundingClientRect().width&&['hidden','clip'].includes(getComputedStyle(e).overflowX)&&e.scrollWidth>e.clientWidth+1).map(e=>({class:e.className,text:e.textContent.trim().slice(0,100),dx:e.scrollWidth-e.clientWidth})),
  }));
  await page.getByRole('button',{name:'Time range',exact:true}).click();
  const menu=await page.locator('.m-menu-list').evaluate(e=>{e.scrollTop=e.scrollHeight;return {rect:e.getBoundingClientRect().toJSON(),height:e.clientHeight,scrollHeight:e.scrollHeight,scrollTop:e.scrollTop,last:e.lastElementChild.getBoundingClientRect().toJSON()};});
  if(width===320&&range==='30d')await page.screenshot({path:`${out}/short-range-${touch}.png`});
  results.push({width,touch,range,bars,menu});
  await page.close();
}
const page=await browser.newPage({viewport:{width:360,height:640}});
await page.goto('http://127.0.0.1:4747/?variant=F&embed=1&live=off&page=sessions&build=stopped');
await page.evaluate(()=>document.fonts.ready);
await page.addStyleTag({content:'*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}'});
await page.locator('.d-session').first().scrollIntoViewIfNeeded();
await page.screenshot({path:`${out}/sessions-spacing.png`});
await fs.writeFile(`${out}/supplement.json`,JSON.stringify(results,null,2));
await browser.close();
console.log('Supplement complete');
