import express from "express";
import { createComment, getComment, updateComment } from "../controllers/commentController";
const router = express.Router();

router.post("/create", createComment);
router.post("/update", updateComment);
router.get("/get", getComment);




export default router;
