import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import expressAsyncHandler from "express-async-handler";
import { sendResponse } from "../utils";
import errorHandler from "../utils/errorHandler";
const prisma = new PrismaClient();

/**
 * @description 获取随机文章的贴图，该接口请求其他接口，而非自己数据库
 * @route /api/articleImage
 * @access Public
 */
export const getArticleImages = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 从articleImage数据表中请求随机的十条数据
      const result = await prisma.articleImage.findMany({
        take: 10,
      });
      sendResponse(res, 200, {
        msg: "请求成功",
        data: result.map(item => item.url),
      });
    } catch (err) {
      errorHandler(err, res, "远程接口错误");
    }
  }
);
