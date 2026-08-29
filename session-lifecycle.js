(function(){
'use strict';
var IDLE_MS=5*60*1000,WARN_MS=4*60*1000+30*1000,CHECK_MS=10000;
var sessionStarted=false,sessionReady=false,lastActivity=Date.now(),warned=false,checkTimer=null,ending=false,startRun=0;
function loggedIn(){return !!sessionStorage.getItem('gomita-session')&&!document.body.classList.contains('logged-out')}
function lockApi(){return window.GOMITA_ORDER_LOCK}
function syncApi(){return window.GOMITA_SYNC_SAFETY}
function rememberActivity(){if(!loggedIn())return;lastActivity=Date.now();warned=false}
async function stopCloud(){
 sessionStarted=false;sessionReady=false;startRun++;clearInterval(checkTimer);checkTimer=null;
 if(typeof syncTimeout!=='undefined')clearTimeout(syncTimeout);
 var lock=lockApi(),id=lock&&lock.activeOrderId&&lock.activeOrderId();
 if(id&&!(lock.isSaving&&lock.isSaving()))try{await lock.release(id)}catch(e){console.error('Idle release lock:',e)}
 var safety=syncApi();if(safety&&safety.stopRealtime)await safety.stopRealtime();
}
async function startCloud(){
 if(!loggedIn()||sessionStarted)return;sessionStarted=true;sessionReady=false;var run=++startRun;lastActivity=Date.now();warned=false;
 clearInterval(checkTimer);checkTimer=setInterval(checkIdle,CHECK_MS);
 try{var loaded=typeof syncFromSupabase==='function'?await syncFromSupabase():true;if(loaded===false)throw new Error('Không tải được dữ liệu Cloud.');if(run===startRun&&loggedIn()){sessionReady=true;var safety=syncApi();if(safety&&safety.startRealtime)safety.startRealtime()}}catch(e){sessionReady=false;console.error('Start cloud session:',e)}
}
async function idleLogout(){
 if(ending||!loggedIn())return;var lock=lockApi();
 if(lock&&lock.isSaving&&lock.isSaving()){setSyncStatus('saving','Đang chờ lưu Cloud trước khi đăng xuất');return}
 ending=true;try{
  document.querySelectorAll('dialog[open]').forEach(function(d){try{d.close()}catch(_){}});
  if(lock&&lock.isSaving&&lock.isSaving()){ending=false;setSyncStatus('saving','Đang chờ lưu Cloud trước khi đăng xuất');setTimeout(idleLogout,1000);return}
  await stopCloud();baseShowLogin('Đã tự đăng xuất sau 5 phút không thao tác.');
 }finally{ending=false}
}
function checkIdle(){
 if(!loggedIn()){if(sessionStarted)stopCloud();return}
 var idle=Date.now()-lastActivity;
 if(idle>=IDLE_MS){idleLogout();return}
 if(idle>=WARN_MS&&!warned){warned=true;toast('Phiên làm việc sẽ tự đăng xuất sau 30 giây nếu không thao tác.')}
}
var baseEnterApp=enterApp,baseShowLogin=showLogin;
enterApp=function(){var value=baseEnterApp.apply(this,arguments);startCloud();return value};
showLogin=function(){stopCloud();return baseShowLogin.apply(this,arguments)};
['pointerdown','keydown','touchstart','wheel'].forEach(function(type){window.addEventListener(type,rememberActivity,{passive:true,capture:true})});
document.addEventListener('visibilitychange',function(){if(!document.hidden){checkIdle();if(loggedIn()&&Date.now()-lastActivity<IDLE_MS)rememberActivity()}});
window.addEventListener('focus',function(){checkIdle()});
document.addEventListener('DOMContentLoaded',function(){if(loggedIn())startCloud()});
window.GOMITA_SESSION_LIFECYCLE={start:startCloud,stop:stopCloud,check:checkIdle,isStarted:function(){return sessionStarted},isReady:function(){return sessionReady}};
})();
