function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getDisplayValues(); // 取得文字，避免時間格式跑掉
  var events = [];
  
  // 假如有資料的話（第一行當作表頭）
  if (data.length > 1) {
    var headers = data[0];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var event = {};
      for (var j = 0; j < headers.length; j++) {
        event[headers[j]] = row[j];
      }
      events.push(event);
    }
  }
  
  // 將資料回傳給前端
  return ContentService.createTextOutput(JSON.stringify(events))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var events = [];
  
  try {
    // 解析前端傳來的 POST 資料
    events = JSON.parse(e.postData.contents);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({"error": "無效的 JSON 資料"}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 清空整張工作表準備覆寫
  sheet.clear();
  
  // 建立表頭
  var headers = ["id", "title", "start", "end", "category"];
  sheet.appendRow(headers);
  
  // 將每一筆行程轉成陣列準備塞進儲存格
  var rows = [];
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    rows.push([
      ev.id || "", 
      ev.title || "", 
      ev.start || "", 
      ev.end || "", 
      ev.category || ""
    ]);
  }
  
  // 批次寫入資料可以大幅增加速度
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  
  return ContentService.createTextOutput(JSON.stringify({"status": "success"}))
    .setMimeType(ContentService.MimeType.JSON);
}