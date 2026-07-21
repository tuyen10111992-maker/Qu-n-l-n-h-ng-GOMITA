// GOOGLE APPS SCRIPT - TÀI LIỆU ĐƠN HÀNG GOMITA
// 1) Tạo một dự án mới tại https://script.google.com và dán toàn bộ file này.
// 2) Project Settings > Script Properties: tạo GOMITA_DOCUMENT_TOKEN với một chuỗi bí mật dài.
// 3) Deploy > New deployment > Web app.
//    Execute as: Me. Who has access: Anyone.
// 4) Sao chép URL /exec và nhập cùng mã bí mật vào phần Tài khoản của Gomita Flow.

var ROOT_FOLDER_NAME='GOMITA_DON_HANG';

function doGet(){
 return ContentService.createTextOutput(JSON.stringify({success:true,service:'Gomita Documents'})).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e){
 var payload={},requestId='';
 try{
  payload=JSON.parse((e.parameter&&e.parameter.payload)||(e.postData&&e.postData.contents)||'{}');
  requestId=String(payload.requestId||'');
  verifyToken_(payload.token);
  var result;
  if(payload.action==='upload')result=uploadDocument_(payload);
  else if(payload.action==='permissions')result=syncPermissions_(payload);
  else throw new Error('Hành động không hợp lệ.');
  result.success=true;result.source='gomita-documents';result.requestId=requestId;
  return iframeResponse_(result);
 }catch(err){
  return iframeResponse_({success:false,source:'gomita-documents',requestId:requestId,error:String(err&&err.message||err)});
 }
}

function verifyToken_(token){
 var expected=PropertiesService.getScriptProperties().getProperty('GOMITA_DOCUMENT_TOKEN');
 if(!expected)throw new Error('Chưa cấu hình GOMITA_DOCUMENT_TOKEN trong Script Properties.');
 if(!token||String(token)!==String(expected))throw new Error('Mã xác thực tài liệu không đúng.');
}

function iframeResponse_(data){
 var json=JSON.stringify(data).replace(/<\//g,'<\\/');
 var html='<!doctype html><html><head><meta charset="utf-8"></head><body><script>window.top.postMessage('+json+', "*");<\/script></body></html>';
 return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function safeName_(value,fallback){
 var name=String(value||fallback||'Tai_lieu').replace(/[\\\/:*?"<>|#%{}~&]/g,'_').replace(/\s+/g,' ').trim();
 return name.substring(0,160)||fallback||'Tai_lieu';
}

function rootFolder_(){
 var folders=DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
 return folders.hasNext()?folders.next():DriveApp.createFolder(ROOT_FOLDER_NAME);
}

function orderFolder_(payload){
 var root=rootFolder_(),folderName=safeName_(payload.orderCode||payload.orderId,'DON_HANG');
 var folders=root.getFoldersByName(folderName);
 var folder=folders.hasNext()?folders.next():root.createFolder(folderName);
 folder.setDescription('GOMITA_ORDER_ID='+String(payload.orderId||''));
 return folder;
}

function normalizedEmails_(emails){
 var seen={},out=[];
 (emails||[]).forEach(function(email){email=String(email||'').trim().toLowerCase();if(email&&email.indexOf('@')>0&&!seen[email]){seen[email]=true;out.push(email)}});
 return out;
}

function syncFolderViewers_(folder,emails){
 var wanted=normalizedEmails_(emails),map={};wanted.forEach(function(x){map[x]=true});
 var viewers=folder.getViewers();
 viewers.forEach(function(v){var email=String(v.getEmail()||'').toLowerCase();if(email&&!map[email]){try{folder.removeViewer(email)}catch(ignore){}}});
 wanted.forEach(function(email){try{folder.addViewer(email)}catch(err){throw new Error('Không cấp được quyền Drive cho '+email+': '+err.message)}});
 return wanted;
}

function syncPermissions_(payload){
 var folder=orderFolder_(payload),emails=syncFolderViewers_(folder,payload.allowedEmails||[]);
 return{folderId:folder.getId(),folderUrl:folder.getUrl(),sharedEmails:emails};
}

function uploadDocument_(payload){
 var mime=String(payload.mimeType||''),allowed={'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png'};
 if(!allowed[mime])throw new Error('Chỉ chấp nhận file PDF, JPG/JPEG hoặc PNG.');
 var encoded=String(payload.dataBase64||'');if(!encoded)throw new Error('Không có dữ liệu file.');
 if(encoded.length>28*1024*1024)throw new Error('File vượt quá giới hạn 20 MB.');
 var type=String(payload.documentType||'');if(['quote','contract','drawing','extraDoc'].indexOf(type)<0)throw new Error('Loại tài liệu không hợp lệ.');
 var folder=orderFolder_(payload),emails=syncFolderViewers_(folder,payload.allowedEmails||[]);
 var original=safeName_(payload.fileName,'tai-lieu'+allowed[mime]);if(!/\.(pdf|jpe?g|png)$/i.test(original))original+=allowed[mime];
 var prefix={quote:'BAO_GIA',contract:'HOP_DONG',drawing:'BAN_VE',extraDoc:'PHAT_SINH'}[type];
 var name=prefix+' - '+original;
 var blob=Utilities.newBlob(Utilities.base64Decode(encoded),mime,name);
 var file=folder.createFile(blob);
 file.setDescription('GOMITA_DOCUMENT_TYPE='+type);
 var files=folder.getFiles();
 while(files.hasNext()){
  var old=files.next();
  if(old.getId()!==file.getId()&&old.getDescription()==='GOMITA_DOCUMENT_TYPE='+type){try{old.setTrashed(true)}catch(ignore){}}
 }
 if(payload.oldFileId&&String(payload.oldFileId)!==file.getId()){
  try{DriveApp.getFileById(String(payload.oldFileId)).setTrashed(true)}catch(ignore){}
 }
 return{fileId:file.getId(),name:file.getName(),viewUrl:file.getUrl(),downloadUrl:'https://drive.google.com/uc?export=download&id='+file.getId(),folderId:folder.getId(),folderUrl:folder.getUrl(),sharedEmails:emails};
}
