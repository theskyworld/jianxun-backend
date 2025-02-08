import { PrismaClient } from "@prisma/client";
import axios from "axios";
import type { NextFunction, Request, Response } from "express";
import expressAsyncHandler from "express-async-handler";
import {
  authUser,
  getNewDataLikeArray,
  isReturnJson,
  randomUUID,
  sendResponse,
  stringToArray,
} from "../utils";
import {
  PAGE,
  PER_PAGE,
  REQUEST_APP_ID,
  REQUEST_APP_SECRET,
} from "../utils/constants";
import errorHandler from "../utils/errorHandler";

const prisma = new PrismaClient();

/**
 * @description 创建文章
 * @route POST /api/article/create
 * @header{
 *  Authorization token
 * }
 * @body {
 *  content 文章内容
 * }
 * @access Private
 */
export const createArticle = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, verifiedInfo, user } = (await authUser(req, res)) || {};
      if (!token || !verifiedInfo || !user) return;
      // 获取文章内容
      const { content } = req.body;
      if (!content) return sendResponse(res, 400, "文章内容为必填项");
      const article = await prisma.article.create({
        data: {
          id: randomUUID(),
          content,
          author_id: verifiedInfo.id,
        },
      });
      if (article) {
        // 向对应用户的article_list中添加该文章的id
        const newArticleList = getNewDataLikeArray(
          user,
          "published_article_list",
          article.id
        );
        const updatedUser = await prisma.user.update({
          where: {
            id: verifiedInfo.id,
          },
          data: {
            published_article_list: newArticleList,
          },
        });
        if (!updatedUser) return;
        return sendResponse(
          res,
          200,
          {
            msg: "文章创建成功",
            data: {
              ...article,
              comments: stringToArray(article.comments),
            },
          },
          isReturnJson(req)
        );
      }
    } catch (err) {
      errorHandler(err, res, "文章创建失败");
    } finally {
      await prisma.$disconnect();
    }
  }
);

/**
 * @description 更新文章，包括更新文章内容、点赞数量
 * @route POST /api/article/update
 * @header{
 *  Authorization token
 * }
 * @body {
 *  content 文章内容 可选
 *  vote_number 点赞数量 可选 每次点赞数量加1或减1
 * }
 * @param id 文章id
 * @access Private
 */
export const updateArticle = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, verifiedInfo, user } = (await authUser(req, res)) || {};
      if (!token || !verifiedInfo || !user) return;
      const { id } = req.query as { id: string };
      if (!id) return sendResponse(res, 400, "文章id为必填项");
      const article = await prisma.article.findUnique({
        where: {
          id,
        },
      });
      if (!article) return sendResponse(res, 400, "文章不存在");
      // 新文章内容
      const { content, vote_number } = req.body;
      if (vote_number && String(vote_number) !== "1")
        return sendResponse(res, 400, "点赞数量只能加1或减1");
      // 更新
      const newArticle = await prisma.article.update({
        where: {
          id,
        },
        data: {
          content,
          vote_number: vote_number
            ? article.vote_number! + parseInt(vote_number + "")
            : undefined,
        },
      });
      // 如果为更新文章点赞数量
      if (vote_number && newArticle) {
        // 更新对应用户的loved_article_list中添加该文章的id
        await prisma.user.update({
          where: {
            id: user.id,
          },
          data: {
            loved_article_list: getNewDataLikeArray(
              user,
              "loved_article_list",
              id
            ),
          },
        });
        sendResponse(
          res,
          200,
          {
            msg: "文章更新成功",
            data: {
              ...newArticle,
              comments: stringToArray(newArticle.comments),
            },
          },
          isReturnJson(req)
        );
      }
    } catch (err) {
      errorHandler(err, res, "文章更新失败");
    } finally {
      await prisma.$disconnect();
    }
  }
);

/**
 * @description 获取单篇文章
 * @route GET /api/article/get
 * @param id 文章id
 * @access Public
 */
export const getArticle = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.query as { id: string };
      if (!id) return sendResponse(res, 400, "文章id为必填项");
      const article = await prisma.article.findUnique({
        where: {
          id,
        },
      });
      if (!article) return sendResponse(res, 400, "文章不存在");
      sendResponse(
        res,
        200,
        {
          msg: "文章获取成功",
          data: {
            ...article,
            comments: stringToArray(article.comments),
          },
        },
        isReturnJson(req)
      );
    } catch (err) {
      errorHandler(err, res, "文章获取失败");
    } finally {
      await prisma.$disconnect();
    }
  }
);

/**
 * @description 获取当前用户的关注文章列表
 * @route GET /api/article/getByFollower
 * @header{
 *  Authorization token
 * }
 * @param {
 *  perpage 每页文章数 默认值为10
 *  page 当前页 默认值为1
 * }
 * @access Private
 */
