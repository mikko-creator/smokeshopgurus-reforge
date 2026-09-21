// diag-hero-vapor.mjs — why is the hero vapour barely painting?
import { launch, Session, sleep } from './cdp.mjs';
const vw = Number(process.argv[2] || 1563), vh = Number(process.argv[3] || 653);
const browser = await launch({ headless: true });
const s = await Session.connect(browser.wsUrl);
try {
  const { targetId } = await s.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await s.send('Target.attachToTarget', { targetId, flatten: true });
  await s.send('Page.enable', {}, sessionId);
  await s.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false }, sessionId);
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('ssg.age.ok','1')}catch(e){}" }, sessionId);
  const l = s.once('Page.loadEventFired', 45000).catch(() => null);
  await s.send('Page.navigate', { url: 'http://127.0.0.1:8788/' }, sessionId, 45000);
  await l; await sleep(2500);
  const r = (await s.send('Runtime.evaluate', { expression: `(function(){
    var out = [];
    var hero = document.querySelector('.hero');
    var hcs = getComputedStyle(hero);
    var hr = hero.getBoundingClientRect();
    out.push('hero        rect ' + Math.round(hr.width)+'x'+Math.round(hr.height) + ' top ' + Math.round(hr.top));
    out.push('hero        position ' + hcs.position + '  zIndex ' + hcs.zIndex
      + '  isolation ' + hcs.isolation + '  filter ' + hcs.filter
      + '  transform ' + hcs.transform + '  contain ' + hcs.contain
      + '  mixBlend ' + hcs.mixBlendMode + '  opacity ' + hcs.opacity);
    out.push('hero        bgColor ' + hcs.backgroundColor + '  overflow ' + hcs.overflow);
    var hv = document.querySelector('.hero__vapor');
    if (!hv) { out.push('hero__vapor MISSING'); return out.join('\n'); }
    var vcs = getComputedStyle(hv); var vr = hv.getBoundingClientRect();
    out.push('hero__vapor rect ' + Math.round(vr.width)+'x'+Math.round(vr.height)
      + '  position ' + vcs.position + '  zIndex ' + vcs.zIndex + '  display ' + vcs.display
      + '  overflow ' + vcs.overflow);
    document.querySelectorAll('.hero__vapor .vapor__plume').forEach(function(p, i){
      var cs = getComputedStyle(p); var pr = p.getBoundingClientRect();
      var a = p.getAnimations()[0];
      out.push('  plume h'+(i+1)+'  ' + Math.round(pr.width)+'x'+Math.round(pr.height)
        + '  at ' + Math.round(pr.left)+','+Math.round(pr.top)
        + '  opacity ' + Number(cs.opacity).toFixed(3)
        + '  anim ' + (a ? a.animationName + ' ' + a.playState : 'NONE')
        + '  bg ' + cs.backgroundImage.slice(0, 30));
    });
    var bg = document.querySelector('.hero__bg');
    if (bg) { var bcs = getComputedStyle(bg);
      out.push('hero__bg    zIndex ' + bcs.zIndex + '  opacity ' + bcs.opacity); }
    var after = getComputedStyle(document.querySelector('.hero'), '::after');
    out.push('hero::after zIndex ' + after.zIndex + '  bgImage ' + after.backgroundImage.slice(0,50));
    var inner = document.querySelector('.hero__inner');
    if (inner) { var ics = getComputedStyle(inner);
      out.push('hero__inner position ' + ics.position + '  zIndex ' + ics.zIndex); }
    return out.join('\n');
  })()`, returnByValue: true }, sessionId, 25000));
  if(r.exceptionDetails){console.log("EXCEPTION: "+JSON.stringify(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text));}else{console.log(r.result.value);}
} finally { s.close(); try { browser.proc.kill(); } catch {} }
