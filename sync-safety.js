(function(){
var syncedVersions={},tombstonedOrders=new Set(),conflictBusy=false;
function cloudSessionActive(){return typeof sessionStorage!=='undefined'&&!!sessionStorage.getItem('gomita-session')&&!(document.body&&document.body.classList.contains('logged-out'))}
function cloudWritesAllowed(){var life=window.GOMITA_SESSION_LIFECYCLE;return cloudSessionActive()&&(!life||!life.isReady||life.isReady())}
function orderRow(raw){
 var o=Object.assign({},raw);
 if(o.accessoriesList){try{o.accessories=JSON.parse(o.accessoriesList)}catch(_){o.accessories=[]}delete o.accessoriesList}else o.accessories=o.accessories||[];
 return o;
}
function stamp(){return new Date().toISOString()}
var restoreBusy=false,restoreLockCache={active:false,checkedAt:0,restoreId:''};
function splitRows(rows,size){var out=[];for(var i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));return out}
async function checked(request,label){var r=await request;if(r.error)throw new Error(label+': '+(r.error.message||r.error));return r.data}
async function cloudRestoreLocked(force){if(!sp)return false;var now=Date.now();if(!force&&now-restoreLockCache.checkedAt<3000)return restoreLockCache.active;var old=restoreLockCache,row=await checked(sp.from('app_settings').select('data').eq('id','system_restore_state').maybeSingle(),'Khong doc duoc khoa phuc hoi'),data=row&&row.data||{},next={active:!!data.active,checkedAt:now,restoreId:String(data.restoreId||'')},completedElsewhere=old.checkedAt>0&&!next.active&&!!next.restoreId&&next.restoreId!==old.restoreId;restoreLockCache=next;if(completedElsewhere){setSyncStatus('saving','Co ban phuc hoi moi - dang tai lai');if(typeof location!=='undefined'&&location.reload)setTimeout(function(){location.reload()},300);return true}if(next.active)setSyncStatus('error','He thong dang phuc hoi - tam dung dong bo');return next.active}
async function writeRestoreState(data){await checked(sp.from('app_settings').upsert({id:'system_restore_state',data:data,updated_at:stamp()}),'Khong ghi duoc khoa phuc hoi');restoreLockCache={active:!!data.active,checkedAt:Date.now(),restoreId:String(data.restoreId||'')}}
async function upsertRows(table,rows,label){for(var part of splitRows(rows,50))await checked(sp.from(table).upsert(part),label)}
async function deleteIds(table,column,ids,label){for(var part of splitRows(ids,50))await checked(sp.from(table).delete().in(column,part),label)}
function userRow(u){var row=Object.assign({},u);if(row.createdAt){row.created_at=row.createdAt;delete row.createdAt}return row}
function idsOf(rows){return new Set((rows||[]).map(function(x){return x&&x.id}).filter(Boolean))}
function copied(value){return JSON.parse(JSON.stringify(value))}
function replaceLocal(order){var i=db.orders.findIndex(function(x){return x.id===order.id});if(i>=0)db.orders[i]=order;else db.orders.push(order)}
var baseSanitize=sanitizeOrder;
sanitizeOrder=function(o){var clean=baseSanitize(o);clean.updatedAt=o.updatedAt||stamp();return clean};
var baseUpdateState=updateSyncState;
updateSyncState=function(){baseUpdateState();(db.orders||[]).forEach(function(o){if(o.updatedAt)syncedVersions[o.id]=o.updatedAt})};
async function cloudOrder(id){var r=await sp.from('app_orders').select('*').eq('id',id).maybeSingle();if(r.error)throw r.error;return r.data?orderRow(r.data):null}
async function createTombstone(o){
 var id='order_tombstone_'+o.id,data={orderId:o.id,code:o.code||'',deletedAt:stamp(),deletedBy:(typeof user==='function'&&user()?user().name:'Admin')};
 var r=await sp.from('app_settings').upsert({id:id,data:data,updated_at:data.deletedAt});if(r.error)throw r.error;tombstonedOrders.add(o.id);return data;
}
syncOrderToSupabase=async function(o,force){
 if(!sp||restoreBusy||restoreLockCache.active||tombstonedOrders.has(o.id))return false;
 var base=syncedVersions[o.id]||'',next=stamp();o.updatedAt=next;var clean=sanitizeOrder(o),result;
 try{
  if(base&&!force){
   result=await sp.from('app_orders').update(clean).eq('id',o.id).eq('updatedAt',base).select('id,updatedAt');
   if(result.error)throw result.error;
   if(!result.data||!result.data.length){
    var remote=await cloudOrder(o.id);
    if(remote){
     var keep=confirm('Don hang '+(o.code||o.id)+' vua duoc nguoi khac cap nhat tren Cloud.\n\nBam OK: giu ban dang sua va ghi de Cloud.\nBam HUY: nhan ban moi nhat tu Cloud.');
     if(!keep){replaceLocal(remote);syncedVersions[o.id]=remote.updatedAt||'';lastSyncState.orders[o.id]=hashObj(remote);if(typeof rawSave==='function')rawSave();toast('Da nhan ban moi nhat tu Cloud');return true}
    }
    result=await sp.from('app_orders').upsert(clean).select('id,updatedAt');if(result.error)throw result.error;
   }
  }else{result=await sp.from('app_orders').upsert(clean).select('id,updatedAt');if(result.error)throw result.error}
  syncedVersions[o.id]=next;lastSyncState.orders[o.id]=hashObj(o);return true;
 }catch(e){console.error('Safe order sync failed:',e);setSyncStatus('error','L\u1ed7i l\u01b0u \u0111\u01a1n - d\u1eef li\u1ec7u tr\u00ean m\u00e1y v\u1eabn \u0111\u01b0\u1ee3c gi\u1eef');return false}
};
syncChangesToSupabase=function(){
 if(!sp||typeof db==='undefined'||restoreBusy||restoreLockCache.active||!cloudWritesAllowed())return;clearTimeout(syncTimeout);syncTimeout=setTimeout(async function(){if(!cloudWritesAllowed()||restoreBusy||await cloudRestoreLocked(true))return;var changed=false,failed=false;
  for(var o of db.orders||[]){var h=hashObj(o),lockApi=window.GOMITA_ORDER_LOCK;if(lastSyncState.orders[o.id]!==h&&(!lockApi||lockApi.canSyncOrder(o.id))){changed=true;setSyncStatus('saving','\u0110ang \u0111\u1ed3ng b\u1ed9 \u0111\u01a1n h\u00e0ng...');var ok=await syncOrderToSupabase(o);if(!ok){failed=true;if(lockApi)lockApi.onOrderSyncFailed(o.id)}else if(lockApi)lockApi.onOrderSynced(o.id)}}
  for(var u of db.users||[]){var uh=hashObj(u);if(lastSyncState.users[u.id]!==uh){changed=true;await syncUserToSupabase(u);lastSyncState.users[u.id]=hashObj(u)}}
  var sh=hashObj(db.staff||[]);if(lastSyncState.staff!==sh){changed=true;await syncStaffToSupabase(db.staff||[]);lastSyncState.staff=sh}
  if(changed&&!failed){setSyncStatus('done','\u0110\u00e3 l\u01b0u \u0111\u00e1m m\u00e2y');setTimeout(function(){setSyncStatus('running','\u0110ang ch\u1ea1y')},2000)}
 },300)
};
syncFromSupabase=async function(){
 if(!sp||typeof db==='undefined'||conflictBusy||restoreBusy||!cloudSessionActive())return;conflictBusy=true;
 try{if(await cloudRestoreLocked(true))return false;setSyncStatus('saving','\u0110ang t\u1ea3i d\u1eef li\u1ec7u...');
  var rs=await Promise.all([sp.from('app_orders').select('*'),sp.from('app_users').select('*'),sp.from('app_staff').select('*'),sp.from('app_settings').select('id,data,updated_at').like('id','order_tombstone_%')]);
  rs.forEach(function(r){if(r.error)throw r.error});tombstonedOrders=new Set((rs[3].data||[]).map(function(x){return x.data&&x.data.orderId||String(x.id).replace('order_tombstone_','')}));
  var local=db.orders||[],localMap=new Map(local.map(function(o){return[o.id,o]})),merged=[],upload=[];
  (rs[0].data||[]).map(orderRow).forEach(function(remote){if(tombstonedOrders.has(remote.id))return;var lo=localMap.get(remote.id),lockApi=window.GOMITA_ORDER_LOCK;if(lockApi&&lockApi.owns(remote.id)&&lo){merged.push(lo);localMap.delete(remote.id);return}if(!lo){merged.push(remote);return}localMap.delete(remote.id);var base=syncedVersions[remote.id]||'',dirty=!!lastSyncState.orders[remote.id]&&lastSyncState.orders[remote.id]!==hashObj(lo),remoteChanged=!!base&&remote.updatedAt&&remote.updatedAt!==base;if(dirty&&remoteChanged){var keep=confirm('Don hang '+(lo.code||lo.id)+' co thay doi o ca may nay va Cloud.\n\nBam OK: giu ban tren may nay.\nBam HUY: nhan ban Cloud.');if(keep){merged.push(lo);upload.push(lo)}else merged.push(remote)}else merged.push(remote)});
  localMap.forEach(function(lo){if(!tombstonedOrders.has(lo.id)){merged.push(lo);upload.push(lo)}});db.orders=merged;
  var cloudUsers=(rs[1].data||[]).map(function(u){if(u.created_at){u.createdAt=u.created_at;delete u.created_at}return u}),um=new Map(cloudUsers.map(function(u){return[u.id,u]})),newUsers=cloudUsers.slice(),uploadUsers=[];(db.users||[]).forEach(function(u){if(!um.has(u.id)){newUsers.push(u);uploadUsers.push(u)}});db.users=newUsers;if(rs[2].data&&rs[2].data.length)db.staff=rs[2].data;
  updateSyncState();if(typeof rawSave==='function')rawSave();else localStorage.setItem('gomita-flow-v1',JSON.stringify(db));
  for(var o of upload)await syncOrderToSupabase(o,true);for(var u of uploadUsers)await syncUserToSupabase(u);
  if(typeof render==='function')render();if(typeof renderBoard==='function')renderBoard();if(typeof renderReports==='function')renderReports();if(typeof renderAccounts==='function')renderAccounts();setSyncStatus('done','\u0110\u00e3 \u0111\u1ed3ng b\u1ed9');setTimeout(function(){setSyncStatus('running','\u0110ang ch\u1ea1y')},2000);return true
 }catch(e){console.error('Safe cloud pull failed:',e);setSyncStatus('error','L\u1ed7i t\u1ea3i \u0111\u00e1m m\u00e2y');return false}finally{conflictBusy=false}
};
function acceptRemoteOrder(raw){var remote=orderRow(raw),lockApi=window.GOMITA_ORDER_LOCK;if(lockApi&&lockApi.owns(remote.id)){var local=db.orders.find(function(x){return x.id===remote.id});if(local&&local.updatedAt===remote.updatedAt){lastSyncState.orders[remote.id]=hashObj(local);syncedVersions[remote.id]=remote.updatedAt||''}return}replaceLocal(remote);lastSyncState.orders[remote.id]=hashObj(remote);syncedVersions[remote.id]=remote.updatedAt||'';if(typeof rawSave==='function')rawSave();if(typeof render==='function')render()}
function removeRemoteOrder(id){var lockApi=window.GOMITA_ORDER_LOCK;if(lockApi&&lockApi.owns(id))return;db.orders=(db.orders||[]).filter(function(x){return x.id!==id});delete lastSyncState.orders[id];delete syncedVersions[id];if(typeof rawSave==='function')rawSave();if(typeof render==='function')render()}
var orderRealtimeChannel=null;
function startOrderRealtime(){if(!sp||orderRealtimeChannel||!cloudSessionActive())return;try{orderRealtimeChannel=sp.channel('gomita-orders-live').on('postgres_changes',{event:'*',schema:'public',table:'app_orders'},function(payload){if(!cloudSessionActive()||restoreBusy)return;if(payload.eventType==='DELETE')removeRemoteOrder(payload.old&&payload.old.id);else if(payload.new)acceptRemoteOrder(payload.new)}).subscribe()}catch(e){console.error('Order realtime:',e)}}
async function stopOrderRealtime(){var channel=orderRealtimeChannel;orderRealtimeChannel=null;if(!channel)return;try{if(sp&&typeof sp.removeChannel==='function')await sp.removeChannel(channel);else if(typeof channel.unsubscribe==='function')await channel.unsubscribe()}catch(e){console.error('Stop order realtime:',e)}}
async function restoreSnapshot(snapshot){
 if(restoreBusy)throw new Error('Dang co mot lan phuc hoi khac.');if(!sp)throw new Error('Khong ket noi duoc Cloud. Da dung truoc khi thay du lieu.');
 var restored=copied(snapshot);if(!restored||!Array.isArray(restored.orders)||!Array.isArray(restored.users)||!restored.users.length)throw new Error('Ban sao khong hop le hoac khong co tai khoan.');restored.staff=Array.isArray(restored.staff)?restored.staff:[];restored.settings=restored.settings||{};restored.settings.backupUrl=db.settings&&db.settings.backupUrl||restored.settings.backupUrl||(typeof DEFAULT_BACKUP_URL!=='undefined'?DEFAULT_BACKUP_URL:'');
 var orderIds=idsOf(restored.orders),userIds=idsOf(restored.users),staffIds=idsOf(restored.staff);if(orderIds.size!==restored.orders.length||userIds.size!==restored.users.length||staffIds.size!==restored.staff.length)throw new Error('Ban sao co ID trung hoac thieu ID.');
 if(!restored.currentUser||!userIds.has(restored.currentUser)){var active=restored.users.find(function(u){return u.active});restored.currentUser=active&&active.id||restored.users[0]&&restored.users[0].id}
 var restoreId='restore_'+Date.now(),startedAt=stamp();restoreBusy=true;clearTimeout(syncTimeout);setSyncStatus('saving','Dang khoa dong bo de phuc hoi...');
 try{
  await writeRestoreState({active:true,restoreId:restoreId,startedAt:startedAt,by:(typeof user==='function'&&user()?user().name:'Admin')});
  var current=await Promise.all([checked(sp.from('app_orders').select('id'),'Khong doc duoc danh sach don Cloud'),checked(sp.from('app_users').select('id'),'Khong doc duoc tai khoan Cloud'),checked(sp.from('app_staff').select('id'),'Khong doc duoc nhan su Cloud')]);
  var cloudOrderIds=idsOf(current[0]),cloudUserIds=idsOf(current[1]),cloudStaffIds=idsOf(current[2]),version=stamp();restored.orders.forEach(function(o){o.updatedAt=version});
  setSyncStatus('saving','Dang ghi ban sao len Cloud...');await upsertRows('app_orders',restored.orders.map(sanitizeOrder),'Khong phuc hoi duoc don hang');await deleteIds('app_settings','id',Array.from(orderIds).map(function(id){return'order_tombstone_'+id}),'Khong go duoc dau xoa cu');
  var extraOrders=Array.from(cloudOrderIds).filter(function(id){return!orderIds.has(id)}),deletedAt=stamp(),markers=extraOrders.map(function(id){return{id:'order_tombstone_'+id,data:{orderId:id,deletedAt:deletedAt,deletedBy:'System Restore',restoreId:restoreId},updated_at:deletedAt}});
  await upsertRows('app_settings',markers,'Khong danh dau duoc don du Cloud');await deleteIds('app_orders','id',extraOrders,'Khong loai duoc don du Cloud');await upsertRows('app_users',restored.users.map(userRow),'Khong phuc hoi duoc tai khoan');await deleteIds('app_users','id',Array.from(cloudUserIds).filter(function(id){return!userIds.has(id)}),'Khong loai duoc tai khoan du Cloud');await upsertRows('app_staff',restored.staff,'Khong phuc hoi duoc nhan su');await deleteIds('app_staff','id',Array.from(cloudStaffIds).filter(function(id){return!staffIds.has(id)}),'Khong loai duoc nhan su du Cloud');
  restored.settings.lastRestoreAt=stamp();restored.settings.lastRestoreId=restoreId;await writeRestoreState({active:false,restoreId:restoreId,startedAt:startedAt,completedAt:stamp(),orders:restored.orders.length,users:restored.users.length,staff:restored.staff.length});
  db=restored;lastSyncState={orders:{},users:{},staff:''};syncedVersions={};tombstonedOrders=new Set(extraOrders);updateSyncState();if(typeof rawSave==='function')rawSave();else localStorage.setItem('gomita-flow-v1',JSON.stringify(db));setSyncStatus('done','Phuc hoi hoan tat');return{orders:restored.orders.length,users:restored.users.length,staff:restored.staff.length,restoreId:restoreId}
 }catch(e){console.error('Authoritative restore failed:',e);try{await writeRestoreState({active:true,failed:true,restoreId:restoreId,startedAt:startedAt,failedAt:stamp(),error:String(e&&e.message||e)})}catch(lockError){console.error('Restore lock update failed:',lockError)}setSyncStatus('error','Phuc hoi chua hoan tat - dong bo dang khoa');throw new Error('Phuc hoi Cloud chua hoan tat. Du lieu cu van duoc giu trong ban sao an toan. Hay thu lai.')}
 finally{restoreBusy=false}
}
permanentDeleteOrder=async function(id){
 var o=db.orders.find(function(x){return x.id===id});if(!o)return;if(getDaysInTrash(o)<7)return toast('Ch\u01b0a \u0111\u1ee7 7 ng\u00e0y \u0111\u1ec3 x\u00f3a v\u0129nh vi\u1ec5n.');if(!confirm('Xoa vinh vien don hang '+o.code+'? Thao tac nay khong the khoi phuc.'))return;
 setSyncStatus('saving','\u0110ang ghi nh\u1eadn x\u00f3a v\u0129nh vi\u1ec5n...');try{await createTombstone(o);await deleteOrderFromSupabase(id);db.orders=db.orders.filter(function(x){return x.id!==id});delete lastSyncState.orders[id];delete syncedVersions[id];if(typeof rawSave==='function')rawSave();render();toast('\u0110\u00e3 x\u00f3a v\u0129nh vi\u1ec5n v\u00e0 \u0111\u1ed3ng b\u1ed9 l\u00ean Cloud')}catch(e){console.error(e);setSyncStatus('error','Kh\u00f4ng th\u1ec3 x\u00f3a: ch\u01b0a ghi \u0111\u01b0\u1ee3c d\u1ea5u x\u00f3a tr\u00ean Cloud');toast('Ch\u01b0a x\u00f3a \u0111\u01a1n: kh\u00f4ng ghi \u0111\u01b0\u1ee3c x\u00e1c nh\u1eadn tr\u00ean Cloud.')}
};
window.GOMITA_SYNC_SAFETY={orderRow:orderRow,acceptRemoteOrder:acceptRemoteOrder,startRealtime:startOrderRealtime,stopRealtime:stopOrderRealtime,isSessionActive:cloudSessionActive,isTombstoned:function(id){return tombstonedOrders.has(id)},isRestoreBusy:function(){return restoreBusy||restoreLockCache.active||conflictBusy},restoreSnapshot:restoreSnapshot,versions:syncedVersions};
})();
