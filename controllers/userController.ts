import { PrismaClient } from "@prisma/client";
import axios from "axios";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import multer from "multer";
import {
  authUser,
  getNewDataLikeArray,
  handleTempUpdateInfo,
  isReturnJson,
  randomUUID,
  sendResponse,
  stringToArray,
  upload,
} from "../utils";
import {
  TOKEN_EXPIRES,
  USER_AVATAR_DEFAULT,
  USER_NAME_DEFAULT,
} from "../utils/constants";
import errorHandler from "../utils/errorHandler";
const prisma = new PrismaClient();
const SECRET_KEY = process.env.SECRET_KEY!;

// TODO 如果用户频繁登录，之前生成的未过期的认证token如何使其失效。再次登录前需要经历注销的过程，在注销中进行token的失效过程
// TODO 每次认证token时，除了将token中的例如id信息与用户提供的id进行比较外，如何进行token是否过期的判断
// TODO 认证token过期之后，如何结合刷新token再次生成新的token实现无感token刷新和认证成功

/**
 * @description 注册用户
 * @route POST /api/user/register
 * @body {
 *  name 用户名称 默认值为USER_NAME_DEFAULT
 *  avatar 用户头像url 默认值为USER_AVATAR_DEFAULT
 *  isPassword 是否密码注册 默认值为false
 *  phone 用户手机号 当isPassword为false时必填
 *  password 密码 当isPassword为true时必填
 * }
 * @access Public
 */
export const register = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        name = USER_NAME_DEFAULT,
        avatar = USER_AVATAR_DEFAULT,
        isPassword = false,
      } = req.body;
      // 非用户名密码注册(手机号注册)
      if (!isPassword) {
        const { phone } = req.body;
        if (!phone) return sendResponse(res, 400, "手机号为必填项");
        // 避免重复注册
        const existedUser = await prisma.user.findFirst({
          where: {
            phone,
          },
        });
        if (existedUser) return sendResponse(res, 401, "用户已注册");
        // TODO 发送并校验验证码
        // 注册用户
        const user = await prisma.user.create({
          data: {
            id: randomUUID(),
            name,
            phone,
            avatar,
          },
        });
        if (user) {
          sendResponse(
            res,
            200,
            {
              msg: "用户注册成功",
              data: {
                ...user,
                // 数组字符串转数组
                comment_list: stringToArray(user.comment_list),
                collected_article_list: stringToArray(
                  user.collected_article_list
                ),
                published_article_list: stringToArray(
                  user.published_article_list
                ),
                loved_article_list: stringToArray(user.loved_article_list),
                follower_list: stringToArray(user.follower_list),
                read_history_list: stringToArray(user.read_history_list),
                following_list: stringToArray(user.following_list),
              },
            },
            isReturnJson(req)
          );
        }
      } else {
        // 用户名密码注册
        const { password } = req.body;
        if (!name || !password)
          return sendResponse(res, 400, "用户名和密码为必填项");
        // 避免重复注册
        const existedUser = await prisma.user.findFirst({
          where: {
            name,
          },
        });
        if (existedUser) return sendResponse(res, 401, "用户已注册");
        // hash密码
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        // 注册用户
        const user = await prisma.user.create({
          data: {
            id: randomUUID(),
            name,
            password: hash,
            avatar,
          },
        });
        // 注册成功
        if (user) {
          sendResponse(
            res,
            200,
            {
              msg: "用户注册成功",
              data: {
                ...user,
                password: undefined,
              },
            },
            isReturnJson(req)
          );
        }
      }
    } catch (err) {
      errorHandler(err, res, "用户注册失败");
    } finally {
      await prisma.$disconnect();
    }
  }
);

/**
 * @description 用户登录
 * @route POST /api/user/login
 * @body {
 *  name 用户名称 默认值为USER_NAME_DEFAULT
 *  isPassword 是否密码注册 默认值为false
 *  phone 用户手机号 当isPassword为false时必填
 *  password 密码 当isPassword为true时必填
 * }
 * @access Public
 */
