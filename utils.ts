import { $Enums, PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import errorHandler from "./utils/errorHandler";

/**
 * @description 向前端发送响应内容
 * @param res  Response对象
 * @param code 响应码
 * @param data 响应体(数据)
 */
export function sendResponse(
  res: Response,
  code: number,
  data: any,
  json = false
) {
  if (typeof data === "string") {
    res.status(code);
    res.send({ code, msg: data });
  } else {
    if (!json) {
      res.status(code);
      res.send({
        code,
        ...data,
      });
    } else {
      res.status(code);
      res.json({
        code,
        ...data,
      });
    }
  }
}

/**
 * @description 生成随机uuid
 */

export function randomUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return c === "x" ? r.toString(16) : ((r & 0x3) | 0x8).toString(16);
  });
}

/**
 * @description 是否最后返回json格式的数据，使用res.json
 * @param req
 * @returns
 */
export const isReturnJson = (req: Request) => {
  if (!req.headers["content-type"]) return false;
  return req.headers["content-type"].includes("application/json");
};
/**
 * @description 校验用户是否登录(token是否合法)
 * @param req
 * @param res
 * @param next
 * @returns token verifiedInfo user
 */
export async function authUser(req: Request, res: Response) {
  const token = req.headers.authorization?.split(" ")[1];
  const prisma = new PrismaClient();
  if (!token) return sendResponse(res, 401, "未提供令牌");
  // 验证令牌是否有效
  // 无效令牌原因为：用户登出，令牌被添加至黑名单
  const blacklistedToken = await prisma.tokenBlacklist.findUnique({
    where: { token },
  });
  if (blacklistedToken) return sendResponse(res, 401, "无效令牌");
  const SECRET_KEY = process.env.SECRET_KEY!;
  try {
    const verifiedInfo = jwt.verify(token, SECRET_KEY) as { id: string };
    if (verifiedInfo) {
      const user = await prisma.user.findUnique({
        where: { id: verifiedInfo.id },
      });
      if (!user) return sendResponse(res, 400, "用户不存在");
      return {
        token,
        verifiedInfo,
        user,
      };
    }
  } catch (err) {
    // 令牌校验失败原因可能为：令牌过期等
    errorHandler(err, res, "令牌校验失败");
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * @description 字符串转数组
 * @param str 待转换的字符串
 * @param delimiter 分隔符
 * @returns 转换后的数组
 */
export function stringToArray(
  str: string | null,
  delimiter: string = ","
): string[] {
  if (!str) return [];
  return str.split(delimiter).map(item => item.trim());
}

/**
 * @description 对数据表中存储的数组类型的数据进行处理，依据旧的数据，返回新的数据
 * @param table 要被更新的数据表
 * @param key 数据表中的字段
 * @param value 新的值或者要被删除的值
 * @returns undefined 或者新的数据或者newValue
 */
// 1.原本值为null
// （1）增加：直接返回该新值（字符串）
// （2）删除：直接返回null
// 2.原本值不为null，为包含一个或多个值的字符串
// （1）增加：old + "," + new
// （2）删除：arr = old.split(",") arr.splice(arr.findIndex(i => i === value),1) arr.join(",")
export function getNewDataLikeArray<T>(
  table: any,
  key: string,
  value: any,
  isDelete: boolean = false
) {
  if (!value) return undefined;
  const oldStr = table[key];
  // 原本值为null
  if (!oldStr) {
    if (isDelete) return null;
    return value;
  }
  // 原本值不为null
  let arr = oldStr.split(",");
  // 删除
  if (isDelete) {
    arr.splice(
      arr.findIndex((i: string) => i === value),
      1
    );
    return arr.join(",");
  }

  // 增加
  return oldStr + "," + value;
}

/**
 * @description 处理临时更新信息，在用户例如登录获取进行用户信息页面获取用户信息时自动处理
 * @param user 更新前的目标用户
 * @return 更新完之后的目标用户
 */
type User = {
  id: string;
  name: string;
  avatar: string;
  password: string | null;
  phone: string | null;
  gender: $Enums.Gender | null;
  comment_list: string | null;
  collected_article_list: string | null;
  published_article_list: string | null;
  loved_article_list: string | null;
  follower_list: string | null;
  following_list: string | null;
  read_history_list: string | null;
};
export const handleTempUpdateInfo = async (
  user: User,
  res: Response,
  errMsg: string
) => {
  const prisma = new PrismaClient();

  try {
    let updatedUser;
    // 获取临时的更新信息，查看是否存在当前用户需要更新的内容
    const tempUpdateInfos = await prisma.tempUpdateInfo.findMany({
      where: {
        user_id: user.id,
      },
      // 按创建时间倒序
      orderBy: {
        create_time: "desc",
      },
    });
    // 逐个处理当前用户需要处理的更新信息
    if (tempUpdateInfos.length) {
      for (let i = 0; i < tempUpdateInfos.length; i++) {
        const tempUpdateInfo = tempUpdateInfos[i];
        updatedUser = await prisma.user.update({
          where: {
            id: user.id,
          },
          data: {
            following_list: getNewDataLikeArray(
              user,
              "following_list",
              tempUpdateInfo.value,
              tempUpdateInfo.is_delete
            ),
          },
        });
        if (!updatedUser) return;
        // 每处理完一条更新信息，删除对应的临时更新信息
        const deletedTempUpdateInfo = await prisma.tempUpdateInfo.delete({
          where: {
            id: tempUpdateInfo.id,
          },
        });
        if (!deletedTempUpdateInfo) return;
      }
    }
    return updatedUser;
  } catch (err) {
    errorHandler(err, res, errMsg);
  } finally {
    await prisma.$disconnect();
  }
};
