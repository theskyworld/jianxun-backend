import axios from "axios";
import type { NextFunction, Request, Response } from "express";
import expressAsyncHandler from "express-async-handler";
import { sendResponse } from "../utils";
import { ARTICLE_IMAGE_SECRET_KEY } from "../utils/constants";
import errorHandler from "../utils/errorHandler";

/**
 * @description 获取随机文章的贴图，该接口请求其他接口，而非自己数据库
 * @route /api/articleImage
 * @access Public
 */
export const getArticleImages = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 图片分类的id
      const idOne = "65237596189f860b7614d971";
      const idTwo = "6523757d466d417a37a40d75";
      const idThree = "6524adaffe975f09c72ce896";
      // 从三个url中分别请求的图片的数量，总累计10条
      const sourceOneCount = Math.floor(Math.random() * 5) + 1;
      const sourceTwoCount = Math.floor(Math.random() * 5) + 1;
      const sourceThreeCount = 10 - sourceOneCount - sourceTwoCount;
      const dataOne = (
        await axios.get(
          `https://tea.qingnian8.com/api/bizhi/wallList?access-key=${ARTICLE_IMAGE_SECRET_KEY}&pageSize=${sourceOneCount}&classid=${idOne}`
        )
      ).data.data.map(
        (item: { smallPicurl: string }) => item.smallPicurl
        // item.smallPicurl.replace("_small.webp", ".jpg") // 将小图地址进行替换得到大图地址
      );
      const dataTwo = (
        await axios.get(
          `https://tea.qingnian8.com/api/bizhi/wallList?access-key=${ARTICLE_IMAGE_SECRET_KEY}&pageSize=${sourceTwoCount}&classid=${idTwo}`
        )
      ).data.data.map(
        (item: { smallPicurl: string }) => item.smallPicurl
        // item.smallPicurl.replace("_small.webp", ".jpg") // 将小图地址进行替换得到大图地址
      );
      const dataThree = (
        await axios.get(
          `https://tea.qingnian8.com/api/bizhi/wallList?access-key=${ARTICLE_IMAGE_SECRET_KEY}&pageSize=${sourceThreeCount}&classid=${idThree}`
        )
      ).data.data.map(
        (item: { smallPicurl: string }) => item.smallPicurl
        // item.smallPicurl.replace("_small.webp", ".jpg") // 将小图地址进行替换得到大图地址
      );
      sendResponse(res, 200, {
        msg: "请求成功",
        data: [...dataOne, ...dataTwo, ...dataThree],
      });
    } catch (err) {
      errorHandler(err, res, "远程接口错误");
    }
  }
);
