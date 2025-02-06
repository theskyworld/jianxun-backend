import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import expressAsyncHandler from "express-async-handler";
import { authUser, sendResponse } from "../utils";
import errorHandler from "../utils/errorHandler";

const prisma = new PrismaClient();

/**
 * @description 创建临时更新信息
 * @route /api/temp/create
 * @access Private
 * @header {
 *  Authorization token
 * }
 * @body {
 *  user_id 目标用户的id
 *  value 要更新的内容的新值或要被删除的值
 *  creator_id 创建该临时信息的用户id
 *  is_delete 是否删除，默认为false
 * }
 */
export const createTempUpdateInfo = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, verifiedInfo, user } = (await authUser(req, res)) || {};
      if (!token || !verifiedInfo || !user) return;

      const { user_id, value, creator_id, is_delete = false } = req.body;
      if (!user_id || !value || !creator_id)
        return sendResponse(res, 400, "目标用户id、新值、创建者id为必填项");
      const tempUpdateInfo = await prisma.tempUpdateInfo.create({
        data: {
          user_id,
          value,
          creator_id,
          is_delete,
        },
      });
      if (tempUpdateInfo)
        return sendResponse(res, 200, {
          msg: "设置成功",
          data: tempUpdateInfo,
        });
    } catch (err) {
      errorHandler(err, res, "设置失败");
    } finally {
      await prisma.$disconnect();
    }
  }
);