export const getArticleListByFollower = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, verifiedInfo, user } = (await authUser(req, res)) || {};
      if (!token || !verifiedInfo || !user) return;
      const { perpage = PER_PAGE, page = PAGE } = req.query as {
        perpage: string;
        page: string;
      };
      // 获取当前用户的关注列表
      const followers = user.follower_list;
      if (!followers)
        return sendResponse(res, 404, {
          msg: "未找到关注列表",
          hasMore: false,
          data: [],
        });
      const followerIds = followers.split(",");
      const articles = await prisma.article.findMany({
        where: {
          author_id: { in: followerIds },
        },
        // 分页
        skip: (parseInt(page) - 1) * parseInt(perpage), // 跳过前perpage个。取第一页时，不跳过；取第二页时，跳过前perpage个...
        take: parseInt(perpage),
        // 按创建时间由近到远排序
        orderBy: { create_time: "desc" },
      });
      if (!articles.length)
        return sendResponse(res, 404, {
          msg: "无任何发布文章",
          hasMore: false,
          data: [],
        });
      sendResponse(
        res,
        200,
        {
          msg: "文章获取成功",
          hasMore: articles.length === parseInt(perpage),
          data: articles.map(item => ({
            ...item,
            comments: stringToArray(item.comments),
          })),
        },
        isReturnJson(req)
      );
    } catch (err) {
      errorHandler(err, res, { msg: "文章获取失败", hasMore: false, data: [] });
    } finally {
      await prisma.$disconnect();
    }
  }
);

/**
 * @description 获取最新的文章列表
 * @route GET /api/article/getByCreateTime
 * @param {
 *  perpage 每页文章数 默认值为10
 *  page 当前页 默认值为1
 * }
 * @access Public
 */
export const getArticleListByCreateTime = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { perpage = PER_PAGE, page = PAGE } = req.query as {
        perpage: string;
        page: string;
      };
      const articles = await prisma.article.findMany({
        // 分页
        skip: (parseInt(page) - 1) * parseInt(perpage),
        take: parseInt(perpage),
        // 按createAt创建时间由近到远排序
        orderBy: { create_time: "desc" },
      });
      if (!articles)
        return sendResponse(res, 404, {
          msg: "文章不存在",
          hasMore: false,
          data: [],
        });
      sendResponse(
        res,
        200,
        {
          msg: "文章获取成功",
          hasMore: articles.length === parseInt(perpage),
          data: articles.map(item => ({
            ...item,
            comments: stringToArray(item.comments),
          })),
        },
        isReturnJson(req)
      );
    } catch (err) {
      errorHandler(err, res, { msg: "文章获取失败", hasMore: false, data: [] });
    } finally {
      await prisma.$disconnect();
    }
  }
);

/**
 * @description 获取精选的文章列表
 * @route GET /api/article/getBySelected
 * @param {
 *  perpage 每页文章数 默认值为10
 *  page 当前页 默认值为1
 * }
 * @access Public
 */
export const getArticleListBySelected = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { perpage = PER_PAGE, page = PAGE } = req.query as {
        perpage: string;
        page: string;
      };
      const articles = await prisma.article.findMany({
        where: {
          selected: true,
        },
        // 分页
        skip: (parseInt(page) - 1) * parseInt(perpage),
        take: parseInt(perpage),
        // 按createAt创建时间由近到远排序
        orderBy: { create_time: "desc" },
      });
      if (!articles)
        return sendResponse(res, 404, {
          msg: "文章不存在",
          hasMore: false,
          data: [],
        });
      sendResponse(
        res,
        200,
        {
          msg: "文章获取成功",
          hasMore: articles.length === parseInt(perpage),
          data: articles.map(item => ({
            ...item,
            comments: stringToArray(item.comments),
          })),
        },
        isReturnJson(req)
      );
    } catch (err) {
      errorHandler(err, res, { msg: "文章获取失败", hasMore: false, data: [] });
    } finally {
      await prisma.$disconnect();
    }
  }
);

/**
 * @description 获取随机文章
 * @route /api/article/random
 * @access Public
 */
export const getRandomArticleList = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let randomTypeId = Math.ceil(Math.random() * 11);
      randomTypeId =
        randomTypeId === 4 || randomTypeId === 10 ? 7 : randomTypeId;
      const listResult = await axios.get(
        "https://www.mxnzp.com/api/story/list",
        {
          params: {
            type_id: randomTypeId,
            page: 1,
            app_id: REQUEST_APP_ID,
            app_secret: REQUEST_APP_SECRET,
          },
        }
      );
      if (listResult.status !== 200)
        return sendResponse(res, 500, listResult.data.msg || "获取失败");
      const randomArticleList = listResult.data.data;
      // console.log(randomArticleList);
      const responseData = [];
      for (let i = 0; i < randomArticleList.length; i++) {
        const articleResult = await axios.get(
          "https://www.mxnzp.com/api/story/details",
          {
            params: { 
              story_id: randomArticleList[i].storyId,
              app_id: REQUEST_APP_ID,
              app_secret: REQUEST_APP_SECRET,
            },
          }
        );
        if (articleResult.status !== 200) {
          return sendResponse(res, 500, articleResult.data.msg || "获取失败");
        }
        responseData.push(articleResult.data.data);
      }
      sendResponse(res, 200, { msg: "文章获取成功", data: responseData });
    } catch (err) {
      errorHandler(err, res, "文章获取失败");
    }
  }
);
