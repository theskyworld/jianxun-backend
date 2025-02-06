import { Response } from "express";
import { sendResponse } from "../utils";

/**
 * @description 错误处理函数
 * @param err
 */
export default function errorHandler(err: unknown, res: Response, msg: string | Object) {
  // 写入错误日志
  // ...
  console.log(err);
  return sendResponse(res, 500, msg);
}