export const login = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { isPassword = false } = req.body;
      let existedUser;
      // 手机号登录
      if (!isPassword) {
        const { phone } = req.body;
        if (!phone) return sendResponse(res, 400, "手机号为必填项");
        // 判断手机号是否已注册
        existedUser = await prisma.user.findFirst({
          where: { phone },
        });
        if (!existedUser) return sendResponse(res, 401, "用户未注册");
        // TODO 发送校验验证码结果
        // ...
        const isCodeValid = true;
        if (!isCodeValid) return sendResponse(res, 401, "验证码错误");
      } else {
        // 用户名密码登录
        const { name = USER_NAME_DEFAULT, password } = req.body;
        if (!name || !password)
          return sendResponse(res, 400, "用户名和密码为必填项");
        // 判断用户名是否已注册
        existedUser = await prisma.user.findFirst({
          where: {
            name,
          },
        });
        if (!existedUser) return sendResponse(res, 401, "用户未注册");
        // 校验密码
        if (!existedUser.password)
          return sendResponse(res, 400, "用户未设置密码");
        const isMatch = await bcrypt.compare(password, existedUser.password);
        if (!isMatch) return sendResponse(res, 401, "用户名或密码错误");
      }
      if (!existedUser) return;
      // 生成token
      const token = jwt.sign(
        {
          id: existedUser.id,
        },
        SECRET_KEY,
        {
          expiresIn: TOKEN_EXPIRES,
        }
      );
      if (token) {
        // 登录成功
        // // 获取临时的更新信息，查看是否存在当前用户需要更新的内容
        // const tempUpdateInfos = await prisma.tempUpdateInfo.findMany({
        //   where: {
        //     user_id: existedUser.id,
        //   },
        //   // 按创建时间倒序
        //   orderBy: {
        //     create_time: "desc",
        //   },
        // });
        // // 逐个处理当前用户需要处理的更新信息
        // if (tempUpdateInfos.length) {
        //   let updatedUser;
        //   for (let i = 0; i < tempUpdateInfos.length; i++) {
        //     const tempUpdateInfo = tempUpdateInfos[i];
        //     updatedUser = await prisma.user.update({
        //       where: {
        //         id: existedUser.id,
        //       },
        //       data: {
        //         following_list: getNewDataLikeArray(
        //           existedUser,
        //           "following_list",
        //           tempUpdateInfo.value,
        //           tempUpdateInfo.is_delete
        //         ),
        //       },
        //     });
        //     if (!updatedUser) return;
        //     // 每处理完一条更新信息，删除对应的临时更新信息
        //     const deletedTempUpdateInfo = await prisma.tempUpdateInfo.delete({
        //       where: {
        //         id: tempUpdateInfo.id,
        //       },
        //     });
        //     if (!deletedTempUpdateInfo) return;
        //   }
        //   if(updatedUser) existedUser = updatedUser;
        // }

        const updatedUseer = await handleTempUpdateInfo(
          existedUser,
          res,
          "登录失败"
        );
        if (updatedUseer) existedUser = updatedUseer;
        sendResponse(
          res,
          200,
          {
            msg: "用户登录成功",
            token,
            data: {
              ...existedUser,
              password: undefined,
              // 数组字符串转数组
              comment_list: stringToArray(existedUser.comment_list),
              collected_article_list: stringToArray(
                existedUser.collected_article_list
              ),
              published_article_list: stringToArray(
                existedUser.published_article_list
              ),
              loved_article_list: stringToArray(existedUser.loved_article_list),
              follower_list: stringToArray(existedUser.follower_list),
              read_history_list: stringToArray(existedUser.read_history_list),
              following_list: stringToArray(existedUser.following_list),
            },
          },
          isReturnJson(req)
        );
      }
    } catch (err) {
      errorHandler(err, res, "用户登录失败");
    } finally {
      await prisma.$disconnect();
    }
  }
);

/**
 * @description 使用微信登录
 * @route POST /api/user/login/wechat
 * @body {
 *  code 微信登录code 必填
 * }
 * @access Public
 */
export const loginWechat = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code } = req.body;
      if (!code) return sendResponse(res, 400, "code为必填项");
      const { data } = await axios.get(
        "https://api.weixin.qq.com/sns/jscode2session",
        {
          params: {
            appid: process.env.WECHAT_APP_ID,
            secret: process.env.WECHAT_APP_SECRET,
            js_code: code,
            grant_type: "authorization_code",
          },
        }
      );
      // console.log(data);
      // 远程登录微信服务器失败
      if (data.errcode) return sendResponse(res, 500, data.errmsg);
      // 用户登录后的token通过login接口获取
      sendResponse(
        res,
        200,
        { msg: "用户登录成功", userSecret: data },
        isReturnJson(req)
      );
    } catch (err) {
      errorHandler(err, res, "微信登录失败");
    } finally {
      await prisma.$disconnect();
    }
  }
);

/**
 * @description 用户登出
 * @route POST /api/user/logout
 * @header {
 *  Authorization token
 * }
 * @access Private
 */
