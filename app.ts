import bodyParser from "body-parser";
import { log } from "console";
import cors from "cors";
import express from "express";
import { getArticleImages } from "./controllers/articleImageController";
import { createTempUpdateInfo } from "./controllers/tempUpdateInfoController";
import articleRouter from "./routers/articleRouter";
import commentRouter from "./routers/commentRouter";
import userRouter from "./routers/userRouter";

const app = express();
app.use(cors());
const cache = require("apicache").middleware;
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// 用户信息相关
app.use("/api/user", userRouter);

// 文章相关
app.use("/api/article",cache("10 minutes"), articleRouter);

// 评论相关
app.use("/api/comment", commentRouter);

// 随机文章的贴图
app.get("/api/articleImage",cache("10 minutes"), getArticleImages);

// 临时更新信息
app.post("/api/temp/create", createTempUpdateInfo);


app.listen(9090, () => {
  log("服务启动,9090端口");
});
