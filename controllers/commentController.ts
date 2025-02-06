import { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import asyncHandler from "express-async-handler";
import {
  authUser,
  getNewDataLikeArray,
  isReturnJson,
  randomUUID,
  sendResponse,
} from "../utils";
import errorHandler from "../utils/errorHandler";

const prisma = new PrismaClient();

/**
 * @description 创建评论
 * @route POST /api/comment/create
 * @header{
 *  Authorization token
 * }
 * @body {
 *  content 评论内容
 *  article_id 文章id
 * }
 * @access Private
 */
export const createComment = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { content, article_id } = req.body;
      const { token, verifiedInfo, user } = (await authUser(req, res)) || {};
      if (!token || !verifiedInfo || !user) return;
      if (!content || !article_id) {
        return sendResponse(res, 400, "内容和文章id为必填项");
      }

      // 判断文章id的有效性
      const article = await prisma.article.findUnique({
        where: { id: article_id },
      });
      if (!article) return sendResponse(res, 400, "文章id错误");
      // 创建评论
      const comment = await prisma.comment.create({
        data: {
          id: randomUUID(),
          content,
          author_id: user.id,
          article_id,
        },
      });
      if (comment) {
        // 更新对应用户comment_list的值
        const newCommentList: string = getNewDataLikeArray(
          user,
          "comment_list",
          comment.id
        );
        const newUser = await prisma.user.update({
          where: {
            id: user.id,
          },
          data: {
            comment_list: newCommentList,
          },
        });
        if (newUser) {
          // 更新对应文章comments的值
          const newComments: string = getNewDataLikeArray(
            article,
            "comments",
            comment.id
          );
          const newArticle = await prisma.article.update({
            where: {
              id: article_id,
            },
            data: {
              comments: newComments,
            },
          });
          if (newArticle)
            sendResponse(
              res,
              200,
              {
                msg: "评论创建成功",
                data: comment,
              },
              isReturnJson(req)
            );
        }
      }
    } catch (err) {
      errorHandler(err,res,"评论创建失败")
    } finally {
      await prisma.$disconnect();
    }
  }
);

/**
 * @description 更新评论点赞数，不支持评论内容的更新
 * @route POST /api/comment/update
 * @header {
 *  Authorization token
 * }
 * @body {
 *  vote_number 文章点赞数 只能为加1或减1
 * }
 * @param {
 *  id 评论id
 * }
 * @access Private
 */
export const updateComment = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, verifiedInfo, user } = (await authUser(req, res)) || {};
      if (!token || !verifiedInfo || !user) return;
      const { vote_number } = req.body;
      const { id } = req.query as { id: string };

      if (!id || !vote_number) {
        return sendResponse(res, 400, "评论id和点赞数为必填项");
      }
      if(String(vote_number) !== "1") return sendResponse(res,400,"点赞数只能为加1或减1")
      // 检查对应的评论是否存在
      const comment = await prisma.comment.findUnique({
        where: {
          id,
        },
      });
      if (!comment) return sendResponse(res, 400, "评论不存在");
      // 更新
      const newComment = await prisma.comment.update({
        where: {
          id,
        },
        data: {
          vote_number: parseInt(vote_number + ""),
        },
      });

      if (newComment)
        sendResponse(
          res,
          200,
          {
            msg: "评论更新成功",
            data: newComment,
          },
          isReturnJson(req)
        );
    } catch (err) {
      errorHandler(err,res,"评论更新失败")
    } finally {
      await prisma.$disconnect();
    }
  }
);

/**
 * @description 获取单个评论详情
 * @route GET /api/comment/get
 * @param id 评论id
 * @access Public
 */
export const getComment = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.query as { id: string };
      // const { token, verifiedInfo, user } = (await authUser(req, res)) || {};
      // if (!token || !verifiedInfo || !user) return;
      if (!id) return sendResponse(res, 400, "id为必填项");
      // 检查对应的评论是否存在
      const comment = await prisma.comment.findUnique({
        where: {
          id,
        },
      });
      if (!comment) return sendResponse(res, 400, "评论不存在");
      sendResponse(res, 200, { msg: "获取评论成功", data: comment });
    } catch (err) {
      sendResponse(res, 500, "获取评论失败");
    } finally {
      await prisma.$disconnect();
    }
  }
);
