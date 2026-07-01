const LABOR_STAGES_V2=['Ra file','Sản xuất','Lắp đặt'];
const calcV1=calc;
calc=function(o){
  const c=calcV1(o),ar=(o.accessories||[]).reduce((s,x)=>s+Number(x.quantity||0)*Number(x.salePrice||0),0);
  const ac=(o.costs||[]).filter(x=>isCompanyExpense(x)&&(x.category||x.type)==='Phụ kiện').reduce((s,x)=>s+Number(x.amount||0),0);
  const pd=(o.costs||[]).filter(x=>isCompanyExpense(x)&&(x.category||x.type)!=='Phụ kiện').reduce((s,x)=>s+Number(x.amount||0),0);
  const pr=Number(o.quote||0)+c.customer,pc=pd+c.workshop+c.labor,pp=pr-pc,ap=ar-ac,r=pr+ar,p=pp+ap;
  return {...c,accessoryRevenue:ar,accessoryCost:ac,accessoryProfit:ap,productionRevenue:pr,productionCosts:pc,productionProfit:pp,revenue:r,costs:pc+ac,debt:r-c.confirmed,profit:p,margin:r?p/r*100:0};
};

function accessoryView(o,edit){
  const rows=o.accessories||[],c=calc(o);
  const body=rows.map(x=>'<tr><td><input class="accessory-name" data-acc="name" data-id="'+x.id+'" value="'+esc(x.name||'')+'" '+(edit?'':'disabled')+'></td><td><input type="number" min="0" step="0.01" data-acc="quantity" data-id="'+x.id+'" value="'+Number(x.quantity||0)+'" '+(edit?'':'disabled')+'></td><td><input data-acc="unit" data-id="'+x.id+'" value="'+esc(x.unit||'cái')+'" '+(edit?'':'disabled')+'></td><td><input type="number" min="0" data-acc="salePrice" data-id="'+x.id+'" value="'+Number(x.salePrice||0)+'" '+(edit?'':'disabled')+'></td><td><b>'+money(Number(x.quantity||0)*Number(x.salePrice||0))+'</b></td><td>'+(edit?'<button type="button" data-remove-accessory="'+x.id+'">Xóa</button>':'')+'</td></tr>').join('');
  return '<div class="pagehead"><div><h3>Phụ kiện báo khách</h3><small>Không bắt buộc. Chi phí mua phụ kiện lấy từ Khoản chi có nhóm “Phụ kiện”.</small></div>'+(edit?'<button type="button" class="primary" id="addAccessory">＋ Thêm dòng</button>':'')+'</div>'+(rows.length?'<table class="data accessory-table"><thead><tr><th>Tên phụ kiện</th><th>Số lượng</th><th>Đơn vị</th><th>Đơn giá báo khách</th><th>Thành tiền</th><th></th></tr></thead><tbody>'+body+'</tbody></table>':'<div class="empty">Đơn này không có phụ kiện. Bạn có thể bỏ qua mục này.</div>')+'<div class="accessory-total"><span>Doanh thu <b>'+money(c.accessoryRevenue)+'</b></span><span>Chi phí mua <b>'+money(c.accessoryCost)+'</b></span><span>Lãi phụ kiện <b class="'+(c.accessoryProfit<0?'danger':'')+'">'+money(c.accessoryProfit)+'</b></span></div>'+(edit&&rows.length?'<div class="archive-actions"><button type="button" class="primary" id="saveAccessories">Lưu bảng phụ kiện</button></div>':'');
}

const tabContentV1=tabContent;
tabContent=function(o,t,edit){
  if(t==='accessories')return accessoryView(o,edit);
  let h=tabContentV1(o,t,edit);
  if(t==='finance'){const c=calc(o);h+='<h3 class="sectiontitle">Lợi nhuận tách riêng</h3><div class="labor-breakdown"><div class="finbox"><small>Sản xuất</small><b>'+money(c.productionProfit)+'</b></div><div class="finbox"><small>Phụ kiện</small><b>'+money(c.accessoryProfit)+'</b></div><div class="finbox"><small>Tổng lợi nhuận</small><b>'+money(c.profit)+'</b></div></div>'}
  return h;
};

