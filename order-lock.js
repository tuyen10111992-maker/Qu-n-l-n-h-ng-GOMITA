(function(){
'use strict';
var LOCK_PREFIX='order_lock_',LOCK_TTL=90000,HEARTBEAT=25000;
var activeLock=null,heartbeatTimer=null,pendingRelease=new Set(),newOrders=new Set(),busyOrders=new Set(),viewOnly={},cloudSaveOrderId=null,serverBlocked=false;
var deviceId=sessionStorage.getItem('gomita-device-id');
if(!deviceId){deviceId='device_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);sessionStorage.setItem('gomita-device-id',deviceId)}
function now(){return new Date().toISOString()}
function token(){return 'lock_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)}
function actor(){var u=typeof user==='function'?user():null;return{id:u&&u.id||'',name:u&&u.name||u&&u.username||'Người dùng'}}
function guardElement(){var el=document.getElementById('gomitaServerGuard');if(el)return el;el=document.createElement('div');el.id='gomitaServerGuard';el.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.68);display:flex;align-items:center;justify-content:center;padding:20px';el.innerHTML='<div style="max-width:520px;background:#fff;border-radius:16px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.3);font-family:inherit"><h3 data-guard-title style="margin:0 0 10px;color:#b42318"></h3><p data-guard-message style="margin:0 0 16px;line-height:1.55"></p><button type="button" data-guard-retry class="primary">Kiểm tra lại kết nối</button></div>';document.body.appendChild(el);el.querySelector('[data-guard-retry]').onclick=retryConnection;return el}
function showGuard(title,message,retry){var el=guardElement();el.querySelector('[data-guard-title]').textContent=title;el.querySelector('[data-guard-message]').textContent=message;el.querySelector('[data-guard-retry]').style.display=retry?'':'none';el.style.display='flex'}
function hideGuard(){var el=document.getElementById('gomitaServerGuard');if(el)el.style.display='none'}
async function serverRequest(request){var timer;try{return await Promise.race([request,new Promise(function(_,reject){timer=setTimeout(function(){reject(new Error('Máy chủ không phản hồi sau 5 giây.'))},5000)})])}finally{clearTimeout(timer)}}
async function healthCheck(){if(!sp)throw new Error('Không có kết nối Cloud.');var result=await serverRequest(sp.from('app_settings').select('id').eq('id','system_restore_state').maybeSingle());if(result&&result.error)throw result.error;return true}
function serverUnavailable(error){serverBlocked=true;setSyncStatus('error','Mất kết nối máy chủ');showGuard('Không kết nối được máy chủ','Dữ liệu sẽ không được lưu. Không tiếp tục sửa; hãy kiểm tra mạng rồi bấm Kiểm tra lại kết nối, hoặc đóng trình duyệt và mở lại sau.',true);if(error)console.error('Gomita server unavailable:',error)}
function beginCloudSave(orderId){cloudSaveOrderId=orderId;pendingRelease.add(orderId);var o=db.orders.find(function(x){return x.id===orderId});showGuard('Đang lưu lên Cloud','Đang lưu đơn '+(o&&o.code||orderId)+' lên máy chủ. Vui lòng chờ, chưa thao tác đơn khác.',false)}
function finishCloudSave(orderId){if(cloudSaveOrderId===orderId)cloudSaveOrderId=null;serverBlocked=false;hideGuard()}
async function retryConnection(){
 var button=document.querySelector('#gomitaServerGuard [data-guard-retry]');if(button)button.disabled=true;
 try{await healthCheck();serverBlocked=false;if(activeLock&&!(await heartbeat()))return;if(cloudSaveOrderId){showGuard('Đang lưu lại','Kết nối đã trở lại. Đang gửi lại đơn lên Cloud...',false);syncChangesToSupabase();return}hideGuard();setSyncStatus('running','Đang chạy');toast('Đã kết nối lại máy chủ.')}catch(e){serverUnavailable(e)}finally{if(button)button.disabled=false}
}
function lockId(orderId){return LOCK_PREFIX+orderId}
function expired(data){return !data||!data.expiresAt||Date.parse(data.expiresAt)<=Date.now()}
function owns(orderId){return !!(activeLock&&activeLock.orderId===orderId&&activeLock.deviceId===deviceId)}
async function readLock(orderId){var r=await serverRequest(sp.from('app_settings').select('id,data,updated_at').eq('id',lockId(orderId)).maybeSingle());if(r.error)throw r.error;return r.data}
async function latestOrder(orderId){var r=await serverRequest(sp.from('app_orders').select('*').eq('id',orderId).maybeSingle());if(r.error)throw r.error;var safety=window.GOMITA_SYNC_SAFETY;return r.data?(safety&&safety.orderRow?safety.orderRow(r.data):r.data):null}
function replaceOrder(remote){if(!remote)return;var i=db.orders.findIndex(function(o){return o.id===remote.id});if(i>=0)db.orders[i]=remote;else db.orders.push(remote);if(typeof lastSyncState!=='undefined')lastSyncState.orders[remote.id]=hashObj(remote);var safety=window.GOMITA_SYNC_SAFETY;if(safety&&safety.versions&&remote.updatedAt)safety.versions[remote.id]=remote.updatedAt;if(typeof rawSave==='function')rawSave()}
async function refreshOrder(orderId){var remote=await latestOrder(orderId);if(remote)replaceOrder(remote);return remote}
function lockData(orderId,lockToken){var a=actor(),at=now();return{orderId:orderId,userId:a.id,userName:a.name,deviceId:deviceId,token:lockToken,acquiredAt:at,heartbeatAt:at,expiresAt:new Date(Date.now()+LOCK_TTL).toISOString()}}
async function tryCreate(orderId){var data=lockData(orderId,token()),at=now(),r=await serverRequest(sp.from('app_settings').insert({id:lockId(orderId),data:data,updated_at:at}).select('id,data,updated_at'));if(r.error){if(String(r.error.code||'')==='23505')return null;throw r.error}return r.data&&r.data[0]}
async function tryReplace(row,orderId){var data=lockData(orderId,token()),at=now(),r=await serverRequest(sp.from('app_settings').update({data:data,updated_at:at}).eq('id',lockId(orderId)).eq('updated_at',row.updated_at).select('id,data,updated_at'));if(r.error)throw r.error;return r.data&&r.data[0]}
async function acquire(orderId){
 if(!sp){serverUnavailable();return{ok:false,error:'Không kết nối được máy chủ.'}};
 if(owns(orderId))return{ok:true,lock:activeLock};
 if(activeLock&&activeLock.orderId!==orderId){if(cloudSaveOrderId)return{ok:false,saving:true};await release(activeLock.orderId)}
 for(var attempt=0;attempt<2;attempt++){
  var row=await readLock(orderId),mine=row&&row.data&&row.data.deviceId===deviceId&&row.data.userId===actor().id;
  if(row&&!expired(row.data)&&!mine)return{ok:false,holder:row.data};
  var won=row?await tryReplace(row,orderId):await tryCreate(orderId);
  if(won){activeLock=Object.assign({},won.data,{version:won.updated_at});startHeartbeat();delete viewOnly[orderId];return{ok:true,lock:activeLock}}
 }
 var current=await readLock(orderId);return{ok:false,holder:current&&current.data};
}
function startHeartbeat(){clearInterval(heartbeatTimer);heartbeatTimer=setInterval(heartbeat,HEARTBEAT)}
async function heartbeat(){
 if(!activeLock||!sp)return false;var lock=activeLock,data=Object.assign({},lock,{heartbeatAt:now(),expiresAt:new Date(Date.now()+LOCK_TTL).toISOString()});delete data.version;
 try{var at=now(),r=await serverRequest(sp.from('app_settings').update({data:data,updated_at:at}).eq('id',lockId(lock.orderId)).eq('updated_at',lock.version).select('updated_at'));if(r.error||!r.data||!r.data.length){loseLock(lock.orderId);return false}activeLock=Object.assign({},data,{version:r.data[0].updated_at});return true}catch(e){serverUnavailable(e);return false}
}
function loseLock(orderId){clearInterval(heartbeatTimer);heartbeatTimer=null;activeLock=null;if(cloudSaveOrderId===orderId){serverBlocked=true;showGuard('Đơn chưa được lưu','Quyền sửa đơn đã hết hạn trước khi Cloud xác nhận. Không tiếp tục thao tác; hãy đóng trình duyệt và mở lại để kiểm tra dữ liệu.',false);return}toast('Quyền sửa đơn đã hết hạn hoặc được chuyển sang người khác.');if($('#orderDialog')&&$('#orderDialog').open){$('#orderDialog').close();refreshOrder(orderId).then(function(){render()})}}
async function release(orderId){
 if(!activeLock||activeLock.orderId!==orderId)return;var lock=activeLock;clearInterval(heartbeatTimer);heartbeatTimer=null;activeLock=null;pendingRelease.delete(orderId);
 try{await sp.from('app_settings').delete().eq('id',lockId(orderId)).eq('updated_at',lock.version)}catch(e){console.error('Release order lock:',e)}
}
function markReadOnly(orderId,holder){
 viewOnly[orderId]={holder:holder,at:Date.now()};var body=$('#orderFormBody');if(!body)return;var name=holder&&holder.userName||'người khác';body.insertAdjacentHTML('afterbegin','<div class="locked order-edit-lock">🔒 Đơn đang được <b>'+esc(name)+'</b> chỉnh sửa. Bạn chỉ được xem.</div>');
 body.querySelectorAll('input,textarea,select,button').forEach(function(el){if(el.matches('[data-tab],button[value="cancel"],.icon'))return;el.disabled=true});
}
function canSyncOrder(orderId){return owns(orderId)||newOrders.has(orderId)}
function onOrderSynced(orderId){newOrders.delete(orderId);finishCloudSave(orderId);if(pendingRelease.has(orderId))release(orderId)}
function onOrderSyncFailed(orderId){if(!cloudSaveOrderId)cloudSaveOrderId=orderId;serverUnavailable();if(owns(orderId))toast('Chưa lưu được đơn lên Cloud. Đơn vẫn đang được giữ khóa trên máy này.')}
function markOrderBusy(orderId,busy){
 document.querySelectorAll('.card[data-id]').forEach(function(card){if(card.dataset.id!==orderId)return;card.classList.toggle('order-lock-checking',busy);card.setAttribute('aria-busy',busy?'true':'false');card.style.pointerEvents=busy?'none':'';card.style.opacity=busy?'.6':'';if(busy){card.dataset.lockDraggable=card.getAttribute('draggable')||'';card.draggable=false}else{if(card.dataset.lockDraggable)card.setAttribute('draggable',card.dataset.lockDraggable);delete card.dataset.lockDraggable}});
}
async function openLocked(orderId,tab,baseOpen){
 if(serverBlocked||cloudSaveOrderId)return showGuard(serverBlocked?'Không kết nối được máy chủ':'Đang lưu lên Cloud',serverBlocked?'Hãy kiểm tra lại kết nối trước khi sửa đơn.':'Vui lòng chờ đơn hiện tại lưu xong rồi mới thao tác đơn khác.',serverBlocked);
 if(!orderId)return baseOpen(orderId,tab);
 if(owns(orderId))return baseOpen(orderId,tab);
 var cached=viewOnly[orderId];if(cached&&Date.now()-cached.at<2500){var shown=baseOpen(orderId,tab);markReadOnly(orderId,cached.holder);return shown}
 try{var result=await acquire(orderId);if(result.saving)return toast('Đang lưu đơn trước đó lên Cloud. Vui lòng chờ.');await refreshOrder(orderId);var opened=baseOpen(orderId,tab);if(!result.ok){viewOnly[orderId]={holder:result.holder,at:Date.now()};markReadOnly(orderId,result.holder);toast('Đơn đang được '+(result.holder&&result.holder.userName||'người khác')+' chỉnh sửa.')}return opened}catch(e){serverUnavailable(e)}
}
function settleWhenIdle(orderId){if(!owns(orderId))return;var orderDialog=$('#orderDialog'),quickDialog=$('#quickDialog');if(orderDialog&&orderDialog.open||quickDialog&&quickDialog.open)return;var o=db.orders.find(function(x){return x.id===orderId}),dirty=o&&lastSyncState.orders[orderId]!==hashObj(o);if(dirty){beginCloudSave(orderId);syncChangesToSupabase()}else release(orderId)}
async function withLock(orderId,action){
 if(serverBlocked||cloudSaveOrderId)return toast(serverBlocked?'Không kết nối được máy chủ. Hãy kiểm tra lại kết nối.':'Đang lưu đơn lên Cloud. Vui lòng chờ hoàn tất.');
 if(busyOrders.has(orderId))return toast('Đơn này đang được kiểm tra hoặc xử lý. Vui lòng chờ.');
 busyOrders.add(orderId);markOrderBusy(orderId,true);setSyncStatus('saving','Đang kiểm tra quyền sửa đơn...');
 try{var alreadyOwned=owns(orderId),got=await acquire(orderId);if(got.saving)return toast('Đang lưu đơn trước đó lên Cloud. Vui lòng chờ.');if(!got.ok)return toast('Đơn đang được '+(got.holder&&got.holder.userName||'người khác')+' chỉnh sửa.');if(!alreadyOwned)await refreshOrder(orderId);var value=await action();setTimeout(function(){settleWhenIdle(orderId)},0);return value}catch(e){serverUnavailable(e)}finally{busyOrders.delete(orderId);markOrderBusy(orderId,false);if(!serverBlocked&&!cloudSaveOrderId)setSyncStatus('running','Đang chạy')}
}
var baseOpenOrderLock=openOrder;
async function openNewOrder(){if(serverBlocked||cloudSaveOrderId)return toast(serverBlocked?'Không kết nối được máy chủ. Chưa thể tạo đơn.':'Đang lưu đơn lên Cloud. Vui lòng chờ.');try{await healthCheck();return baseOpenOrderLock()}catch(e){serverUnavailable(e)}}
openOrder=function(id,tab){return id?openLocked(id,tab,baseOpenOrderLock):openNewOrder()};
var baseSaveOrderLock=saveOrder;
saveOrder=function(o,existing){if(serverBlocked||cloudSaveOrderId)return toast('Chưa thể lưu vì máy chủ đang bận hoặc mất kết nối.');if(existing&&!owns(o.id))return toast('Bạn chưa có quyền sửa đơn này. Hãy đóng và mở lại đơn.');var result=baseSaveOrderLock(o,existing);if(!existing&&db.orders.some(function(x){return x.id===o.id})){newOrders.add(o.id);beginCloudSave(o.id)}return result};
var baseRequestTransitionLock=requestTransition;
requestTransition=function(id,stage){return withLock(id,function(){return baseRequestTransitionLock(id,stage)})};
if(typeof startDialog==='function'){var baseStartDialogLock=startDialog;startDialog=function(o){return withLock(o.id,function(){return baseStartDialogLock(db.orders.find(function(x){return x.id===o.id}))})}}
if(typeof returnDialog==='function'){var baseReturnDialogLock=returnDialog;returnDialog=function(o){return withLock(o.id,function(){return baseReturnDialogLock(db.orders.find(function(x){return x.id===o.id}))})}}
if(typeof restoreOrder==='function'){var baseRestoreOrderLock=restoreOrder;restoreOrder=function(id){return withLock(id,function(){return baseRestoreOrderLock(id)})}}
if(typeof permanentDeleteOrder==='function'){var basePermanentDeleteLock=permanentDeleteOrder;permanentDeleteOrder=function(id){return withLock(id,function(){return basePermanentDeleteLock(id)})}}
var dialog=$('#orderDialog');if(dialog)dialog.addEventListener('close',function(){if(activeLock)settleWhenIdle(activeLock.orderId)});
var quickDialog=$('#quickDialog');if(quickDialog)quickDialog.addEventListener('close',function(){if(activeLock)setTimeout(function(){if(activeLock)settleWhenIdle(activeLock.orderId)},0)});
window.addEventListener('pagehide',function(){if(activeLock&&!cloudSaveOrderId)release(activeLock.orderId)});
window.addEventListener('offline',function(){serverUnavailable(new Error('Trình duyệt báo mất kết nối mạng.'))});
window.GOMITA_ORDER_LOCK={acquire:acquire,release:release,owns:owns,isBusy:function(id){return busyOrders.has(id)},isSaving:function(){return!!cloudSaveOrderId},isServerBlocked:function(){return serverBlocked},retryConnection:retryConnection,canSyncOrder:canSyncOrder,onOrderSynced:onOrderSynced,onOrderSyncFailed:onOrderSyncFailed,activeOrderId:function(){return activeLock&&activeLock.orderId||null},refreshOrder:refreshOrder};
})();
