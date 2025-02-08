import express from "express";
import {
  findUser,
  getUser,
  login,
  loginWechat,
  logout,
  register,
  updateUser,
} from "../controllers/userController";
const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/login/wechat",loginWechat);
router.post("/logout", logout);
router.get("/get", getUser);
router.post("/update", updateUser);
router.get("/find", findUser);

export default router;