const openOrderV1=openOrder;
openOrder=function(id,tab='info'){
  openOrderV1(id,tab);
  if(!id&&tab==='info'){
    const source=$('#orderForm [name="source"]');
    if(source&&!Array.from(source.options).some(x=>x.value==='Chưa xác định'))source.insertAdjacentHTML('afterbegin','<option selected>Chưa xác định</option>');
    if(source)source.closest('.field').querySelector('label').textContent='Nguồn đơn hàng';
  }
  const o=id?db.orders.find(x=>x.id===id):null;if(!o)return;
  const tabs=$('#orderFormBody .tabs');
  if(tabs&&!tabs.querySelector('[data-tab="accessories"]')){tabs.querySelector('[data-tab="costs"]')?.insertAdjacentHTML('beforebegin','<button type="button" class="tab '+(tab==='accessories'?'active':'')+'" data-tab="accessories">Phụ kiện</button>');if(tab==='accessories')tabs.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab==='accessories'))}
  tabs?.querySelector('[data-tab="accessories"]')?.addEventListener('click',()=>openOrder(o.id,'accessories'));
  $('#addAccessory')?.addEventListener('click',()=>{o.accessories=o.accessories||[];o.accessories.push({id:uid(),name:'',quantity:1,unit:'cái',salePrice:0});openOrder(o.id,'accessories')});
  $$('[data-remove-accessory]').forEach(b=>b.onclick=()=>{o.accessories=(o.accessories||[]).filter(x=>x.id!==b.dataset.removeAccessory);log(o,'Xóa một dòng phụ kiện');render();openOrder(o.id,'accessories')});
  $('#saveAccessories')?.addEventListener('click',()=>{o.accessories=o.accessories||[];$$('[data-acc]').forEach(i=>{const x=o.accessories.find(a=>a.id===i.dataset.id);if(x)x[i.dataset.acc]=['quantity','salePrice'].includes(i.dataset.acc)?Number(i.value):i.value.trim()});o.accessories=o.accessories.filter(x=>x.name||x.salePrice||x.quantity!==1);log(o,'Cập nhật bảng phụ kiện báo khách');render();openOrder(o.id,'accessories');toast('Đã lưu bảng phụ kiện')});
  if(o.stage==='Hoàn công'&&!o.locked){const a=$('#orderFormBody .modalactions');if(a&&!a.querySelector('#archiveOrder'))a.insertAdjacentHTML('afterbegin','<button type="button" id="archiveOrder" class="primary">Lưu trữ đơn</button>');$('#archiveOrder')?.addEventListener('click',()=>archiveOrderV2(o))}
};

const saveOrderV2=saveOrder;
saveOrder=function(o,isExisting){
  const source=$('#orderForm [name="source"]');
  if(source&&!source.value){source.insertAdjacentHTML('afterbegin','<option selected>Chưa xác định</option>');o.source='Chưa xác định'}
  const result=saveOrderV2(o,isExisting);
  setTimeout(()=>{renderBoard();renderReports()},0);
  return result;
};

