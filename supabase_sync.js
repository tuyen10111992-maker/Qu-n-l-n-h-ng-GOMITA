// Cấu hình kết nối Supabase
const SUPABASE_URL = "https://aivwwqbbqqspcxucuiha.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_j6goo6K8P56hr9vRFYhWsg_-H9_pl26";

let sp = null;
if (window.supabase) {
  sp = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function setSyncStatus(status, text) {
  let el = document.getElementById('saveStatus');
  if (!el) return;
  el.className = 'save-status ' + status;
  let span = el.querySelector('span');
  if (span) {
    span.textContent = text || (status === 'saving' ? 'Đang đồng bộ...' : status === 'done' ? 'Đã đồng bộ' : status === 'error' ? 'Lỗi đồng bộ' : status);
  }
}

// Hàm lọc các trường hợp lệ trước khi gửi lên Supabase
function sanitizeOrder(o) {
  const allowedColumns = [
    'id', 'code', 'customer', 'address', 'phone', 'content', 'stage', 'owner', 
    'priority', 'due', 'next', 'note', 'zalo', 'estimate', 'quote', 'locked', 
    'source', 'extras', 'payments', 'costs', 'labor', 'logs', 'deletedAt'
  ];
  let clean = {};
  allowedColumns.forEach(col => {
    if (o[col] !== undefined) {
      clean[col] = o[col];
    } else if (col === 'deletedAt') {
      clean.deletedAt = null;
    }
  });
  
  // Đồng bộ bảng phụ kiện thông qua cột accessoriesList (kiểu text trong Supabase)
  if (o.accessories) {
    clean.accessoriesList = JSON.stringify(o.accessories);
  } else {
    clean.accessoriesList = '[]';
  }
  
  return clean;
}

async function syncOrderToSupabase(o) {
  if (!sp) return;
  try {
    let cleanOrder = sanitizeOrder(o);
    let { error } = await sp.from('app_orders').upsert(cleanOrder);
    if (error) throw error;
  } catch (e) {
    console.error('Supabase order upsert failed:', e);
    setSyncStatus('error', 'Lỗi lưu đơn');
  }
}

async function syncUserToSupabase(u) {
  if (!sp) return;
  try {
    let data = { ...u };
    if (data.createdAt) {
      data.created_at = data.createdAt;
      delete data.createdAt;
    }
    let { error } = await sp.from('app_users').upsert(data);
    if (error) throw error;
  } catch (e) {
    console.error('Supabase user upsert failed:', e);
    setSyncStatus('error', 'Lỗi lưu tài khoản');
  }
}

async function syncStaffToSupabase(staffList) {
  if (!sp || !staffList || !staffList.length) return;
  try {
    let { error } = await sp.from('app_staff').upsert(staffList);
    if (error) throw error;
  } catch (e) {
    console.error('Supabase staff upsert failed:', e);
    setSyncStatus('error', 'Lỗi lưu nhân sự');
  }
}

async function deleteOrderFromSupabase(id) {
  if (!sp) return;
  setSyncStatus('saving', 'Đang xóa trên Cloud...');
  try {
    let { error } = await sp.from('app_orders').delete().eq('id', id);
    if (error) throw error;
    setSyncStatus('done', 'Đã xóa đơn hàng');
    setTimeout(()=> setSyncStatus('running', 'Đang chạy'), 2000);
  } catch (e) {
    console.error('Supabase order delete failed:', e);
    setSyncStatus('error', 'Lỗi xóa đám mây');
  }
}

let lastSyncState = { orders: {}, users: {}, staff: '' };

function hashObj(o) {
  return JSON.stringify(o);
}

function updateSyncState() {
  if (typeof db === 'undefined') return;
  if(db.orders) db.orders.forEach(o => lastSyncState.orders[o.id] = hashObj(o));
  if(db.users) db.users.forEach(u => lastSyncState.users[u.id] = hashObj(u));
  if(db.staff) lastSyncState.staff = hashObj(db.staff);
}

let syncTimeout = null;
function syncChangesToSupabase() {
  if(!sp || typeof db === 'undefined') return;
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    let changed = false;
    
    // Check orders
    if(db.orders) {
      for (let o of db.orders) {
        let h = hashObj(o);
        if (lastSyncState.orders[o.id] !== h) {
          changed = true;
          setSyncStatus('saving', 'Đang đẩy đơn hàng...');
          await syncOrderToSupabase(o);
          lastSyncState.orders[o.id] = h;
        }
      }
    }

    // Check users
    if(db.users) {
      for (let u of db.users) {
        let h = hashObj(u);
        if (lastSyncState.users[u.id] !== h) {
          changed = true;
          setSyncStatus('saving', 'Đang đẩy tài khoản...');
          await syncUserToSupabase(u);
          lastSyncState.users[u.id] = h;
        }
      }
    }

    // Check staff
    if(db.staff) {
      let staffHash = hashObj(db.staff);
      if (lastSyncState.staff !== staffHash) {
        changed = true;
        setSyncStatus('saving', 'Đang đẩy nhân sự...');
        await syncStaffToSupabase(db.staff);
        lastSyncState.staff = staffHash;
      }
    }
    
    if (changed) {
      setSyncStatus('done', 'Đã lưu đám mây');
      setTimeout(()=> setSyncStatus('running', 'Đang chạy'), 2000);
    }
  }, 300); // Rút ngắn thời gian delay để tránh bị reload ngắt quãng
}

