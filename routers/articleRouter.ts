import express from "express";
import {
  createArticle,
  getArticle,
  getArticleListByCreateTime,
  getArticleListByFollower,
  getArticleListBySelected,
  getRandomArticleList,
  updateArticle,
} from "../controllers/articleController";
const router = express.Router();

router.post("/create", createArticle);
router.post("/update", updateArticle);
router.get("/get", getArticle);
router.get("/getByFollower", getArticleListByFollower);
router.get("/getByCreateTime", getArticleListByCreateTime);
router.get("/getBySelected", getArticleListBySelected);
router.get("/random",getRandomArticleList)

export default router;
