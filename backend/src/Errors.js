/** 可預期的錯誤：回傳給前端 { ok:false, error:code, message, ...extra } */
class AppError extends Error {
  constructor(code, message, extra) {
    super(message);
    this.code = code;
    this.extra = extra || {};
  }
}

function fail_(code, message, extra) {
  throw new AppError(code, message, extra);
}
