// =========================================================================
// MÃ NGUỒN MẪU GOOGLE APPS SCRIPT WEB APP - GOMITA FLOW
// =========================================================================
// Hướng dẫn cài đặt:
// 1. Truy cập https://script.google.com/
// 2. Tạo một Dự án mới (New Project).
// 3. Xóa hết mã mặc định và dán toàn bộ mã nguồn bên dưới vào.
// 4. Bấm biểu tượng Lưu (Save).
// 5. Bấm nút "Triển khai" (Deploy) ở góc trên bên phải -> chọn "Triển khai mới" (New deployment).
// 6. Chọn loại cấu hình là "Ứng dụng web" (Web app).
// 7. Cấu hình các thông số sau:
//    - Description: Sao lưu Gomita Flow
//    - Execute as: Me (Tài khoản Google của bạn)
//    - Who has access: Anyone (Mọi người - để ứng dụng khách có thể gửi POST/GET)
// 8. Bấm "Triển khai" (Deploy). Google sẽ yêu cầu bạn cấp quyền truy cập Google Drive. Hãy bấm duyệt và đồng ý.
// 9. Copy URL ứng dụng web được cấp (đầu link có dạng https://script.google.com/macros/s/.../exec).
// 10. Dán URL này vào mục "Sao lưu Google Drive" ở tab "Tài khoản" trong phần mềm Gomita Flow và bấm Lưu.
// =========================================================================

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var folderName = "Gomita_Flow_Backups";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    
    // Tạo file backup mới định dạng JSON
    var fileName = "backup_" + new Date().toISOString().slice(0,10) + "_" + Date.now() + ".json";
    folder.createFile(fileName, JSON.stringify(data), MimeType.PLAIN_TEXT);
    
    // Dọn dẹp các bản sao lưu cũ hơn 30 ngày
    var files = folder.getFiles();
    var now = new Date().getTime();
    var limit = 30 * 24 * 60 * 60 * 1000; // 30 ngày (tính bằng mili giây)
    while (files.hasNext()) {
      var file = files.next();
      if (now - file.getDateCreated().getTime() > limit) {
        file.setTrashed(true); // Đưa vào thùng rác Google Drive
      }
    }
    return ContentService.createTextOutput(JSON.stringify({success: true, message: "Đã sao lưu thành công"})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({success: false, error: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var action = e.parameter.action;
    var folderName = "Gomita_Flow_Backups";
    var folders = DriveApp.getFoldersByName(folderName);
    if (!folders.hasNext()) {
      return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    }
    var folder = folders.next();
    
    // API: Lấy danh sách các bản sao lưu
    if (action === "list") {
      var files = folder.getFiles();
      var list = [];
      while (files.hasNext()) {
        var file = files.next();
        if (file.getName().endsWith(".json")) {
          list.push({
            id: file.getId(),
            name: file.getName(),
            created: file.getDateCreated().toISOString()
          });
        }
      }
      // Sắp xếp bản mới nhất lên đầu
      list.sort(function(a, b) { 
        return new Date(b.created).getTime() - new Date(a.created).getTime(); 
      });
      return ContentService.createTextOutput(JSON.stringify(list)).setMimeType(ContentService.MimeType.JSON);
    }
    
    // API: Lấy nội dung của một bản sao lưu cụ thể để khôi phục
    if (action === "get" && e.parameter.id) {
      var file = DriveApp.getFileById(e.parameter.id);
      return ContentService.createTextOutput(file.getAs("text/plain").getDataAsString()).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({error: "Yêu cầu không hợp lệ"})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}
