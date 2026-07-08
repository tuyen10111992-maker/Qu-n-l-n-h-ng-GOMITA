// Phát sinh thu thêm của khách.
// Loại có mua/chi thêm tự tạo một khoản chi liên kết để Kế toán xử lý.
(function () {
  const previousCanAddData = canAddData;
  canAddData = function (type) {
    if (type === 'extras') return ['Quản lý đơn hàng', 'Giám đốc', 'Admin'].includes(user().role);
    return previousCanAddData(type);
  };

  function linkedCost(order, extra) {
    return (order.costs || []).find((cost) => cost.linkedExtraId === extra.id || cost.id === extra.costId);
  }

  function renderExtraList(order, editable) {
    const rows = order.extras || [];
    if (!rows.length) return '<div class="empty">Chưa có phát sinh thu thêm của khách.</div>';
    return rows.map((extra) => {
      const isPurchase = extra.extraKind === 'purchase';
      const cost = linkedCost(order, extra);
      const status = isPurchase ? (cost?.paymentStatus || 'Chờ kế toán xác nhận') : 'Không có khoản chi';
      const kind = isPurchase ? 'Có mua hoặc chi thêm' : 'Công việc làm thêm';
      return `<div class="expense-card"><div><b>${esc(extra.text || 'Phát sinh')}</b><div class="expense-meta"><span class="mini-pill">${kind}</span><span class="mini-pill">Thu khách: ${money(Number(extra.amount || 0))}</span>${isPurchase ? `<span class="mini-pill">Đã chi: ${money(Number(cost?.amount || extra.purchaseCost || 0))}</span><span class="mini-pill ${status === 'Đã thanh toán' ? 'paid' : 'pending'}">${esc(status)}</span>` : ''}</div><small>${extra.date ? fmtDate(extra.date) + ' · ' : ''}${esc(extra.by || '')}${extra.note ? ' · ' + esc(extra.note) : ''}</small></div><b>${money(Number(extra.amount || 0))}</b><div class="row-actions">${editable && canAddData('extras') ? `<button data-edit-extra="${extra.id}">Sửa</button><button data-delete-extra="${extra.id}">×</button>` : ''}</div></div>`;
    }).join('');
  }

  const previousTabContent = tabContent;
  tabContent = function (order, tab, editable) {
    if (tab !== 'extras') return previousTabContent(order, tab, editable);
    const rows = order.extras || [];
    const revenue = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const cost = rows.reduce((sum, row) => sum + Number(linkedCost(order, row)?.amount || 0), 0);
    const pending = rows.filter((row) => row.extraKind === 'purchase' && linkedCost(order, row)?.paymentStatus !== 'Đã thanh toán').length;
    return `<div class="pagehead"><div><h3>Phát sinh thu thêm</h3><small>Công việc hoặc khoản mua thêm ngoài giá báo khách và phụ kiện.</small></div>${editable && canAddData('extras') ? '<button type="button" class="primary" data-add="extras">＋ Thêm phát sinh</button>' : ''}</div>${renderExtraList(order, editable)}<div class="accessory-total"><span>Thu thêm khách <b>${money(revenue)}</b></span><span>Chi phát sinh <b>${money(cost)}</b></span><span>Lãi phát sinh <b>${money(revenue - cost)}</b></span>${pending ? `<span>Chờ kế toán <b>${pending} khoản</b></span>` : ''}</div>`;
  };

  function fields(extra = {}) {
    const kind = extra.extraKind || 'work';
    const cost = extra._cost || {};
    const payers = ['Công ty trả tiền', 'Nhân viên trả tiền cần công ty thanh toán', 'Khách tự trả tiền', 'Công ty trả tiền nhưng nợ NCC'];
    return `<div class="grid"><div class="field span3"><label>Loại phát sinh *</label><select name="extraKind"><option value="work" ${kind === 'work' ? 'selected' : ''}>Công việc làm thêm, không mua vật tư</option><option value="purchase" ${kind === 'purchase' ? 'selected' : ''}>Có mua hoặc chi thêm</option></select></div><div class="field span2"><label>Nội dung phát sinh *</label><input name="text" value="${esc(extra.text || '')}" required></div><div class="field"><label>Tiền thu thêm của khách *</label><input type="number" min="0" name="amount" value="${Number(extra.amount || 0)}" required></div><div class="field"><label>Ngày phát sinh</label><input type="date" name="date" value="${extra.date || today()}"></div><div class="field span2"><label>Ghi chú</label><input name="note" value="${esc(extra.note || '')}"></div><div data-purchase-fields class="field span3"><div class="grid"><div class="field"><label>Tiền thực tế đã chi *</label><input type="number" min="0" name="purchaseCost" value="${Number(cost.amount || extra.purchaseCost || 0)}"></div><div class="field"><label>Ai thanh toán?</label><select name="payer">${payers.map((value) => `<option ${value === (cost.payer || extra.payer) ? 'selected' : ''}>${value}</option>`)}</select></div><div class="field"><label>Công ty đang nợ ai?</label><input name="creditor" value="${esc(cost.creditor || extra.creditor || '')}" placeholder="Nhân viên hoặc nhà cung cấp"></div></div></div></div>`;
  }

  function bindKindVisibility() {
    const select = $('#quickForm [name="extraKind"]');
    const purchaseFields = $('#quickForm [data-purchase-fields]');
    if (!select || !purchaseFields) return;
    const refresh = () => { purchaseFields.style.display = select.value === 'purchase' ? 'block' : 'none'; };
    select.onchange = refresh;
    refresh();
  }

  function saveExtra(order, existing) {
    const form = new FormData($('#quickForm'));
    const kind = String(form.get('extraKind'));
    const text = String(form.get('text') || '').trim();
    const amount = Number(form.get('amount'));
    const purchaseCost = Number(form.get('purchaseCost'));
    const payer = String(form.get('payer') || 'Công ty trả tiền');
    const creditor = String(form.get('creditor') || '').trim();
    if (!text || amount <= 0) return toast('Vui lòng nhập nội dung và tiền thu thêm của khách.');
    if (kind === 'purchase' && purchaseCost <= 0) return toast('Vui lòng nhập tiền thực tế đã chi.');
    if (kind === 'purchase' && (payer.includes('Nhân viên') || payer.includes('nợ NCC')) && !creditor) return toast('Vui lòng nhập công ty đang nợ ai.');

    const extra = existing || { id: uid(), by: user().name, at: new Date().toISOString() };
    const oldCost = linkedCost(order, extra);
    Object.assign(extra, {
      text,
      amount,
      type: 'Khách trả',
      extraKind: kind,
      date: form.get('date') || today(),
      note: String(form.get('note') || ''),
      purchaseCost: kind === 'purchase' ? purchaseCost : 0
    });
    if (!existing) order.extras.push(extra);

    if (kind === 'purchase') {
      const cost = oldCost || {
        id: uid(),
        linkedExtraId: extra.id,
        expenseKind: 'Chi phát sinh',
        category: 'Chi phí khác',
        by: user().name,
        at: new Date().toISOString()
      };
      Object.assign(cost, {
        text: `Phát sinh: ${text}`,
        amount: purchaseCost,
        payer,
        creditor,
        note: extra.note,
        paymentStatus: 'Chờ kế toán xác nhận'
      });
      delete cost.confirmedBy;
      delete cost.confirmedAt;
      if (!oldCost) order.costs.push(cost);
      extra.costId = cost.id;
    } else if (oldCost) {
      order.costs = order.costs.filter((cost) => cost.id !== oldCost.id);
      delete extra.costId;
    }

    log(order, `${existing ? 'Cập nhật' : 'Thêm'} phát sinh thu khách: ${text} · ${money(amount)}`);
    save();
    render();
    $('#quickDialog').close();
    openOrder(order.id, 'extras');
    toast('Đã cập nhật phát sinh');
  }

  const previousQuickAdd = quickAdd;
  quickAdd = function (order, type) {
    if (type !== 'extras') return previousQuickAdd(order, type);
    if (!canAddData('extras')) return toast('Bạn không có quyền thêm phát sinh.');
    $('#quickTitle').textContent = 'Thêm phát sinh';
    $('#quickBody').innerHTML = `<div class="formcontent">${fields()}</div><div class="modalactions"><button value="cancel">Hủy</button><button type="button" id="quickSave" class="primary">Lưu phát sinh</button></div>`;
    $('#quickDialog').showModal();
    bindKindVisibility();
    $('#quickSave').onclick = () => saveExtra(order);
  };

  function editExtra(order, id) {
    const extra = (order.extras || []).find((row) => row.id === id);
    if (!extra) return;
    extra._cost = linkedCost(order, extra);
    $('#quickTitle').textContent = 'Sửa phát sinh';
    $('#quickBody').innerHTML = `<div class="formcontent">${fields(extra)}</div><div class="modalactions"><button value="cancel">Hủy</button><button type="button" id="quickSave" class="primary">Lưu sửa đổi</button></div>`;
    delete extra._cost;
    $('#quickDialog').showModal();
    bindKindVisibility();
    $('#quickSave').onclick = () => saveExtra(order, extra);
  }

  function deleteExtra(order, id) {
    if (!confirm('Xóa phát sinh này? Khoản chi liên kết (nếu có) cũng sẽ bị xóa.')) return;
    const extra = (order.extras || []).find((row) => row.id === id);
    const cost = extra && linkedCost(order, extra);
    order.extras = (order.extras || []).filter((row) => row.id !== id);
    if (cost) order.costs = (order.costs || []).filter((row) => row.id !== cost.id);
    log(order, 'Xóa phát sinh thu thêm của khách');
    save();
    render();
    openOrder(order.id, 'extras');
  }

  const previousEditExpense = editExpense;
  editExpense = function (order, id) {
    const cost = (order.costs || []).find((row) => row.id === id);
    if (cost?.linkedExtraId) return toast('Khoản chi này được tạo từ Phát sinh. Hãy sửa tại tab Phát sinh.');
    return previousEditExpense(order, id);
  };

  const previousOpenOrder = openOrder;
  openOrder = function (id, tab = 'info') {
    previousOpenOrder(id, tab);
    const order = id ? db.orders.find((row) => row.id === id) : null;
    const extraTab = $('[data-tab="extras"]');
    if (extraTab) extraTab.style.display = '';
    if (tab !== 'extras' || !order) return;
    $$('#orderFormBody .tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === 'extras'));
    const content = $('#orderFormBody .formcontent');
    if (content) content.innerHTML = tabContent(order, 'extras', canEdit(order));
    $$('[data-add="extras"]').forEach((button) => { button.onclick = () => quickAdd(order, 'extras'); });
    $$('[data-edit-extra]').forEach((button) => { button.onclick = () => editExtra(order, button.dataset.editExtra); });
    $$('[data-delete-extra]').forEach((button) => { button.onclick = () => deleteExtra(order, button.dataset.deleteExtra); });
  };
})();