async function syncFromSupabase() {
  if (!sp || typeof db === 'undefined') return;
  setSyncStatus('saving', 'Đang tải dữ liệu...');
  try {
    const [ordersRes, usersRes, staffRes] = await Promise.all([
      sp.from('app_orders').select('*'),
      sp.from('app_users').select('*'),
      sp.from('app_staff').select('*')
    ]);
    
    if (ordersRes.error) throw ordersRes.error;
    if (usersRes.error) throw usersRes.error;
    if (staffRes.error) throw staffRes.error;

    // Đối soát và gộp đơn hàng
    let localOrders = db.orders || [];
    let cloudOrders = (ordersRes.data || []).map(o => {
      // Phục hồi lại danh sách phụ kiện từ accessoriesList
      if (o.accessoriesList) {
        try {
          o.accessories = JSON.parse(o.accessoriesList);
        } catch (e) {
          o.accessories = [];
        }
        delete o.accessoriesList;
      } else {
        o.accessories = o.accessories || [];
      }
      return o;
    });
    let cloudOrdersMap = new Map(cloudOrders.map(o => [o.id, o]));
    
    let mergedOrders = [...cloudOrders];
    let toUploadOrders = [];
    
    localOrders.forEach(lo => {
      if (!cloudOrdersMap.has(lo.id)) {
        mergedOrders.push(lo);
        toUploadOrders.push(lo);
      }
    });
    db.orders = mergedOrders;

    // Đối soát và gộp tài khoản
    let localUsers = db.users || [];
    let cloudUsers = (usersRes.data || []).map(u => {
      if (u.created_at) {
        u.createdAt = u.created_at;
        delete u.created_at;
      }
      return u;
    });
    let cloudUsersMap = new Map(cloudUsers.map(u => [u.id, u]));
    
    let mergedUsers = [...cloudUsers];
    let toUploadUsers = [];
    
    localUsers.forEach(lu => {
      if (!cloudUsersMap.has(lu.id)) {
        mergedUsers.push(lu);
        toUploadUsers.push(lu);
      }
    });
    db.users = mergedUsers;

    // Đồng bộ nhân sự
    if (staffRes.data && staffRes.data.length > 0) {
      db.staff = staffRes.data;
    }
    
    // Cập nhật trạng thái đồng bộ cục bộ để tránh bị trigger push ngược lại ngay lập tức
    updateSyncState();
    
    if (typeof rawSave === 'function') {
      rawSave();
    } else {
      localStorage.setItem('gomita-flow-v1', JSON.stringify(db));
    }

    // Đẩy ngược các dữ liệu cục bộ chưa có trên Cloud lên Supabase
    if (toUploadOrders.length > 0) {
      console.log('Đang đẩy các đơn hàng nội bộ lên Supabase:', toUploadOrders);
      for (let o of toUploadOrders) {
        await syncOrderToSupabase(o);
      }
    }
    if (toUploadUsers.length > 0) {
      console.log('Đang đẩy các tài khoản nội bộ lên Supabase:', toUploadUsers);
      for (let u of toUploadUsers) {
        await syncUserToSupabase(u);
      }
    }
    
    if (typeof render === 'function') render();
    if (typeof renderBoard === 'function') renderBoard();
    if (typeof renderReports === 'function') renderReports();
    if (typeof renderAccounts === 'function') renderAccounts();
    
    setSyncStatus('done', 'Đã đồng bộ');
    setTimeout(()=> setSyncStatus('running', 'Đang chạy'), 2000);
  } catch (e) {
    console.error('Supabase pull failed:', e);
    setSyncStatus('error', 'Lỗi tải đám mây');
  }
}