export const logout = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 验证token
      const { token, verifiedInfo, user } = (await authUser(req, res)) || {};
      if (!token || !verifiedInfo || !user)
        return sendResponse(res, 401, "用户校验失败");
      // 在这里可以实现token黑名单机制，将token加入黑名单
      const result = await prisma.tokenBlacklist.create({
        data: {
          token,
        },
      });
      if (!result) return;
      // 登出成功
      sendResponse(res, 200, "用户登出成功");
    } catch (err) {
      errorHandler(err, res, "用户登出失败");
    } finally {
      await prisma.$disconnect();
    }
  }
);

/**
 * @description 获取任意单个用户信息
 * @route GET /api/user/get
 * @param {
 *  id 用户id
 * }
 * @access Public
 */
export const getUser = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.query;
      if (!id || typeof id !== "string" || id === "undefined" || id === "null")
        return sendResponse(res, 400, "用户id为必填项");
      // 数据库中查找用户
      let targetUser = await prisma.user.findUnique({
        where: {
          id,
        },
      });
      if (!targetUser) return sendResponse(res, 400, "用户不存在");
      // 获取临时的更新信息，查看是否存在当前用户需要更新的内容
      const updatedUseer = await handleTempUpdateInfo(
        targetUser,
        res,
        "获取用户信息失败"
      );
      if (updatedUseer) targetUser = updatedUseer;
      sendResponse(
        res,
        200,
        {
          msg: "用户信息获取成功",
          data: {
            ...targetUser,
            password: undefined,
            // 数组字符串转数组
            comment_list: stringToArray(targetUser.comment_list),
            collected_article_list: stringToArray(
              targetUser.collected_article_list
            ),
            published_article_list: stringToArray(
              targetUser.published_article_list
            ),
            loved_article_list: stringToArray(targetUser.loved_article_list),
            follower_list: stringToArray(targetUser.follower_list),
            read_history_list: stringToArray(targetUser.read_history_list),
            following_list: stringToArray(targetUser.following_list),
          },
        },
        isReturnJson(req)
      );
    } catch (err) {
      errorHandler(err, res, "获取用户信息失败");
    } finally {
      await prisma.$disconnect();
    }
  }
);

/**
 * @description 更新当前用户信息
 * @route POST /api/user/update
 * @header {
 *  Authorization token
 * }
 * @body {
 *  name 用户名称 可选
 *  avatar 用户头像 可选
 *  password 用户密码 可选
 *  gender 用户性别 可选 0代表MALE 1代表FEMALE
//  TODO 该接口要注意上面的内容不能和isDelete为true一起使用，下面的内容如果isDelete为true，不能同时更新多个
 *  collectedArticleId     收藏文章id 可选
 *  lovedArticleId,        点赞文章id 可选
 *  followerUserId,        关注用户id 可选
 *  followingUserId,       粉丝用户id 可选
 *  isDelete 是否为删除操作 可选 默认值为false，表示增加
 * }
 * @access Private
 */
export const updateUser = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 取新的用户信息
      const {
        name,
        avatar,
        password,
        gender,
        collectedArticleId,
        lovedArticleId,
        publishedArticleId,
        readArticleId,
        followerUserId,
        followingUserId,
        isDelete = false,
      } = req.body;
      const { token, verifiedInfo, user } = (await authUser(req, res)) || {};
      if (!token || !verifiedInfo || !user)
        return sendResponse(res, 401, "用户校验失败");
      let genderVal: "MALE" | "FEMALE" | undefined;
      if (
        gender !== undefined &&
        (String(gender) === "0" || String(gender) === "1")
      ) {
        genderVal = String(gender) === "0" ? "MALE" : "FEMALE";
      }
      // 更新用户信息
      // 更新前要避免新的信息和旧的信息一致
      // 更新密码
      let hashedPassword;
      if (password) {
        const slat = await bcrypt.genSalt(10);
        hashedPassword = await bcrypt.hash(password, slat);
      }
      // 更改信息前避免对用户为更新的内容进行更改
      // 依次获取新的收藏文章列表、新的点赞文章列表、新的关注用户列表、新的粉丝用户列表
      let newCollectedArticleList: string = getNewDataLikeArray(
        user,
        "collected_article_list",
        collectedArticleId,
        isDelete
      );
      let newLovedArticleList: string = getNewDataLikeArray(
        user,
        "loved_article_list",
        lovedArticleId,
        isDelete
      );
      let newFollowerList: string = getNewDataLikeArray(
        user,
        "follower_list",
        followerUserId,
        isDelete
      );
      let newFollowingList: string = getNewDataLikeArray(
        user,
        "following_list",
        followingUserId,
        isDelete
      );
      let newPublishedArticleList: string = getNewDataLikeArray(
        user,
        "published_article_list",
        publishedArticleId,
        isDelete
      );
      let readHistoryList: string = getNewDataLikeArray(
        user,
        "read_history_list",
        readArticleId,
        isDelete
      );
      const newData = {
        name: name,
        avatar: avatar,
        gender: genderVal,
        password: hashedPassword,
        collected_article_list: newCollectedArticleList,
        loved_article_list: newLovedArticleList,
        published_article_list: newPublishedArticleList,
        read_history_list: readHistoryList,
        follower_list: newFollowerList,
        following_list: newFollowingList,
      };
      const newUser = await prisma.user.update({
        where: {
          id: verifiedInfo!.id,
        },
        data: newData,
      });

      if (newUser)
        return sendResponse(
          res,
          200,
          {
            msg: "用户信息更新成功",
            data: {
              ...newUser,
              password: undefined,
              comment_list: stringToArray(newUser.comment_list),
              collected_article_list: stringToArray(
                newUser.collected_article_list
              ),
              published_article_list: stringToArray(
                newUser.published_article_list
              ),
              loved_article_list: stringToArray(newUser.loved_article_list),
              follower_list: stringToArray(newUser.follower_list),
              read_history_list: stringToArray(newUser.read_history_list),
              following_list: stringToArray(newUser.following_list),
            },
          },
          isReturnJson(req)
        );
    } catch (err) {
      errorHandler(err, res, "修改用户信息失败");
    } finally {
      await prisma.$disconnect();
    }
  }
);

