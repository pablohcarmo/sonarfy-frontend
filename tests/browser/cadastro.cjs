const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
(async () => {
 fs.mkdirSync('docs/register-qa', { recursive: true });
 const reports=[];
 for(const name of ['edge','firefox']) {
  const browser = name === 'edge' ? await chromium.launch({ channel: 'msedge', headless: true }) : await firefox.launch({ headless: true });
  for(const width of [1440,390]) for(const theme of ['light','dark']) {
   const context=await browser.newContext({viewport:{width,height:width===1440?1000:844},deviceScaleFactor:1});
   const page=await context.newPage(); const errors=[];
   page.on('pageerror', e=>errors.push(e.message));
   await page.addInitScript(theme=>localStorage.setItem('sonarfy_theme',theme),theme);
   await page.route('**/secure.geonames.org/**',route=>route.fulfill({json:{geonames:[
    {name:'São Paulo',adminName1:'São Paulo',countryName:'Brasil'},
    {name:'São Paulo da Assunção de Luanda',countryName:'Angola'},
    {name:'Guarulhos',adminName1:'São Paulo',countryName:'Brasil'},
    {name:'Campinas',adminName1:'São Paulo',countryName:'Brasil'}
   ]}}));
   const baseURL=process.env.BASE_URL || 'http://127.0.0.1:4173';
   for(const removedPath of ['pages/cadastro.html', 'preview/confirmation.html']) {
    const removedResponse = await context.request.get(`${baseURL}/${removedPath}`);
    if(removedResponse.status()!==404)throw Error(`Removed page must return 404: ${removedPath}`);
   }
   await page.goto(`${baseURL}/pages/register.html`);
   await page.evaluate(()=>document.fonts.ready);
   if((await page.locator('label[for="handleField"]').textContent()).trim()!=='Usuário')throw Error('Username label differs from Figma');
   const home=page.locator('.site-header a.back-link');
   if(!await home.isVisible() || (await home.textContent()).trim()!=='Início')throw Error('Header home link missing');
   const pendingIndicators=await page.locator('.password-checklist .invalid .requirement-indicator').evaluateAll(items=>items.map(item=>getComputedStyle(item).backgroundColor));
   if(pendingIndicators.length!==4 || pendingIndicators.some(color=>color!=='rgba(0, 0, 0, 0)'))throw Error('Pending password circles must be hollow');
   await page.screenshot({path:`docs/register-qa/${name}-${width}-${theme}.png`,fullPage:true});
   await page.fill('#passwordField','Senha@123');
   if(await page.locator('.password-checklist .valid').count()!==4)throw Error('Password criteria failed');
   const completedIndicators=await page.locator('.password-checklist .valid .requirement-indicator').evaluateAll(items=>items.map(item=>getComputedStyle(item).backgroundColor));
   if(completedIndicators.length!==4 || completedIndicators.some(color=>color==='rgba(0, 0, 0, 0)'))throw Error('Completed password circles must be filled');
   await page.fill('#passwordField','abc');
   if(await page.locator('.password-checklist .invalid').count()!==4)throw Error('Password criteria must revert when requirements stop being met');
   await page.fill('#passwordField','Senha@123');
   await page.fill('#confirmPasswordField','diferente');
   if(await page.locator('#confirmPasswordField').getAttribute('aria-invalid')!=='true')throw Error('Password mismatch missing');
   await page.fill('#confirmPasswordField','Senha@123');
   await page.locator('[aria-controls="passwordField"]').click();
   if(await page.locator('#passwordField').getAttribute('type')!=='text')throw Error('Visibility toggle failed');
   await page.fill('#cityField','São Paulo');
   await page.waitForSelector('#citySuggestions:not([hidden])');
   await page.screenshot({path:`docs/register-qa/${name}-${width}-${theme}-city.png`,fullPage:true});
   await page.press('#cityField','ArrowDown'); await page.press('#cityField','Enter');
   if(await page.inputValue('#cityField')!=='São Paulo')throw Error('Keyboard selection failed');
   const geometry=await page.evaluate(()=>({
    viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    font:getComputedStyle(document.body).fontFamily,
    fontLoaded:document.fonts.check('15px Inter'),
    card:JSON.parse(JSON.stringify(document.querySelector('.register-card').getBoundingClientRect())),
    assets:Array.from(document.images).filter(i=>i.getBoundingClientRect().width>0).map(i=>({src:i.currentSrc.split('/').pop(),loaded:i.complete&&i.naturalWidth>0,width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height}))
   }));
   if(geometry.scrollWidth>width)throw Error('Horizontal overflow');
   if(geometry.assets.some(i=>!i.loaded))throw Error('Broken asset');
   if(errors.length)throw Error(errors.join('; '));
   reports.push({browser:name,version:browser.version(),width,theme,geometry,errors});
   await page.locator('#theme-toggle').click();
   if(await page.locator('html').getAttribute('data-theme')===theme)throw Error('Theme toggle failed');
   await context.close();
  }
  await browser.close();
 }
 fs.writeFileSync('docs/register-qa/results.json',JSON.stringify(reports,null,2));
 console.log(JSON.stringify(reports.map(({geometry,...r})=>({...r,fontLoaded:geometry.fontLoaded,scrollWidth:geometry.scrollWidth})),null,2));
})().catch(e=>{console.error(e);process.exit(1)});
