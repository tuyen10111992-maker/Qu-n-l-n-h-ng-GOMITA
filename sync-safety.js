(function(){
var syncedVersions={},tombstonedOrders=new Set(),conflictBusy=false;
function orderRow(raw){
 var o=Object.assign({},raw);
 if(o.accessoriesList){try{o.accessories=JSON.parse(o.accessoriesList)}catch(_){o.accessories=[]}delete o.accessoriesList}else o.accessories=o.accessories||[];
 return o;
}
function stamp(){return new Date().toISOString()}
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
 if(!sp||tombstonedOrders.has(o.id))return false;
 var base=syncedVersions[o.id]||'',next=stamp();o.updatedAt=next;var clean=sanitizeOrder(o),result;
 try{
  if(base&&!force){
   result=await sp.from('app_orders').update(clean).eq('id',o.id).eq('updatedAt',base).select('id,updatedAt');
   if(result.error)throw result.error;
   if(!result.data||!result.data.length){
    var remote=await cloudOrder(o.id);
    if(remote){
     var keep=confirm('Don hang '+(o.code||o.id)+' vua duoc nguoi khac cap nhat tren Cloud.\n\nBam OK: giu ban dang sua va ghi de Cloud.\nBam HUY: nhan ban moi nhat tu Cloud.');
     if(!keep){replaceLocal(remote);syncedVersions[o.id]=remote.updatedAt||'';lastSyncState.orders[o.id]=hashObj(remote);if(typeof rawSave==='function')rawSave();toast('Da nhan ban moi nhat tu Cloud');return false}
    }
    result=await sp.from('app_orders').upsert(clean).select('id,updatedAt');if(result.error)throw result.error;
   }
  }else{result=await sp.from('app_orders').upsert(clean).select('id,updatedAt');if(result.error)throw result.error}
  syncedVersions[o.id]=next;lastSyncState.orders[o.id]=hashObj(o);return true;
 }catch(e){console.error('Safe order sync failed:',e);setSyncStatus('error','L\u1ed7i l\u01b0u \u0111\u01a1n - d\u1eef li\u1ec7u tr\u00ean m\u00e1y v\u1eabn \u0111\u01b0\u1ee3c gi\u1eef');return false}
};
syncChangesToSupabase=function(){
 if(!sp||typeof db==='undefined')return;clearTimeout(syncTimeout);syncTimeout=setTimeout(async function(){var changed=false,failed=false;
  for(var o of db.orders||[]){var h=hashObj(o);if(lastSyncState.orders[o.id]!==h){changed=true;setSyncStatus('saving','\u0110ang \u0111\u1ed3ng b\u1ed9 \u0111\u01a1n h\u00e0ng...');if(!await syncOrderToSupabase(o))failed=true}}
  for(var u of db.users||[]){var uh=hashObj(u);if(lastSyncState.users[u.id]!==uh){changed=true;await syncUserToSupabase(u);lastSyncState.users[u.id]=hashObj(u)}}
  var sh=hashObj(db.staff||[]);if(lastSyncState.staff!==sh){changed=true;await syncStaffToSupabase(db.staff||[]);lastSyncState.staff=sh}
  if(changed&&!failed){setSyncStatus('done','\u0110\u00e3 l\u01b0u \u0111\u00e1m m\u00e2y');setTimeout(function(){setSyncStatus('running','\u0110ang ch\u1ea1y')},2000)}
 },300)
};
syncFromSupabase=async function(){
 if(!sp||typeof db==='undefined'||conflictBusy)return;conflictBusy=true;setSyncStatus('saving','\u0110ang t\u1ea3i d\u1eef li\u1ec7u...');
 try{
  var rs=await Promise.all([sp.from('app_orders').select('*'),sp.from('app_users').select('*'),sp.from('app_staff').select('*'),sp.from('app_settings').select('id,data,updated_at').like('id','order_tombstone_%')]);
  rs.forEach(function(r){if(r.error)throw r.error});tombstonedOrders=new Set((rs[3].data||[]).map(function(x){return x.data&&x.data.orderId||String(x.id).replace('order_tombstone_','')}));
  var local=db.orders||[],localMap=new Map(local.map(function(o){return[o.id,o]})),merged=[],upload=[];
  (rs[0].data||[]).map(orderRow).forEach(function(remote){if(tombstonedOrders.has(remote.id))return;var lo=localMap.get(remote.id);if(!lo){merged.push(remote);return}localMap.delete(remote.id);var base=syncedVersions[remote.id]||'',dirty=!!lastSyncState.orders[remote.id]&&lastSyncState.orders[remote.id]!==hashObj(lo),remoteChanged=!!base&&remote.updatedAt&&remote.updatedAt!==base;if(dirty&&remoteChanged){var keep=confirm('Don hang '+(lo.code||lo.id)+' co thay doi o ca may nay va Cloud.\n\nBam OK: giu ban tren may nay.\nBam HUY: nhan ban Cloud.');if(keep){merged.push(lo);upload.push(lo)}else merged.push(remote)}else merged.push(remote)});
  localMap.forEach(function(lo){if(!tombstonedOrders.has(lo.id)){merged.push(lo);upload.push(lo)}});db.orders=merged;
  var cloudUsers=(rs[1].data||[]).map(function(u){if(u.created_at){u.createdAt=u.created_at;delete u.created_at}return u}),um=new Map(cloudUsers.map(function(u){return[u.id,u]})),newUsers=cloudUsers.slice(),uploadUsers=[];(db.users||[]).forEach(function(u){if(!um.has(u.id)){newUsers.push(u);uploadUsers.push(u)}});db.users=newUsers;if(rs[2].data&&rs[2].data.length)db.staff=rs[2].data;
  updateSyncState();if(typeof rawSave==='function')rawSave();else localStorage.setItem('gomita-flow-v1',JSON.stringify(db));
  for(var o of upload)await syncOrderToSupabase(o,true);for(var u of uploadUsers)await syncUserToSupabase(u);
  if(typeof render==='function')render();if(typeof renderBoard==='function')renderBoard();if(typeof renderReports==='function')renderReports();if(typeof renderAccounts==='function')renderAccounts();setSyncStatus('done','\u0110\u00e3 \u0111\u1ed3ng b\u1ed9');setTimeout(function(){setSyncStatus('running','\u0110ang ch\u1ea1y')},2000)
 }catch(e){console.error('Safe cloud pull failed:',e);setSyncStatus('error','L\u1ed7i t\u1ea3i \u0111\u00e1m m\u00e2y')}finally{conflictBusy=false}
};
permanentDeleteOrder=async function(id){
 var o=db.orders.find(function(x){return x.id===id});if(!o)return;if(getDaysInTrash(o)<7)return toast('Ch\u01b0a \u0111\u1ee7 7 ng\u00e0y \u0111\u1ec3 x\u00f3a v\u0129nh vi\u1ec5n.');if(!confirm('Xoa vinh vien don hang '+o.code+'? Thao tac nay khong the khoi phuc.'))return;
 setSyncStatus('saving','\u0110ang ghi nh\u1eadn x\u00f3a v\u0129nh vi\u1ec5n...');try{await createTombstone(o);await deleteOrderFromSupabase(id);db.orders=db.orders.filter(function(x){return x.id!==id});delete lastSyncState.orders[id];delete syncedVersions[id];if(typeof rawSave==='function')rawSave();render();toast('\u0110\u00e3 x\u00f3a v\u0129nh vi\u1ec5n v\u00e0 \u0111\u1ed3ng b\u1ed9 l\u00ean Cloud')}catch(e){console.error(e);setSyncStatus('error','Kh\u00f4ng th\u1ec3 x\u00f3a: ch\u01b0a ghi \u0111\u01b0\u1ee3c d\u1ea5u x\u00f3a tr\u00ean Cloud');toast('Ch\u01b0a x\u00f3a \u0111\u01a1n: kh\u00f4ng ghi \u0111\u01b0\u1ee3c x\u00e1c nh\u1eadn tr\u00ean Cloud.')}
};
window.GOMITA_SYNC_SAFETY={orderRow:orderRow,isTombstoned:function(id){return tombstonedOrders.has(id)},versions:syncedVersions};
})();