/**
 * @description 判断是否存在用户
 * @route GET /api/user/find
 * @param {
 *  name 用户名称
 *  phone 用户手机号 必填
 * }
 * @access Public
 */
export const findUser = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { phone, name } = req.query;
    if (!phone && !name)
      return sendResponse(res, 401, "手机号或者用户名称为必填项");
    try {
      if (name) {
        prisma.user
          .findFirst({
            where: { name: String(name) },
          })
          .then(result => {
            if (result)
              sendResponse(
                res,
                200,
                { msg: "用户存在", data: true },
                isReturnJson(req)
              );
            else
              sendResponse(
                res,
                200,
                { msg: "用户不存在", data: false },
                isReturnJson(req)
              );
          })
          .catch(() => {
            sendResponse(res, 500, "查询失败");
          });
      } else if (phone) {
        prisma.user
          .findFirst({
            where: { phone: String(phone) },
          })
          .then(result => {
            if (result)
              sendResponse(
                res,
                200,
                { msg: "用户存在", data: true },
                isReturnJson(req)
              );
            else
              sendResponse(
                res,
                200,
                { msg: "用户不存在", data: false },
                isReturnJson(req)
              );
          })
          .catch(() => {
            sendResponse(res, 500, "查询失败");
          });
      }
    } catch (err) {
      errorHandler(err, res, "查询用户失败");
    } finally {
      await prisma.$disconnect();
    }
  }
);

// TODO 添加一个通过用户名判断是否已注册的接口，用于前端用户输入完成用户名时(onblur)判断当前用户名是否可用


/**
 * @description 上传用户头像
 * @route POST /api/user/upload
 * @access Private
 */
export const uploadFile = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 验证token
      const { token, verifiedInfo, user } = (await authUser(req, res)) || {};
      if (!token || !verifiedInfo || !user)
        return sendResponse(res, 401, "用户校验失败");

      upload(req, res, async function (err) {
        if (err instanceof multer.MulterError) {
          // multer错误
          return sendResponse(res, 400, {
            errMsg: `上传失败: ${err.message}`,
            statusCode: 400,
          });
        } else if (err) {
          // 未知错误
          return sendResponse(res, 500, {
            errMsg: `上传失败: ${err.message}`,
            statusCode: 500,
          });
        }

        // 确保文件已上传
        if (!req.file) {
          return sendResponse(res, 400, {
            errMsg: "未检测到上传文件",
            statusCode: 400,
          });
        }

        // 获取其他表单数据
        const formData = req.body;

        // 返回成功响应
        sendResponse(res, 200, {
          statusCode: 200,
          data: {
            filename: req.file.filename,
            path: `/home/ubuntu/uploads/images/${req.file.filename}`, // 返回可访问的URL路径
            size: req.file.size,
            mimetype: req.file.mimetype,
            formData: formData, // 包含额外的表单数据
          },
        });
      });
    } catch (err) {
      errorHandler(err, res, "文件上传失败");
    } finally {
      await prisma.$disconnect();
    }
  }
);