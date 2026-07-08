// Xác nhận số công cuối cùng trước khi tính chính thức vào chi phí đơn hàng.
(function () {
  function canApproveLabor() {
    return ['Quản lý sản xuất', 'Giám đốc', 'Admin'].includes(user().role);
  }

  laborList = function (order, editable) {
    const rows = order.labor || [];
    if (!rows.length) return '<div class="empty">Chưa có công thực hiện.</div>';
    return rows.map((row) => {
      const amount = Number(row.days || 0) * Number(row.rate || 0) + Number(row.tripAllowance || 0);
      const pending = row.status !== 'Đã chốt';
      const statusClass = pending ? 'pending' : 'paid';
      return `<div class="listitem"><div><b>${esc(row.staff)} · ${esc(row.stage)}</b><br><small>${row.days || 0} công × ${money(row.rate)}${row.tripAllowance ? ' · Phụ phí ' + money(row.tripAllowance) : ''} · <span class="mini-pill ${statusClass}">${esc(row.status)}</span>${row.confirmedBy ? ' · Chốt bởi ' + esc(row.confirmedBy) : ''}</small></div><b>${money(amount)}</b><div class="row-actions">${pending && canApproveLabor() ? `<button class="primary" data-approve-labor="${row.id}">Chốt công</button>` : ''}${editable && canApproveLabor() ? `<button data-edit-labor="${row.id}">Sửa</button>` : ''}</div></div>`;
    }).join('');
  };

  function approveLabor(order, id) {
    const row = (order.labor || []).find((item) => item.id === id);
    if (!row || !canApproveLabor()) return toast('Bạn không có quyền chốt công.');
    if (Number(row.days || 0) <= 0) return toast('Số công phải lớn hơn 0 trước khi chốt.');
    if (!confirm(`Chốt ${row.days} công của ${row.staff}?`)) return;
    row.status = 'Đã chốt';
    row.confirmedBy = user().name;
    row.confirmedAt = new Date().toISOString();
    log(order, `Chốt công ${row.staff}: ${row.days} công · ${money(Number(row.days || 0) * Number(row.rate || 0) + Number(row.tripAllowance || 0))}`);
    save();
    render();
    openOrder(order.id, 'labor');
    toast('Đã chốt công và cập nhật chi phí đơn hàng');
  }

  const previousOpenOrder = openOrder;
  openOrder = function (id, tab = 'info') {
    previousOpenOrder(id, tab);
    if (tab !== 'labor') return;
    const order = id ? db.orders.find((row) => row.id === id) : null;
    if (!order) return;
    $$('[data-approve-labor]').forEach((button) => {
      button.onclick = () => approveLabor(order, button.dataset.approveLabor);
    });
  };
})();