requestTransition=function(id,stage){
  const o=db.orders.find(x=>x.id===id);if(!o)return;if(stage==='Lưu trữ')return archiveOrderV2(o);
  const denied=transitionAllowed(o.stage,stage);if(denied)return toast(denied);
  if(o.stage==='Báo giá'&&stage==='Ra file'&&(!Number(o.estimate)||!Number(o.quote))){openOrder(o.id,'info');return toast('Chưa thể Ra file: bắt buộc nhập Dự toán và Giá báo khách.')}
  const done=o.stage,labor=LABOR_STAGES_V2.includes(done);
  const sale=stage==='Nghiệm thu'?'<div class="field span3"><label>Chuyển lại cho Sale</label><select name="saleOwner">'+db.users.filter(x=>x.active&&['Quản lý đơn hàng','Giám đốc','Admin'].includes(x.role)).map(x=>'<option '+(x.name===o.owner?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></div>':'';
  $('#quickTitle').textContent='Hoàn thành '+done+' → '+stage;
  $('#quickBody').innerHTML='<div class="formcontent"><p class="person-only-note">'+(labor?'Chọn nhân sự và nhập số công thực tế cho từng người.':'Công đoạn này chỉ ghi nhận người thực hiện, không tính công.')+'</p><div class="worker-list">'+db.staff.map(s=>'<label class="worker-row"><input type="checkbox" data-worker="'+esc(s.id)+'"><span class="worker-avatar">'+esc((s.name||'?')[0])+'</span><span class="worker-info"><b>'+esc(s.name)+'</b><small>'+esc(s.dept||'')+(labor?' · '+money(s.rate)+'/công':'')+'</small></span>'+(labor?'<span class="days-box"><input type="number" step="0.25" min="0" data-days="'+esc(s.id)+'" value="1"><em>công</em></span>':'')+'</label>').join('')+'</div><div class="grid transition-bottom">'+sale+'<div class="field span3"><label>Ghi chú</label><textarea name="note"></textarea></div></div></div><div class="modalactions"><button value="cancel">Hủy</button><button type="button" id="confirmTransition" class="primary">Xác nhận chuyển bước</button></div>';
  $('#quickDialog').showModal();
  $('#confirmTransition').onclick=()=>{const f=new FormData($('#quickForm')),workers=$$('#quickForm [data-worker]:checked').map(c=>({id:c.dataset.worker,days:labor?Number($('#quickForm [data-days="'+CSS.escape(c.dataset.worker)+'"]').value):0}));if(!workers.length)return toast('Hãy chọn ít nhất một người thực hiện.');if(labor&&workers.some(x=>!x.days||x.days<=0))return toast('Số công của từng nhân sự phải lớn hơn 0.');moveOrder(o,stage,{workers,note:f.get('note'),saleOwner:f.get('saleOwner'),countLabor:labor})};
};

moveOrder=function(o,stage,meta){
  const before=o.stage,people=meta.workers.map(w=>({...db.staff.find(s=>s.id===w.id),days:w.days})).filter(x=>x.name);
  o.stageAssignments=o.stageAssignments||[];o.stageAssignments.push({id:uid(),stage,completedStage:before,staff:people.map(x=>x.name),workers:meta.workers,note:meta.note,by:user().name,at:new Date().toISOString(),countLabor:meta.countLabor});
  if(meta.countLabor)people.forEach(x=>o.labor.push({id:uid(),stage:before,staff:x.name,days:x.days,rate:x.rate,tripAllowance:0,status:'Đã chốt',by:user().name,at:new Date().toISOString()}));
  o.stage=stage;if(stage==='Nghiệm thu'&&meta.saleOwner)o.owner=meta.saleOwner;log(o,'Hoàn thành '+before+', chuyển sang '+stage+' · '+people.map(x=>meta.countLabor?x.name+': '+x.days+' công':x.name).join(', '));$('#quickDialog').close();render();setTimeout(()=>{renderBoard();renderReports()},0);toast(meta.countLabor?'Đã chuyển bước và tính công':'Đã chuyển bước và ghi nhận người thực hiện');
};

function archiveOrderV2(o){
  const denied=transitionAllowed(o.stage,'Lưu trữ');if(denied)return toast(denied);
  const c=calc(o),pc=(o.costs||[]).filter(x=>isCompanyExpense(x)&&(x.paymentStatus||'Chờ kế toán xác nhận')!=='Đã thanh toán'),pi=(o.payments||[]).filter(x=>x.status!=='Đã xác nhận');
  if(c.debt>0||pc.length||pi.length)return toast('Chưa thể lưu trữ: còn '+money(c.debt)+' công nợ khách, '+pc.length+' khoản chi và '+pi.length+' khoản thu chưa xác nhận.');
  if(!confirm('Đơn đã đủ điều kiện. Chuyển vào khu vực Lưu trữ?'))return;o.stage='Lưu trữ';o.locked=true;log(o,'Kế toán chuyển đơn về Lưu trữ');$('#orderDialog')?.close();render();toast('Đã chuyển đơn vào Lưu trữ');
}

function renderArchiveV2(){
  const rows=db.orders.filter(o=>o.stage==='Lưu trữ').map(o=>{const c=calc(o);return '<tr data-archive-open="'+o.id+'"><td><b>'+esc(o.code)+'</b></td><td>'+esc(o.customer)+'</td><td>'+esc(o.owner)+'</td><td>'+money(c.productionRevenue)+'</td><td>'+money(c.accessoryRevenue)+'</td><td>'+money(c.profit)+'</td><td>'+fmtDate(o.due)+'</td></tr>'}).join('');
  $('#archiveContent').innerHTML=rows?'<table class="data"><thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Phụ trách</th><th>Doanh thu sản xuất</th><th>Doanh thu phụ kiện</th><th>Lợi nhuận</th><th>Ngày hẹn</th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class="empty-state"><div class="empty-icon">▣</div><h3>Chưa có đơn lưu trữ</h3><p>Đơn hoàn công sẽ xuất hiện tại đây sau khi Kế toán đối soát xong.</p></div>';
  $$('[data-archive-open]').forEach(x=>x.onclick=()=>openOrder(x.dataset.archiveOpen));
}
const renderBoardV1=renderBoard;
renderBoard=function(){renderBoardV1();$('#board [data-stage="Lưu trữ"]')?.remove();Array.from($('#statusFilter').options).find(x=>x.value==='Lưu trữ')?.remove();renderArchiveV2()};
$$('.nav').forEach(b=>b.onclick=()=>{if(b.dataset.view==='accounts'&&user().role!=='Admin')return toast('Chỉ Admin được quản lý tài khoản.');$$('.nav,.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#'+b.dataset.view+'View').classList.add('active');if(b.dataset.view==='archive')renderArchiveV2()});
if(db.currentUser&&user())render();
