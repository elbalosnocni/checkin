// Thay bằng ID File Google Sheet của bạn
var SPREADSHEET_ID = "1vBk4eHERPAQcAe3OLCGtwk5PlGRy1YIi3JHyFPe9-3M";
// Thay bằng ID thư mục lưu ảnh trên Drive của bạn
var FOLDER_ID = "19vAyddEQZtNlfjgQO2wR-1MtzxFCrSLt";

function doGet(e) {
  return ContentService.createTextOutput("Hệ thống điểm danh đang hoạt động.");
}

function doPost(e) {
  try {
    var dataJson = JSON.parse(e.postData.contents);
    var msnv = dataJson.msnv;
    var base64Data = dataJson.image;
    
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
    var data = sheet.getDataRange().getValues();
    
    var rowIndex = -1;
    var name = "";
    for (var i = 1; i < data.length; i++) {
      if (data[i][0].toString().trim() === msnv.trim()) {
        rowIndex = i + 1;
        name = data[i][1];
        break;
      }
    }
    
    if (rowIndex !== -1) {
      // Lưu ảnh vào Drive
      var folder = DriveApp.getFolderById(FOLDER_ID);
      var contentType = base64Data.substring(5, base64Data.indexOf(';'));
      var bytes = Utilities.base64Decode(base64Data.substr(base64Data.indexOf('base64,') + 7));
      var blob = Utilities.newBlob(bytes, contentType, msnv + "_" + name + ".jpg");
      var file = folder.createFile(blob);
      var fileUrl = file.getUrl();
      
      // Lưu vào Sheet cột E và F
      sheet.getRange(rowIndex, 5).setValue(new Date());
      sheet.getRange(rowIndex, 6).setValue(fileUrl);
    }
    
    return ContentService.createTextOutput(JSON.stringify({status: "success"}))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: error.toString()}))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}
