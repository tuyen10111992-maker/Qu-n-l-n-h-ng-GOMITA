// Quản lý tài liệu PDF và phạm vi dữ liệu của Sale.
(function(){
var SALE_ROLE='Sale';
var DOC_TYPES={quote:'Báo giá',contract:'Hợp đồng',drawing:'Bản vẽ'};
var MANAGER_ROLES=['Quản lý đơn hàng','Quản lý sản xuất','Giám đốc','Phó giám đốc','Admin'];
if(!ROLES.includes(SALE_ROLE))ROLES.splice(1,0,SALE_ROLE);
db.settings=db.settings||{};
db.settings.documentUrl=db.settings.documentUrl||'';
db.settings.documentToken=db.settings.documentToken||'';
async function saveDocumentSettingsCloud(){
 if(typeof sp==='undefined'||!sp)return;
 var data={documentUrl:db.settings.documentUrl||'',documentToken:db.settings.documentToken||''};
 var result=await sp.from('app_settings').upsert({id:'documents',data:data,updated_at:new Date().toISOString()});
 if(result.error)throw result.error;
}
if(typeof syncFromSupabase==='function'){
 var baseSyncFromSupabaseDocs=syncFromSupabase;
 syncFromSupabase=async function(){
  if(typeof sp!=='undefined'&&sp){try{var result=await sp.from('app_settings').select('data').eq('id','documents').maybeSingle();if(!result.error&&result.data&&result.data.data){db.settings.documentUrl=result.data.data.documentUrl||db.settings.documentUrl||'';db.settings.documentToken=result.data.data.documentToken||db.settings.documentToken||'';if(typeof rawSave==='function')rawSave();else save()}}catch(ignore){}}
  return baseSyncFromSupabaseDocs();
 };
}
(db.users||[]).forEach(function(u){u.email=String(u.email||'').trim().toLowerCase()});
(db.orders||[]).forEach(function(o){o.documents=o.documents||{};if(!o.saleOwnerId){var sale=(db.users||[]).find(function(u){return u.role===SALE_ROLE&&u.name===o.owner});if(sale)o.saleOwnerId=sale.id}});

function isSale(){return user().role===SALE_ROLE}
function canSeeOrder(o){return !isSale()||(o.saleOwnerId===user().id&&o.stage!=='Lưu trữ'&&!o.deletedAt)}
function sales(){return(db.users||[]).filter(function(u){return u.active&&u.role===SALE_ROLE})}
function assignedSale(o){return(db.users||[]).find(function(u){return u.id===o.saleOwnerId&&u.active&&u.role===SALE_ROLE})}
function canUpdateDocuments(o){if(isSale())return canSeeOrder(o);return MANAGER_ROLES.includes(user().role)}
function emailsForOrder(o){var list=(db.users||[]).filter(function(u){return u.active&&u.email&&u.role!==SALE_ROLE}).map(function(u){return u.email});var sale=assignedSale(o);if(sale&&sale.email)list.push(sale.email);return Array.from(new Set(list.map(function(x){return x.toLowerCase()})))}
function withVisibleOrders(fn){if(!isSale())return fn();var all=db.orders;db.orders=all.filter(canSeeOrder);try{return fn()}finally{db.orders=all}}

var style=document.createElement('style');
style.textContent='.sale-email-warn{color:#b83232;font-weight:700}.documents-box{margin-top:22px;padding-top:18px;border-top:1px solid var(--line)}.documents-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.documents-head h3{margin:0}.documents-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.document-card{padding:14px;border:1px solid var(--line);border-radius:13px;background:#fbfcfe;min-width:0}.document-card h4{margin:0 0 9px}.document-file{min-height:48px}.document-file b,.document-file small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.document-file small{color:var(--muted);margin-top:4px}.document-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:11px}.document-actions button,.document-actions a{min-height:34px;padding:6px 10px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--ink);text-decoration:none;font-size:12px}.document-history{margin-top:9px;font-size:11px;color:var(--muted)}.document-history summary{cursor:pointer;font-weight:700}.document-history-item{padding:6px 0;border-top:1px solid #e8edf3}.drive-config{margin-top:16px}.upload-progress{margin:12px 0;padding:10px;border-radius:9px;background:#eef4ff;color:#34557f}.sale-owner-note{margin-top:4px;color:var(--muted);font-size:11px}@media(max-width:800px){.documents-grid{grid-template-columns:1fr}}';
document.head.appendChild(style);

var baseRenderBoardDocs=renderBoard;
renderBoard=function(){return withVisibleOrders(function(){return baseRenderBoardDocs()})};
var baseRenderReportsDocs=renderReports;
renderReports=function(){if(isSale())return;return baseRenderReportsDocs()};
var baseRenderReportDocs=renderReport;
renderReport=function(type){if(isSale())return;return baseRenderReportDocs(type)};
var baseRenderArchiveDocs=typeof renderArchiveV2==='function'?renderArchiveV2:null;
if(baseRenderArchiveDocs)renderArchiveV2=function(){return withVisibleOrders(function(){return baseRenderArchiveDocs()})};

function applySaleNavigation(){
 var role=user().role,sale=role===SALE_ROLE,admin=role==='Admin';
 var visible={kanban:true,archive:!sale,reports:!sale,accounts:admin,trash:admin};
 Object.keys(visible).forEach(function(view){var button=$('.nav[data-view="'+view+'"]');if(button)button.style.display=visible[view]?'':'none'});
 var sync=$('#syncOnlineBtn');if(sync)sync.style.display=sale?'none':'';
 var active=$('.nav.active'),activeView=active&&active.dataset.view;
 if(activeView&&!visible[activeView]){$$('.nav,.view').forEach(function(x){x.classList.remove('active')});var button=$('.nav[data-view="kanban"]');if(button)button.classList.add('active');$('#kanbanView').classList.add('active')}
}
var baseRenderDocs=render;
render=function(){var result=baseRenderDocs();applySaleNavigation();return result};
var baseEnterDocs=enterApp;
enterApp=function(){baseEnterDocs();applySaleNavigation();if(!user().email)setTimeout(function(){toast('Tài khoản chưa có email Google. Hãy liên hệ Admin cập nhật email.')},500)};

var baseCanMoveDocs=canMoveFrom;
canMoveFrom=function(stage){if(isSale()){var i=STAGES.indexOf(stage);return i<3}return baseCanMoveDocs(stage)};
var baseTransitionDocs=transitionAllowed;
transitionAllowed=function(from,to){if(isSale()){var a=STAGES.indexOf(from),b=STAGES.indexOf(to);if(b!==a+1)return'Chỉ được chuyển sang bước kế tiếp.';return b<=3?'':'Sale không có quyền chuyển từ '+from+' sang '+to+'.'}return baseTransitionDocs(from,to)};
var baseCanAddDocs=canAddData;
canAddData=function(type){if(isSale())return['extras','payments','costs'].includes(type);return baseCanAddDocs(type)};

function accountRows(){
 return(db.users||[]).map(function(u){return'<tr><td><div class="account-name"><span class="account-avatar">'+esc((u.name||'?').trim()[0]||'?')+'</span><b>'+esc(u.name)+'</b></div></td><td>'+esc(u.username)+'</td><td class="'+(u.email?'':'sale-email-warn')+'">'+esc(u.email||'Chưa cập nhật')+'</td><td><span class="role-pill">'+esc(u.role)+'</span></td><td>'+esc(u.phone||'—')+'</td><td><span class="status-pill '+(u.active?'active':'inactive')+'">● '+(u.active?'Hoạt động':'Đã khóa')+'</span></td><td><div class="row-actions"><button data-edit-user="'+u.id+'">Sửa</button><button data-toggle-user="'+u.id+'">'+(u.active?'Khóa':'Mở')+'</button></div></td></tr>'}).join('');
}
var baseRenderAccountsDocs=renderAccounts;
renderAccounts=function(){
 baseRenderAccountsDocs();
 if(!$('#accountsContent'))return;
 var active=db.users.filter(function(x){return x.active}).length,missing=db.users.filter(function(x){return!x.email}).length;
 $('#accountStats').innerHTML='<div class="metric"><small>Tổng tài khoản</small><strong>'+db.users.length+'</strong></div><div class="metric"><small>Đang hoạt động</small><strong>'+active+'</strong></div><div class="metric"><small>Thiếu email</small><strong class="'+(missing?'danger':'')+'">'+missing+'</strong></div>';
 $('#accountsContent').innerHTML='<table class="data account-table"><thead><tr><th>Người dùng</th><th>Tên đăng nhập</th><th>Email Google</th><th>Vai trò</th><th>Điện thoại</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>'+accountRows()+'</tbody></table>';
 var old=$('#documentDriveConfig');if(old)old.remove();
 $('#accountsContent').insertAdjacentHTML('afterend','<div id="documentDriveConfig" class="backup-box drive-config"><div class="pagehead"><div><h3>Tài liệu đơn hàng trên Google Drive</h3><p>PDF Báo giá, Hợp đồng và Bản vẽ · Chỉ chia sẻ cho email được phép</p></div></div><div class="grid"><div class="field span2"><label>URL Google Apps Script tài liệu</label><input id="documentUrl" value="'+esc(db.settings.documentUrl||'')+'" placeholder="https://script.google.com/macros/s/.../exec"></div><div class="field"><label>Mã xác thực tài liệu</label><input id="documentToken" type="password" value="'+esc(db.settings.documentToken||'')+'"></div></div><div class="backup-actions"><button id="saveDocumentConfig" class="primary">Lưu cấu hình</button><button id="syncDocumentPermissions">Đồng bộ quyền Drive</button></div></div>');
 $$('[data-edit-user]').forEach(function(b){b.onclick=function(){openAccount(b.dataset.editUser)}});
 $$('[data-toggle-user]').forEach(function(b){b.onclick=function(){toggleAccount(b.dataset.toggleUser)}});
 $('#saveDocumentConfig').onclick=async function(){db.settings.documentUrl=$('#documentUrl').value.trim();db.settings.documentToken=$('#documentToken').value.trim();save();try{await saveDocumentSettingsCloud();toast('Đã lưu cấu hình tài liệu Google Drive')}catch(err){console.error(err);toast('Đã lưu trên máy nhưng chưa lưu được cấu hình lên Cloud.')}};
 $('#syncDocumentPermissions').onclick=function(){syncAllDocumentPermissions(false)};
};
openAccount=function(id){
 var u=id?db.users.find(function(x){return x.id===id}):{id:uid(),name:'',username:'',password:'',email:'',role:SALE_ROLE,phone:'',active:true};
 $('#accountTitle').textContent=id?'Sửa tài khoản':'Tạo tài khoản';
 $('#accountBody').innerHTML='<div class="formcontent"><div class="grid"><div class="field span2"><label>Họ và tên *</label><input name="name" value="'+esc(u.name)+'" required></div><div class="field"><label>Số điện thoại</label><input name="phone" value="'+esc(u.phone||'')+'"></div><div class="field span2"><label>Email Google *</label><input type="email" name="email" value="'+esc(u.email||'')+'" required placeholder="ten@gmail.com"></div><div class="field"><label>Tên đăng nhập *</label><input name="username" value="'+esc(u.username)+'" required autocomplete="off"></div><div class="field"><label>Mật khẩu '+(id?'(để trống nếu giữ nguyên)':'*')+'</label><input type="password" name="password" autocomplete="new-password"></div><div class="field"><label>Vai trò</label><select name="role">'+ROLES.map(function(r){return'<option '+(r===u.role?'selected':'')+'>'+esc(r)+'</option>'}).join('')+'</select></div></div></div><div class="modalactions"><button value="cancel">Hủy</button><button type="button" id="saveAccount" class="primary">Lưu tài khoản</button></div>';
 $('#accountDialog').showModal();
 $('#saveAccount').onclick=function(){var f=new FormData($('#accountForm')),name=String(f.get('name')||'').trim(),username=String(f.get('username')||'').trim().toLowerCase(),email=String(f.get('email')||'').trim().toLowerCase(),password=String(f.get('password')||'');if(!name||!username||!email||(!id&&!password))return toast('Vui lòng nhập đủ họ tên, email, tên đăng nhập và mật khẩu.');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return toast('Email không hợp lệ.');if(db.users.some(function(x){return x.id!==u.id&&x.username.toLowerCase()===username}))return toast('Tên đăng nhập đã tồn tại.');if(db.users.some(function(x){return x.id!==u.id&&String(x.email||'').toLowerCase()===email}))return toast('Email đã được sử dụng cho tài khoản khác.');var oldEmail=u.email||'',oldRole=u.role;u.name=name;u.username=username;u.email=email;u.phone=String(f.get('phone')||'').trim();u.role=String(f.get('role'));if(password)u.password=password;if(!id){u.createdAt=new Date().toISOString();db.users.push(u)}render();$('#accountDialog').close();toast(id?'Đã cập nhật tài khoản':'Đã tạo tài khoản');if(oldEmail!==email||oldRole!==u.role)syncAllDocumentPermissions(true)};
};
var baseToggleAccountDocs=toggleAccount;
toggleAccount=function(id){baseToggleAccountDocs(id);syncAllDocumentPermissions(true)};

function saleOwnerField(o){
 var selected=o?o.saleOwnerId||'':isSale()?user().id:'';
 if(isSale())return'<div class="field"><label>Sale phụ trách</label><input value="'+esc(user().name)+'" disabled><input type="hidden" name="saleOwnerId" value="'+user().id+'"></div>';
 if(MANAGER_ROLES.includes(user().role))return'<div class="field"><label>Sale phụ trách</label><select name="saleOwnerId"><option value="">-- Chưa giao Sale --</option>'+sales().map(function(s){return'<option value="'+s.id+'" '+(s.id===selected?'selected':'')+'>'+esc(s.name)+' · '+esc(s.email||'chưa có email')+'</option>'}).join('')+'</select><small class="sale-owner-note">Sale chỉ nhìn thấy những đơn được giao cho mình.</small></div>';
 var sale=assignedSale(o||{});return'<div class="field"><label>Sale phụ trách</label><input value="'+esc(sale?sale.name:'Chưa giao Sale')+'" disabled></div>';
}
var baseOpenOrderDocs=openOrder;
openOrder=function(id,tab){
 tab=tab||'info';var order=id?db.orders.find(function(x){return x.id===id}):null;
 if(order&&!canSeeOrder(order)){toast('Bạn không có quyền xem đơn hàng này.');return}
 baseOpenOrderDocs(id,tab);
 if(order&&order.stage==='Lưu trữ'&&!order.locked&&user().role==='Admin'){
  var actions=$('#orderFormBody .modalactions');
  if(actions&&!actions.querySelector('#relockOrder'))actions.insertAdjacentHTML('afterbegin','<button type="button" id="relockOrder">🔒 Khóa đơn lại</button>');
  var relock=$('#relockOrder');if(relock)relock.onclick=function(){if(!confirm('Khóa lại đơn '+order.code+'? Sau khi khóa, đơn sẽ trở về chế độ chỉ đọc.'))return;order.locked=true;log(order,'Khóa lại đơn lưu trữ');render();openOrder(order.id,tab);toast('Đã khóa lại đơn hàng')};
 }
 if(tab!=='info')return;
 var content=$('#orderFormBody .formcontent'),grid=content&&content.querySelector('.grid');if(!content||!grid)return;
 if(!grid.querySelector('[name="saleOwnerId"]'))grid.insertAdjacentHTML('beforeend',saleOwnerField(order));
 if(order){order.documents=order.documents||{};content.insertAdjacentHTML('beforeend',renderDocumentSection(order));bindDocumentActions(order)}
 else content.insertAdjacentHTML('beforeend','<div class="documents-box"><h3>Tài liệu đơn hàng</h3><div class="empty">Hãy lưu đơn hàng trước khi tải tài liệu.</div></div>');
};
var baseSaveOrderDocs=saveOrder;
saveOrder=function(o,isExisting){
 var before=o.saleOwnerId||'',field=$('#orderForm [name="saleOwnerId"]'),saleId=isSale()?user().id:field?field.value:before;
 o.saleOwnerId=saleId||'';o.documents=o.documents||{};var sale=(db.users||[]).find(function(x){return x.id===o.saleOwnerId});var ownerField=$('#orderForm [name="owner"]');if(sale&&ownerField){ownerField.value=sale.name;o.owner=sale.name}
 if(before!==o.saleOwnerId)log(o,'Giao đơn cho Sale: '+(sale?sale.name:'Chưa giao'));
 baseSaveOrderDocs(o,isExisting);
 if(before!==o.saleOwnerId&&isExisting)syncOrderDocumentPermissions(o,true);
};
var baseMoveOrderDocs=moveOrder;
moveOrder=function(o,stage,meta){
 var saleChanged=false;
 if(stage==='Nghiệm thu'&&meta&&meta.saleOwner){var sale=sales().find(function(x){return x.name===meta.saleOwner});if(sale&&o.saleOwnerId!==sale.id){o.saleOwnerId=sale.id;saleChanged=true;log(o,'Giao lại đơn cho Sale: '+sale.name)}}
 var result=baseMoveOrderDocs(o,stage,meta);if(saleChanged)syncOrderDocumentPermissions(o,true);return result;
};
var baseRequestDocs=requestTransition;
requestTransition=function(id,stage){
 var o=db.orders.find(function(x){return x.id===id});if(o&&!canSeeOrder(o))return toast('Bạn không có quyền thao tác đơn hàng này.');
 var result=baseRequestDocs(id,stage);
 if(stage==='Nghiệm thu'&&o){var select=$('#quickForm [name="saleOwner"]');if(select){sales().forEach(function(s){if(!Array.from(select.options).some(function(x){return x.value===s.name})){var option=document.createElement('option');option.value=s.name;option.textContent=s.name+' · Sale';select.appendChild(option)}});var current=assignedSale(o);if(current)select.value=current.name}}
 return result;
};

function documentHistoryHtml(doc){
 var history=(doc&&doc.history)||[];if(!history.length)return'';
 return'<details class="document-history"><summary>Lịch sử cập nhật ('+history.length+')</summary>'+history.map(function(x){return'<div class="document-history-item"><b>'+esc(x.action||'Cập nhật')+(x.version?' · Phiên bản '+x.version:'')+'</b> · '+esc(x.by||'')+(x.email?' · '+esc(x.email):'')+'<br>'+esc(x.oldName||'Chưa có file')+' → '+esc(x.newName||'')+'<br>'+new Date(x.at).toLocaleString('vi-VN')+'</div>'}).join('')+'</details>';
}
function renderDocumentSection(o){
 var cards=Object.keys(DOC_TYPES).map(function(type){var label=DOC_TYPES[type],doc=o.documents&&o.documents[type],canUpdate=canUpdateDocuments(o);return'<article class="document-card"><h4>▤ '+label+'</h4><div class="document-file">'+(doc?'<b title="'+esc(doc.name)+'">'+esc(doc.name)+'</b><small>Phiên bản '+Number(doc.version||1)+' · '+new Date(doc.updatedAt).toLocaleString('vi-VN')+'</small><small>'+esc(doc.updatedBy||'')+' · '+esc(doc.updatedEmail||'')+'</small>':'<b>Chưa có tài liệu</b><small>Chỉ nhận một file PDF</small>')+'</div><div class="document-actions">'+(doc?'<a href="'+esc(doc.viewUrl)+'" target="_blank" rel="noopener">Xem</a><a href="'+esc(doc.downloadUrl||doc.viewUrl)+'" target="_blank" rel="noopener">Tải về</a>':'')+(canUpdate?'<button type="button" data-upload-document="'+type+'">'+(doc?'Cập nhật':'Tải lên')+'</button>':'')+'</div>'+documentHistoryHtml(doc)+'</article>'}).join('');
 return'<section class="documents-box"><div class="documents-head"><div><h3>Tài liệu đơn hàng</h3><small>File lưu trên Google Drive và chỉ chia sẻ theo email tài khoản.</small></div></div><div class="documents-grid">'+cards+'</div></section>';
}
function bindDocumentActions(o){$$('[data-upload-document]').forEach(function(b){b.onclick=function(){openDocumentUpload(o,b.dataset.uploadDocument)}})}
function fileBase64(file){return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(String(reader.result).split(',')[1]||'')};reader.onerror=function(){reject(new Error('Không đọc được file'))};reader.readAsDataURL(file)})}
function postDrive(payload){
 return new Promise(function(resolve,reject){
  var url=db.settings.documentUrl,token=db.settings.documentToken;if(!url||!token){reject(new Error('Chưa cấu hình Google Apps Script tài liệu.'));return}
  payload.token=token;payload.requestId=payload.requestId||uid();
  var frame=document.createElement('iframe'),name='gomita_drive_'+payload.requestId;frame.name=name;frame.style.display='none';
  var form=document.createElement('form');form.method='POST';form.action=url;form.target=name;form.style.display='none';
  var field=document.createElement('textarea');field.name='payload';field.value=JSON.stringify(payload);form.appendChild(field);
  var timer=setTimeout(done,120000,new Error('Google Drive phản hồi quá thời gian.'));
  function done(err,data){clearTimeout(timer);window.removeEventListener('message',onMessage);setTimeout(function(){frame.remove();form.remove()},100);if(err)reject(err);else resolve(data)}
  function onMessage(event){var data=event.data;if(!data||data.source!=='gomita-documents'||data.requestId!==payload.requestId)return;if(data.success)done(null,data);else done(new Error(data.error||'Google Drive từ chối yêu cầu.'))}
  window.addEventListener('message',onMessage);document.body.appendChild(frame);document.body.appendChild(form);form.submit();
 });
}
function openDocumentUpload(o,type){
 if(!user().email)return toast('Tài khoản chưa có email Google. Hãy liên hệ Admin cập nhật email.');
 if(!db.settings.documentUrl||!db.settings.documentToken)return toast('Admin chưa cấu hình Google Apps Script tài liệu.');
 var label=DOC_TYPES[type],current=o.documents[type];
 $('#quickTitle').textContent=(current?'Cập nhật ':'Tải lên ')+label;
 $('#quickBody').innerHTML='<div class="formcontent"><p class="handoff-note">Chỉ nhận một file PDF. File mới chỉ thay thế file cũ sau khi tải lên Google Drive thành công.</p><div class="field"><label>Chọn file PDF *</label><input type="file" name="documentFile" accept="application/pdf,.pdf" required></div><div id="documentUploadProgress"></div></div><div class="modalactions"><button value="cancel">Hủy</button><button type="button" id="saveDocumentUpload" class="primary">'+(current?'Cập nhật file':'Tải lên Drive')+'</button></div>';
 $('#quickDialog').showModal();
 $('#saveDocumentUpload').onclick=async function(){
  var input=$('#quickForm [name="documentFile"]'),file=input.files&&input.files[0];if(!file)return toast('Vui lòng chọn file PDF.');
  if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))return toast('Chỉ được tải file PDF.');
  if(file.size>20*1024*1024)return toast('File PDF không được lớn hơn 20 MB.');
  var button=$('#saveDocumentUpload'),progress=$('#documentUploadProgress');button.disabled=true;progress.innerHTML='<div class="upload-progress">Đang tải file lên Google Drive...</div>';setSaveStatus('saving','Đang tải tài liệu');
  try{
   var encoded=await fileBase64(file),result=await postDrive({action:'upload',orderId:o.id,orderCode:o.code||o.id,documentType:type,documentLabel:label,fileName:file.name,mimeType:'application/pdf',dataBase64:encoded,oldFileId:current&&current.fileId||'',allowedEmails:emailsForOrder(o)});
   var history=current&&current.history?current.history.slice():[];history.unshift({id:uid(),action:current?'Cập nhật '+label:'Tải lên '+label,version:Number(current&&current.version||0)+1,oldName:current&&current.name||'',newName:result.name||file.name,by:user().name,email:user().email,at:new Date().toISOString()});
   o.documents[type]={fileId:result.fileId,name:result.name||file.name,mimeType:'application/pdf',size:file.size,viewUrl:result.viewUrl,downloadUrl:result.downloadUrl,version:Number(current&&current.version||0)+1,updatedBy:user().name,updatedEmail:user().email,updatedAt:new Date().toISOString(),history:history};
   log(o,(current?'Cập nhật ':'Tải lên ')+label+': '+file.name);save();render();$('#quickDialog').close();openOrder(o.id,'info');setSaveStatus('done','Đã tải tài liệu');toast('Đã lưu '+label+' lên Google Drive');
  }catch(err){console.error(err);progress.innerHTML='<div class="upload-progress danger">'+esc(err.message)+'</div>';setSaveStatus('error','Lỗi tải tài liệu');button.disabled=false}
 };
}
async function syncOrderDocumentPermissions(o,silent){
 if(!db.settings.documentUrl||!db.settings.documentToken)return false;
 try{await postDrive({action:'permissions',orderId:o.id,orderCode:o.code||o.id,allowedEmails:emailsForOrder(o)});if(!silent)toast('Đã đồng bộ quyền tài liệu của đơn '+o.code);return true}catch(err){console.error(err);if(!silent)toast('Không đồng bộ được quyền Drive: '+err.message);return false}
}
async function syncAllDocumentPermissions(silent){
 if(!db.settings.documentUrl||!db.settings.documentToken){if(!silent)toast('Chưa cấu hình Google Apps Script tài liệu.');return}
 var btn=$('#syncDocumentPermissions');if(btn){btn.disabled=true;btn.textContent='Đang đồng bộ...'}
 var failed=0;for(var i=0;i<db.orders.length;i++){if(!await syncOrderDocumentPermissions(db.orders[i],true))failed++}
 if(btn){btn.disabled=false;btn.textContent='Đồng bộ quyền Drive'}if(!silent)toast(failed?'Có '+failed+' đơn chưa đồng bộ quyền.':'Đã đồng bộ quyền Google Drive');
}
applySaleNavigation();
if(!document.body.classList.contains('logged-out'))render();
})();
