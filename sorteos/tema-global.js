(() => {
'use strict';
const KEY='dup-theme';
function getTheme(){const t=localStorage.getItem(KEY);return (t==='dark'||t==='light')?t:'light';}
function apply(theme){
 const dark=theme==='dark';
 document.body.classList.toggle('dark-mode',dark);
 document.documentElement.classList.toggle('dark-mode',dark);
 const di=document.getElementById('theme-icon');
 const mi=document.getElementById('mobile-theme-icon');
 if(di) di.textContent=dark?'☀️':'🌙';
 if(mi) mi.textContent=dark?'☀️':'🌙';
}
function toggle(){const next=document.body.classList.contains('dark-mode')?'light':'dark';localStorage.setItem(KEY,next);apply(next);}
window.toggleTheme=toggle;
function init(){
 apply(getTheme());
 const d=document.getElementById('theme-toggle');
 const m=document.getElementById('mobile-theme-toggle');
 if(d) d.onclick=(e)=>{e.preventDefault();toggle();};
 if(m) m.onclick=(e)=>{e.preventDefault();toggle();};
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();