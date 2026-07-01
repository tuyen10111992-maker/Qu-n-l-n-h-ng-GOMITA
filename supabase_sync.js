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

async function syncOrderToSupabase(o) {
  if (!sp) return;
  try {
    let { error } = await sp.from('app_orders').upsert(o);
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

let lastSyncState = { orders: {}, users: {}, staff: '' };

function hashObj(o) {
  return JSON.stringify(o);
}

function updateSyncState() {
  if(!window.db) return;
  if(db.orders) db.orders.forEach(o => lastSyncState.orders[o.id] = hashObj(o));
  if(db.users) db.users.forEach(u => lastSyncState.users[u.id] = hashObj(u));
  if(db.staff) lastSyncState.staff = hashObj(db.staff);
}

let syncTimeout = null;
function syncChangesToSupabase() {
  if(!sp || !window.db) return;
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
  }, 1000); // Debounce
}

async function syncFromSupabase() {
  if (!sp || !window.db) return;
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
    let cloudOrders = ordersRes.data || [];
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