function getDaysInTrash(o) {
  if (!o.deletedAt) return 0;
  return (Date.now() - new Date(o.deletedAt).getTime()) / (1000 * 60 * 60 * 24);
}

function restoreOrder(id) {
  let o = db.orders.find(x => x.id === id);
  if (!o) return;
  delete o.deletedAt;
  log(o, 'Khôi phục đơn hàng từ Thùng rác');
  render();
  toast('Đã khôi phục đơn hàng');
}

async function permanentDeleteOrder(id) {
  let o = db.orders.find(x => x.id === id);
  if (!o) return;
  if (getDaysInTrash(o) < 7) {
    return toast('Chưa đủ 7 ngày để xóa vĩnh viễn.');
  }
  if (!confirm(`Xóa vĩnh viễn đơn hàng ${o.code}? Thao tác này không thể khôi phục.`)) return;
  db.orders = db.orders.filter(x => x.id !== id);
  
  // Remove from lastSyncState so it doesn't trigger upsert
  delete lastSyncState.orders[id];
  
  // Save locally
  rawSave();
  render();
  
  // Delete from Supabase
  await deleteOrderFromSupabase(id);
}

function renderTrash() {
  let list = db.orders.filter(o => o.deletedAt);
  let rows = list.map(o => {
    let diff = getDaysInTrash(o);
    let canDel = diff >= 7;
    let left = Math.ceil(7 - diff);
    return `<tr>
      <td><b>${esc(o.code)}</b></td>
      <td>${esc(o.customer)}</td>
      <td>${esc(o.stage)}</td>
      <td>${new Date(o.deletedAt).toLocaleDateString('vi-VN')}</td>
      <td><span class="status-pill ${canDel ? 'active' : 'inactive'}">${canDel ? 'Đủ điều kiện' : 'Chờ ' + left + ' ngày'}</span></td>
      <td>
        <div class="row-actions">
          <button data-restore-order="${o.id}">Khôi phục</button>
          <button class="danger" data-perm-delete="${o.id}" ${canDel ? '' : 'disabled'}>Xóa vĩnh viễn</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  
  $('#trashContent').innerHTML = rows ? `<table class="data">
    <thead>
      <tr>
        <th>Mã đơn</th>
        <th>Khách hàng</th>
        <th>Trạng thái</th>
        <th>Ngày xóa</th>
        <th>Trạng thái xóa</th>
        <th>Thao tác</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>` : '<div class="empty">Thùng rác trống.</div>';
  
  $$('[data-restore-order]').forEach(b => b.onclick = () => restoreOrder(b.dataset.restoreOrder));
  $$('[data-perm-delete]').forEach(b => b.onclick = () => permanentDeleteOrder(b.dataset.permDelete));
}

// Hook vào hàm save() của ứng dụng
document.addEventListener('DOMContentLoaded', () => {
  // Thêm nút Đồng bộ Cloud vào thanh topbar
  const userDiv = document.querySelector('.topbar .user');
  if (userDiv) {
    userDiv.insertAdjacentHTML('beforebegin', `<button id="syncOnlineBtn" title="Tải dữ liệu mới nhất từ Cloud" style="margin-right: 15px; border: 1px solid var(--border); border-radius: 4px; padding: 4px 8px; font-size: 13px; cursor: pointer; background: white;">⟳ Tải Cloud</button>`);
    document.getElementById('syncOnlineBtn').addEventListener('click', () => {
      syncFromSupabase();
    });
  }

  // Đợi app.js load xong và khởi tạo xong
  setTimeout(() => {
    if (typeof save === 'function') {
      const originalSave = save;
      save = function() {
        originalSave();
        syncChangesToSupabase();
      };
      
      // Khởi động đồng bộ tự động kéo dữ liệu về
      syncFromSupabase();
    }
  }, 500); // Delay nhẹ để app.js gọi init() xong
});
